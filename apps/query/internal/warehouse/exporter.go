// Package warehouse streams a project's events to a customer's S3-compatible
// object store (S3, R2, GCS, MinIO) as newline-delimited JSON — the universal
// load format for Snowflake/BigQuery/Redshift/Databricks external tables. Each
// run exports events since a watermark cursor, so it's incremental and resumable.
package warehouse

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

type Exporter struct {
	db  *pgxpool.Pool
	ch  clickhouse.Conn
	log *zap.Logger
}

func New(db *pgxpool.Pool, ch clickhouse.Conn, log *zap.Logger) *Exporter {
	return &Exporter{db: db, ch: ch, log: log}
}

type config struct {
	id, projectID, endpoint, bucket, prefix, accessKey, secretKey string
	intervalMin                                                   int
	lastCursor                                                    time.Time
}

// Run ticks every minute and runs any export whose interval has elapsed.
func (e *Exporter) Run(ctx context.Context) {
	t := time.NewTicker(60 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			e.tick(ctx)
		}
	}
}

func (e *Exporter) tick(ctx context.Context) {
	rctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	rows, err := e.db.Query(rctx, `
		SELECT id::text, project_id::text, endpoint, bucket, COALESCE(prefix,'events'),
		       COALESCE(access_key,''), COALESCE(secret_key,''), interval_minutes, last_cursor
		FROM warehouse_exports
		WHERE enabled = true AND (last_run IS NULL OR last_run < now() - make_interval(mins => interval_minutes))
	`)
	if err != nil {
		return
	}
	var cfgs []config
	for rows.Next() {
		var c config
		if rows.Scan(&c.id, &c.projectID, &c.endpoint, &c.bucket, &c.prefix, &c.accessKey, &c.secretKey, &c.intervalMin, &c.lastCursor) == nil {
			cfgs = append(cfgs, c)
		}
	}
	rows.Close()
	for _, c := range cfgs {
		e.runExport(rctx, c)
	}
}

// RunByID exports one configured destination immediately ("run now").
func (e *Exporter) RunByID(ctx context.Context, id, projectID string) error {
	var c config
	err := e.db.QueryRow(ctx, `
		SELECT id::text, project_id::text, endpoint, bucket, COALESCE(prefix,'events'),
		       COALESCE(access_key,''), COALESCE(secret_key,''), interval_minutes, last_cursor
		FROM warehouse_exports WHERE id = $1 AND project_id = $2
	`, id, projectID).Scan(&c.id, &c.projectID, &c.endpoint, &c.bucket, &c.prefix, &c.accessKey, &c.secretKey, &c.intervalMin, &c.lastCursor)
	if err != nil {
		return err
	}
	return e.runExport(ctx, c)
}

func (e *Exporter) runExport(ctx context.Context, c config) error {
	n, newCursor, err := e.exportBatch(ctx, c)
	status := "ok"
	if err != nil {
		status = "error: " + err.Error()
		e.log.Warn("warehouse export failed", zap.String("bucket", c.bucket), zap.Error(err))
		_, _ = e.db.Exec(ctx, `UPDATE warehouse_exports SET last_run = now(), last_status = $1 WHERE id = $2`, status, c.id)
		return err
	}
	_, _ = e.db.Exec(ctx,
		`UPDATE warehouse_exports SET last_run = now(), last_status = $1, last_cursor = $2,
		 rows_exported = rows_exported + $3 WHERE id = $4`,
		fmt.Sprintf("exported %d rows", n), newCursor, n, c.id)
	return nil
}

// exportBatch pulls events newer than the cursor, writes them as NDJSON to the
// destination, and returns the row count + advanced cursor.
func (e *Exporter) exportBatch(ctx context.Context, c config) (int64, time.Time, error) {
	// Half-open window (lastCursor, upper]. upper is a query instant with a small
	// lag buffer (so in-flight Kafka events aren't skipped); the cursor advances to
	// upper — NOT to the max row time — so boundary rows never re-export regardless
	// of DateTime64↔timestamptz binding precision.
	upper := time.Now().Add(-5 * time.Second).UTC()
	if !upper.After(c.lastCursor) {
		return 0, c.lastCursor, nil // nothing could be in the window yet
	}
	rows, err := e.ch.Query(ctx, `
		SELECT event_time, event_type, user_id, device_id, session_id,
		       properties, user_properties, country, region, city,
		       platform, os_name, browser, device_type,
		       utm_source, utm_medium, utm_campaign, referrer
		FROM amplitude.events
		WHERE project_id = ? AND event_time > ? AND event_time <= ?
		ORDER BY event_time
		LIMIT 500000
	`, c.projectID, c.lastCursor, upper)
	if err != nil {
		return 0, c.lastCursor, err
	}
	defer rows.Close()

	var buf bytes.Buffer
	var n int64
	enc := json.NewEncoder(&buf)
	for rows.Next() {
		var t time.Time
		var et, uid, did, sid, props, uprops, country, region, city, plat, os, br, dt, us, um, uc, ref string
		if rows.Scan(&t, &et, &uid, &did, &sid, &props, &uprops, &country, &region, &city, &plat, &os, &br, &dt, &us, &um, &uc, &ref) != nil {
			continue
		}
		_ = enc.Encode(map[string]any{
			"event_time": t.UTC().Format(time.RFC3339Nano), "event_type": et,
			"user_id": uid, "device_id": did, "session_id": sid,
			"event_properties": json.RawMessage(orEmpty(props)), "user_properties": json.RawMessage(orEmpty(uprops)),
			"country": country, "region": region, "city": city,
			"platform": plat, "os_name": os, "browser": br, "device_type": dt,
			"utm_source": us, "utm_medium": um, "utm_campaign": uc, "referrer": ref,
		})
		n++
	}
	if n == 0 {
		return 0, upper, nil // empty window; still advance the watermark
	}

	client, err := s3Client(c)
	if err != nil {
		return 0, c.lastCursor, err
	}
	key := fmt.Sprintf("%s/%s/%s.jsonl", strings.Trim(c.prefix, "/"), c.projectID, upper.Format("20060102T150405.000000000"))
	_, err = client.PutObject(ctx, c.bucket, key, bytes.NewReader(buf.Bytes()), int64(buf.Len()),
		minio.PutObjectOptions{ContentType: "application/x-ndjson"})
	if err != nil {
		return 0, c.lastCursor, err
	}
	return n, upper, nil
}

func orEmpty(s string) string {
	if s == "" {
		return "{}"
	}
	return s
}

func s3Client(c config) (*minio.Client, error) {
	host := strings.TrimPrefix(strings.TrimPrefix(c.endpoint, "https://"), "http://")
	secure := !strings.HasPrefix(c.endpoint, "http://")
	cl, err := minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(c.accessKey, c.secretKey, ""),
		Secure: secure,
		Region: "auto",
	})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if ok, _ := cl.BucketExists(ctx, c.bucket); !ok {
		if mkErr := cl.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{}); mkErr != nil {
			return nil, mkErr
		}
	}
	return cl, nil
}

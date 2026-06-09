// Package replay provides a storage-agnostic backend for session recordings.
// It defaults to a free ClickHouse blob store and transparently upgrades to
// S3/Cloudflare-R2 object storage (with a ClickHouse index) when configured.
package replay

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

type SessionMeta struct {
	SessionID  string    `json:"session_id"`
	DistinctID string    `json:"distinct_id"`
	Started    time.Time `json:"started_at"`
	Ended      time.Time `json:"ended_at"`
	Chunks     uint64    `json:"chunks"`
}

type Store interface {
	Put(ctx context.Context, projectID, sessionID, distinctID string, eventsJSON []byte, count int) error
	List(ctx context.Context, projectID string) ([]SessionMeta, error)
	Events(ctx context.Context, projectID, sessionID string) ([]json.RawMessage, error)
	Delete(ctx context.Context, projectID, sessionID string) error
	Cleanup(ctx context.Context, before time.Time) error
	Backend() string
}

// New picks the object-storage backend when R2/S3 creds are present, else the
// free ClickHouse blob store.
func New(ch clickhouse.Conn, endpoint, accessKey, secretKey, bucket string, log *zap.Logger) Store {
	if endpoint != "" && accessKey != "" && secretKey != "" {
		s, err := newR2Store(ch, endpoint, accessKey, secretKey, bucket, log)
		if err == nil {
			log.Info("session replay using object storage", zap.String("bucket", bucket))
			return s
		}
		log.Warn("R2 init failed, falling back to ClickHouse store", zap.Error(err))
	}
	return &chStore{ch: ch}
}

// ── ClickHouse blob store (free, default) ───────────────────────────────────

type chStore struct{ ch clickhouse.Conn }

func (s *chStore) Backend() string { return "clickhouse" }

func (s *chStore) Put(ctx context.Context, projectID, sessionID, distinctID string, eventsJSON []byte, _ int) error {
	return s.ch.Exec(ctx,
		`INSERT INTO amplitude.session_replays (project_id, session_id, distinct_id, events) VALUES (?, ?, ?, ?)`,
		projectID, sessionID, distinctID, string(eventsJSON))
}

func (s *chStore) List(ctx context.Context, projectID string) ([]SessionMeta, error) {
	rows, err := s.ch.Query(ctx, `
		SELECT session_id, argMax(distinct_id, event_time) AS who,
		       min(event_time) AS started, max(event_time) AS ended, count() AS chunks
		FROM amplitude.session_replays WHERE project_id = ?
		GROUP BY session_id ORDER BY started DESC LIMIT 200
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (s *chStore) Events(ctx context.Context, projectID, sessionID string) ([]json.RawMessage, error) {
	rows, err := s.ch.Query(ctx, `
		SELECT events FROM amplitude.session_replays
		WHERE project_id = ? AND session_id = ? ORDER BY event_time ASC
	`, projectID, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all := []json.RawMessage{}
	for rows.Next() {
		var chunk string
		if rows.Scan(&chunk) != nil {
			continue
		}
		all = appendChunk(all, []byte(chunk))
	}
	return all, nil
}

func (s *chStore) Delete(ctx context.Context, projectID, sessionID string) error {
	return s.ch.Exec(ctx,
		`ALTER TABLE amplitude.session_replays DELETE WHERE project_id = ? AND session_id = ?`, projectID, sessionID)
}

func (s *chStore) Cleanup(ctx context.Context, before time.Time) error {
	return s.ch.Exec(ctx,
		`ALTER TABLE amplitude.session_replays DELETE WHERE event_time < ?`, before)
}

// ── R2 / S3 object store (production, opt-in) ───────────────────────────────

type r2Store struct {
	ch     clickhouse.Conn
	client *minio.Client
	bucket string
	log    *zap.Logger
}

func newR2Store(ch clickhouse.Conn, endpoint, accessKey, secretKey, bucket string, log *zap.Logger) (*r2Store, error) {
	host := strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	client, err := minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: true,
		Region: "auto", // Cloudflare R2
	})
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if exists, _ := client.BucketExists(ctx, bucket); !exists {
		if mkErr := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); mkErr != nil {
			return nil, mkErr
		}
	}

	// Index table maps each chunk to its object key (the blob lives in R2).
	_ = ch.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS amplitude.replay_index (
			project_id  String,
			session_id  String,
			distinct_id String,
			object_key  String,
			event_count UInt32,
			event_time  DateTime64(3, 'UTC') DEFAULT now64()
		) ENGINE = MergeTree ORDER BY (project_id, session_id, event_time)
	`)
	return &r2Store{ch: ch, client: client, bucket: bucket, log: log}, nil
}

func (s *r2Store) Backend() string { return "r2" }

func (s *r2Store) Put(ctx context.Context, projectID, sessionID, distinctID string, eventsJSON []byte, count int) error {
	// gzip the chunk before it leaves the process.
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	_, _ = gz.Write(eventsJSON)
	_ = gz.Close()

	key := projectID + "/" + sessionID + "/" + uuid.NewString() + ".json.gz"
	if _, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(buf.Bytes()), int64(buf.Len()),
		minio.PutObjectOptions{ContentType: "application/gzip", ContentEncoding: "gzip"}); err != nil {
		return err
	}
	return s.ch.Exec(ctx,
		`INSERT INTO amplitude.replay_index (project_id, session_id, distinct_id, object_key, event_count) VALUES (?, ?, ?, ?, ?)`,
		projectID, sessionID, distinctID, key, uint32(count))
}

func (s *r2Store) List(ctx context.Context, projectID string) ([]SessionMeta, error) {
	rows, err := s.ch.Query(ctx, `
		SELECT session_id, argMax(distinct_id, event_time) AS who,
		       min(event_time) AS started, max(event_time) AS ended, count() AS chunks
		FROM amplitude.replay_index WHERE project_id = ?
		GROUP BY session_id ORDER BY started DESC LIMIT 200
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (s *r2Store) Events(ctx context.Context, projectID, sessionID string) ([]json.RawMessage, error) {
	rows, err := s.ch.Query(ctx, `
		SELECT object_key FROM amplitude.replay_index
		WHERE project_id = ? AND session_id = ? ORDER BY event_time ASC
	`, projectID, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			keys = append(keys, k)
		}
	}

	all := []json.RawMessage{}
	for _, k := range keys {
		obj, err := s.client.GetObject(ctx, s.bucket, k, minio.GetObjectOptions{})
		if err != nil {
			continue
		}
		gz, err := gzip.NewReader(obj)
		if err != nil {
			obj.Close()
			continue
		}
		raw, _ := io.ReadAll(gz)
		gz.Close()
		obj.Close()
		all = appendChunk(all, raw)
	}
	return all, nil
}

func (s *r2Store) Delete(ctx context.Context, projectID, sessionID string) error {
	rows, err := s.ch.Query(ctx,
		`SELECT object_key FROM amplitude.replay_index WHERE project_id = ? AND session_id = ?`, projectID, sessionID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k string
			if rows.Scan(&k) == nil {
				_ = s.client.RemoveObject(ctx, s.bucket, k, minio.RemoveObjectOptions{})
			}
		}
	}
	return s.ch.Exec(ctx,
		`ALTER TABLE amplitude.replay_index DELETE WHERE project_id = ? AND session_id = ?`, projectID, sessionID)
}

func (s *r2Store) Cleanup(ctx context.Context, before time.Time) error {
	rows, err := s.ch.Query(ctx,
		`SELECT object_key FROM amplitude.replay_index WHERE event_time < ?`, before)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			_ = s.client.RemoveObject(ctx, s.bucket, k, minio.RemoveObjectOptions{})
		}
	}
	return s.ch.Exec(ctx, `ALTER TABLE amplitude.replay_index DELETE WHERE event_time < ?`, before)
}

// ── shared helpers ──────────────────────────────────────────────────────────

func scanSessions(rows interface {
	Next() bool
	Scan(...any) error
}) ([]SessionMeta, error) {
	out := []SessionMeta{}
	for rows.Next() {
		var m SessionMeta
		if rows.Scan(&m.SessionID, &m.DistinctID, &m.Started, &m.Ended, &m.Chunks) == nil {
			out = append(out, m)
		}
	}
	return out, nil
}

func appendChunk(all []json.RawMessage, raw []byte) []json.RawMessage {
	var part []json.RawMessage
	if json.Unmarshal(raw, &part) == nil {
		all = append(all, part...)
	}
	return all
}

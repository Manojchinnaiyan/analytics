package analytics

import (
	"context"
	"fmt"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2"
)

// Physical optimizations for inspectuser.events, applied idempotently on boot
// so existing deployments get them too (001_init.sql only runs on a fresh volume).
//
//  1. Hot JSON keys as MATERIALIZED columns. Web analytics / heatmaps filter and
//     group by properties.path etc. on every row; parsing JSON per row is the
//     main query cost. A materialized column is computed once at insert time.
//     The expressions are identical to the ones queries used, so results don't
//     change. Old parts are backfilled by a background MATERIALIZE COLUMN; until
//     that finishes ClickHouse computes the value on read, so it's correct immediately.
//  2. Bloom-filter skip indexes on ids looked up by value (session replay,
//     user timeline, GDPR) and on p_path (per-page heatmaps), so those skip
//     granules instead of scanning the whole project.
//  3. Codecs: Delta+ZSTD on timestamps, ZSTD(3) on the JSON blobs. New parts use
//     them right away; existing parts pick them up as they merge.

type matCol struct{ name, typ, expr string }

var eventMatCols = []matCol{
	{"p_path", "String", "JSONExtractString(properties, 'path')"},
	{"p_domain", "String", "JSONExtractString(properties, 'domain')"},
	{"p_referrer", "String", "JSONExtractString(properties, 'referrer')"},
	{"p_engaged_ms", "Int64", "JSONExtractInt(properties, 'engaged_ms')"},
	{"p_depth", "Int64", "JSONExtractInt(properties, 'depth')"},
}

type skipIdx struct{ name, expr, typ string }

var eventIndexes = []skipIdx{
	{"idx_session_id", "session_id", "bloom_filter(0.01) GRANULARITY 4"},
	{"idx_user_id", "user_id", "bloom_filter(0.01) GRANULARITY 4"},
	{"idx_device_id", "device_id", "bloom_filter(0.01) GRANULARITY 4"},
	{"idx_p_path", "p_path", "bloom_filter(0.01) GRANULARITY 4"},
}

var eventCodecs = map[string]string{ // column -> full type + codec
	"event_time":      "DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1))",
	"insert_time":     "DateTime64(3, 'UTC') DEFAULT now64() CODEC(Delta, ZSTD(1))",
	"properties":      "String DEFAULT '{}' CODEC(ZSTD(3))",
	"user_properties": "String DEFAULT '{}' CODEC(ZSTD(3))",
}

// EnsureEventSchema applies the optimizations above. Each step only runs when
// it's missing, so repeated boots are no-ops. Backfill mutations run async.
func EnsureEventSchema(ctx context.Context, conn clickhouse.Conn) error {
	existingCols, codecs, err := eventColumns(ctx, conn)
	if err != nil {
		return err
	}

	for _, c := range eventMatCols {
		if existingCols[c.name] {
			continue
		}
		if err := conn.Exec(ctx, fmt.Sprintf(
			`ALTER TABLE inspectuser.events ADD COLUMN IF NOT EXISTS %s %s MATERIALIZED %s`, c.name, c.typ, c.expr,
		)); err != nil {
			return fmt.Errorf("add column %s: %w", c.name, err)
		}
		if err := conn.Exec(ctx, `ALTER TABLE inspectuser.events MATERIALIZE COLUMN `+c.name); err != nil {
			return fmt.Errorf("materialize column %s: %w", c.name, err)
		}
	}

	existingIdx := map[string]bool{}
	rows, err := conn.Query(ctx,
		`SELECT name FROM system.data_skipping_indices WHERE database = 'inspectuser' AND table = 'events'`)
	if err != nil {
		return fmt.Errorf("list indexes: %w", err)
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		existingIdx[n] = true
	}
	rows.Close()
	for _, ix := range eventIndexes {
		if existingIdx[ix.name] {
			continue
		}
		if err := conn.Exec(ctx, fmt.Sprintf(
			`ALTER TABLE inspectuser.events ADD INDEX IF NOT EXISTS %s %s TYPE %s`, ix.name, ix.expr, ix.typ,
		)); err != nil {
			return fmt.Errorf("add index %s: %w", ix.name, err)
		}
		if err := conn.Exec(ctx, `ALTER TABLE inspectuser.events MATERIALIZE INDEX `+ix.name); err != nil {
			return fmt.Errorf("materialize index %s: %w", ix.name, err)
		}
	}

	for col, def := range eventCodecs {
		if strings.Contains(codecs[col], "ZSTD") {
			continue
		}
		if err := conn.Exec(ctx, fmt.Sprintf(`ALTER TABLE inspectuser.events MODIFY COLUMN %s %s`, col, def)); err != nil {
			return fmt.Errorf("set codec on %s: %w", col, err)
		}
	}
	return nil
}

func eventColumns(ctx context.Context, conn clickhouse.Conn) (map[string]bool, map[string]string, error) {
	rows, err := conn.Query(ctx,
		`SELECT name, compression_codec FROM system.columns WHERE database = 'inspectuser' AND table = 'events'`)
	if err != nil {
		return nil, nil, fmt.Errorf("list columns: %w", err)
	}
	defer rows.Close()
	cols, codecs := map[string]bool{}, map[string]string{}
	for rows.Next() {
		var n, c string
		if err := rows.Scan(&n, &c); err != nil {
			return nil, nil, err
		}
		cols[n], codecs[n] = true, c
	}
	return cols, codecs, rows.Err()
}

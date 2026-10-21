package analytics

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

// Hourly rollup of the raw events table.
//
// inspectuser.events_hourly holds one row per (project, event_type, hour) with
// the event count and a uniq() state of the resolved user identity. A
// materialized view fills it on every insert into events, so it stays current.
// Day/week/month charts merge hourly rows instead of scanning raw events.
//
// Counts are exact. Uniques use the same uniq() as the raw path, and uniq
// states merge correctly across hours (a user active in many hours counts once).
//
// Exact backfill handoff: the view only counts rows with insert_time >= cutoff,
// where cutoff is set ~1 minute in the future when the view is created. Once the
// cutoff has passed, one INSERT…SELECT backfills rows with insert_time < cutoff.
// Every row lands on exactly one side, with no race. (The worker leaves
// insert_time to its DEFAULT now64(), so it is the server's insert clock.)
// Backfilled rows are tagged src=1 so an interrupted backfill can be redone.
//
// Caveat: GDPR deletes on events don't propagate here, so a deleted user's past
// events still count in totals (the rollup holds counts and hashed uniq states,
// not raw IDs).

const (
	rollupTable = "inspectuser.events_hourly"
	rollupMV    = "inspectuser.mv_events_hourly"
	rollupState = "inspectuser.rollup_state"
	rollupName  = "events_hourly"
	cutoffDelay = 60 * time.Second
)

// rollupReady is true once the backfill is complete; until then segmentation
// reads raw events so charts never show partial numbers.
var rollupReady atomic.Bool

// RollupReady reports whether the hourly rollup is complete and queryable.
func RollupReady() bool { return rollupReady.Load() }

// EnsureRollups creates the hourly rollup and starts its one-time backfill.
// Safe to call on every boot. The backfill (if needed) runs in the background;
// errors are passed to onErr. Also drops the old unused daily view, whose
// uniques were wrong (uniq() counts in a SummingMergeTree get summed).
func EnsureRollups(ctx context.Context, conn clickhouse.Conn, onErr func(error)) error {
	for _, ddl := range []string{
		`CREATE TABLE IF NOT EXISTS ` + rollupTable + ` (
			project_id String,
			event_type String,
			hour       DateTime('UTC'),
			src        UInt8,
			events     SimpleAggregateFunction(sum, UInt64),
			users      AggregateFunction(uniq, String)
		) ENGINE = AggregatingMergeTree
		PARTITION BY toYYYYMM(hour)
		ORDER BY (project_id, event_type, hour, src)
		TTL hour + INTERVAL 2 YEAR`,
		`CREATE TABLE IF NOT EXISTS ` + rollupState + ` (
			name    String,
			cutoff  DateTime64(3, 'UTC'),
			done    UInt8,
			updated DateTime64(3, 'UTC') DEFAULT now64()
		) ENGINE = ReplacingMergeTree(updated) ORDER BY name`,
		`DROP VIEW IF EXISTS inspectuser.mv_daily_event_counts`,
	} {
		if err := conn.Exec(ctx, ddl); err != nil {
			return fmt.Errorf("rollup ddl: %w", err)
		}
	}

	var cutoff time.Time
	var done uint8
	err := conn.QueryRow(ctx,
		`SELECT cutoff, done FROM `+rollupState+` FINAL WHERE name = ?`, rollupName,
	).Scan(&cutoff, &done)
	noState := errors.Is(err, sql.ErrNoRows)
	if err != nil && !noState {
		return fmt.Errorf("read rollup state: %w", err)
	}
	if !noState && done == 1 {
		rollupReady.Store(true)
		return nil
	}

	if noState { // fresh start
		// Clear anything left without state (e.g. a manual drop), then create the
		// view with a cutoff in the future so the handoff is exact.
		if err := conn.Exec(ctx, `DROP VIEW IF EXISTS `+rollupMV); err != nil {
			return fmt.Errorf("drop stale rollup view: %w", err)
		}
		if err := conn.Exec(ctx, `TRUNCATE TABLE `+rollupTable); err != nil {
			return fmt.Errorf("truncate rollup: %w", err)
		}
		if err := conn.QueryRow(ctx,
			`SELECT now64(3, 'UTC') + toIntervalSecond(?)`, int(cutoffDelay.Seconds()),
		).Scan(&cutoff); err != nil {
			return fmt.Errorf("pick cutoff: %w", err)
		}
		if err := conn.Exec(ctx,
			`INSERT INTO `+rollupState+` (name, cutoff, done) VALUES (?, ?, 0)`, rollupName, cutoff,
		); err != nil {
			return fmt.Errorf("save rollup state: %w", err)
		}
		if err := conn.Exec(ctx, fmt.Sprintf(`
			CREATE MATERIALIZED VIEW %s TO %s AS
			SELECT project_id,
			       event_type,
			       toDateTime(toStartOfHour(event_time), 'UTC')     AS hour,
			       toUInt8(0)                                       AS src,
			       count()                                          AS events,
			       uniqState(if(user_id != '', user_id, device_id)) AS users
			FROM inspectuser.events
			WHERE insert_time >= toDateTime64('%s', 3, 'UTC')
			GROUP BY project_id, event_type, hour`,
			rollupMV, rollupTable, cutoff.UTC().Format("2006-01-02 15:04:05.000"),
		)); err != nil {
			return fmt.Errorf("create rollup view: %w", err)
		}
	}

	go func() {
		if err := backfill(conn, cutoff); err != nil {
			onErr(err)
		}
	}()
	return nil
}

// backfill waits for the cutoff to pass, clears any partial earlier attempt,
// copies every pre-cutoff event into the rollup, and marks it done.
func backfill(conn clickhouse.Conn, cutoff time.Time) error {
	// A few seconds past the cutoff so inserts stamped just before it have landed.
	time.Sleep(time.Until(cutoff) + 5*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
	defer cancel()
	ctx = clickhouse.Context(ctx, clickhouse.WithSettings(clickhouse.Settings{"mutations_sync": 2}))

	if err := conn.Exec(ctx, `ALTER TABLE `+rollupTable+` DELETE WHERE src = 1`); err != nil {
		return fmt.Errorf("clear partial backfill: %w", err)
	}
	if err := conn.Exec(ctx, `
		INSERT INTO `+rollupTable+`
		SELECT project_id,
		       event_type,
		       toDateTime(toStartOfHour(event_time), 'UTC') AS hour,
		       toUInt8(1),
		       count(),
		       uniqState(if(user_id != '', user_id, device_id))
		FROM inspectuser.events
		WHERE insert_time < ?
		GROUP BY project_id, event_type, hour`, cutoff,
	); err != nil {
		return fmt.Errorf("backfill rollup: %w", err)
	}
	if err := conn.Exec(ctx,
		`INSERT INTO `+rollupState+` (name, cutoff, done) VALUES (?, ?, 1)`, rollupName, cutoff,
	); err != nil {
		return fmt.Errorf("mark rollup done: %w", err)
	}
	rollupReady.Store(true)
	return nil
}

// canUseRollup reports whether a segmentation query can be answered from the
// hourly rollup: plain count/uniques/frequency over one event, no property
// filters, breakdown or cohort (those need raw rows), and an hour-aligned range.
func canUseRollup(q SegmentationQuery) bool {
	if !RollupReady() || q.GroupBy != "" || len(q.Filters) > 0 || q.CohortSQL != "" {
		return false
	}
	switch q.Metric {
	case "", "totals", "uniques", "frequency":
	default:
		return false
	}
	aligned := func(t time.Time) bool { return t.Equal(t.Truncate(time.Hour)) }
	return aligned(q.StartDate) && aligned(q.EndDate)
}

func rollupMetric(metric string) string {
	switch metric {
	case "uniques":
		return "toFloat64(uniqMerge(users))"
	case "frequency":
		return "toFloat64(sum(events)) / toFloat64(uniqMerge(users))"
	default:
		return "toFloat64(sum(events))"
	}
}

// rollupSQL builds the segmentation query against the hourly rollup. Same
// output shape (date, value) as the raw query, so the caller is unchanged.
func rollupSQL(q SegmentationQuery) string {
	m := rollupMetric(q.Metric)
	return fmt.Sprintf(`
		SELECT
			formatDateTime(toStartOf%s(hour), '%s') AS date,
			if(isNaN(%[3]s) OR isInfinite(%[3]s), 0, %[3]s) AS value
		FROM `+rollupTable+`
		WHERE project_id = ?
		  AND event_type = ?
		  AND hour >= ? AND hour < ?
		GROUP BY date
		ORDER BY date ASC
	`, granularityFunc(q.Granularity), dateFormatFor(q.Granularity), m)
}

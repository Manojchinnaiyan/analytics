package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Evaluator periodically checks every enabled alert rule against ClickHouse and
// fires a notification on the rising edge (not-triggered → triggered), so a
// sustained breach notifies once rather than every tick.
type Evaluator struct {
	db   *pgxpool.Pool
	ch   clickhouse.Conn
	log  *zap.Logger
	http *http.Client
}

func NewEvaluator(db *pgxpool.Pool, ch clickhouse.Conn, log *zap.Logger) *Evaluator {
	return &Evaluator{db: db, ch: ch, log: log, http: &http.Client{Timeout: 5 * time.Second}}
}

// Run ticks every minute until the context is cancelled.
func (e *Evaluator) Run(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	e.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.tick(ctx)
		}
	}
}

type rule struct {
	id          string
	projectID   string
	name        string
	eventType   string
	metric      string
	windowMin   int
	operator    string
	threshold   float64
	mode        string // threshold | change (vs prior equal window)
	webhookURL  string
	isTriggered bool
}

func (e *Evaluator) tick(ctx context.Context) {
	rctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	rows, err := e.db.Query(rctx, `
		SELECT id, project_id, name, event_type, metric, window_minutes, operator, threshold,
		       COALESCE(mode, 'threshold'), COALESCE(webhook_url, ''), is_triggered
		FROM alerts WHERE enabled = true
	`)
	if err != nil {
		e.log.Warn("alerts: load failed", zap.Error(err))
		return
	}
	var rules []rule
	for rows.Next() {
		var r rule
		if rows.Scan(&r.id, &r.projectID, &r.name, &r.eventType, &r.metric, &r.windowMin,
			&r.operator, &r.threshold, &r.mode, &r.webhookURL, &r.isTriggered) == nil {
			rules = append(rules, r)
		}
	}
	rows.Close()

	for _, r := range rules {
		e.evaluate(rctx, r)
	}
}

func (e *Evaluator) evaluate(ctx context.Context, r rule) {
	value := e.metricValue(ctx, r, 0)
	var triggered bool
	var msg string

	if r.mode == "change" {
		// Baseline mode: compare the current window to the immediately-prior equal
		// window; threshold is a PERCENT change. above = jumped up, below = dropped.
		prev := e.metricValue(ctx, r, r.windowMin)
		pct := 0.0
		if prev > 0 {
			pct = (value - prev) / prev * 100
		}
		triggered = (r.operator == "above" && pct > r.threshold) ||
			(r.operator == "below" && pct < -r.threshold)
		msg = fmt.Sprintf("🔔 %s — %s of %q changed %+.0f%% vs the prior %dm (%.0f → %.0f; threshold: %s %.0f%%)",
			r.name, metricLabel(r.metric), r.eventType, pct, r.windowMin, prev, value, r.operator, r.threshold)
	} else {
		triggered = (r.operator == "above" && value > r.threshold) ||
			(r.operator == "below" && value < r.threshold)
		msg = fmt.Sprintf("🔔 %s — %s of %q is %.0f over the last %dm (threshold: %s %.0f)",
			r.name, metricLabel(r.metric), r.eventType, value, r.windowMin, r.operator, r.threshold)
	}

	// Always record the latest reading.
	_, _ = e.db.Exec(ctx,
		`UPDATE alerts SET last_value = $1, last_checked_at = NOW(), is_triggered = $2 WHERE id = $3`,
		value, triggered, r.id)

	// Fire only on the rising edge.
	if triggered && !r.isTriggered {
		_, _ = e.db.Exec(ctx,
			`INSERT INTO alert_events (alert_id, project_id, value, threshold, message) VALUES ($1,$2,$3,$4,$5)`,
			r.id, r.projectID, value, r.threshold, msg)
		_, _ = e.db.Exec(ctx, `UPDATE alerts SET last_triggered_at = NOW() WHERE id = $1`, r.id)
		if r.webhookURL != "" {
			e.sendWebhook(r.webhookURL, msg)
		}
		e.log.Info("alert fired", zap.String("alert", r.name), zap.Float64("value", value))
	}
}

// metricValue computes the rule's metric over a window of windowMin minutes,
// shifted back by offsetMin minutes (0 = current window, windowMin = prior).
func (e *Evaluator) metricValue(ctx context.Context, r rule, offsetMin int) float64 {
	expr := "count()"
	if r.metric == "unique_users" {
		expr = "uniq(if(user_id != '', user_id, device_id))"
	}
	// window_minutes/offset are ints from our own DB — safe to interpolate.
	q := fmt.Sprintf(
		`SELECT toFloat64(%s) FROM inspectuser.events
		 WHERE project_id = ? AND event_type = ?
		   AND event_time >= now() - INTERVAL %d MINUTE
		   AND event_time <  now() - INTERVAL %d MINUTE`,
		expr, r.windowMin+offsetMin, offsetMin)
	var v float64
	_ = e.ch.QueryRow(ctx, q, r.projectID, r.eventType).Scan(&v)
	return v
}

func (e *Evaluator) sendWebhook(url, msg string) {
	body, _ := json.Marshal(map[string]string{"text": msg})
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.http.Do(req)
	if err != nil {
		e.log.Warn("alert webhook failed", zap.Error(err))
		return
	}
	resp.Body.Close()
}

func metricLabel(m string) string {
	if m == "unique_users" {
		return "unique users"
	}
	return "event count"
}

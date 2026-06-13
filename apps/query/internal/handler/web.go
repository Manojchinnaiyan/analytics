package handler

import (
	"context"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
)

// nz clamps NaN/Inf to 0 — avg()/division over an empty set returns NaN (which
// ifNull does NOT catch, since NaN ≠ NULL) and Go's JSON encoder rejects it.
func nz(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return f
}

// webFilter builds a safe SQL fragment from the web-dashboard filter params.
// Clicking any breakdown row in the UI (a country, page, source, browser, …)
// sets one of these, and every panel re-queries scoped to it — the interactive
// drill-down Plausible/Fathom are known for. Each clause is ANDed; date strings
// elsewhere are server-generated, and values are single-quote-stripped.
func webFilter(c fiber.Ctx) string {
	var b strings.Builder
	native := map[string]string{
		"country": "country", "region": "region", "city": "city",
		"browser": "browser", "device": "device_type", "os": "os_name",
	}
	for param, col := range native {
		if v := c.Query(param); v != "" {
			b.WriteString(" AND " + col + " = '" + sqlStrip(v) + "'")
		}
	}
	if v := c.Query("path"); v != "" {
		b.WriteString(" AND JSONExtractString(properties, 'path') = '" + sqlStrip(v) + "'")
	}
	if v := c.Query("hostname"); v != "" {
		b.WriteString(" AND JSONExtractString(properties, 'domain') = '" + sqlStrip(v) + "'")
	}
	if v := c.Query("source"); v != "" {
		if v == "Direct" {
			b.WriteString(" AND (JSONExtractString(properties,'referrer') = '' OR domain(JSONExtractString(properties,'referrer')) = JSONExtractString(properties,'domain'))")
		} else {
			b.WriteString(" AND domain(JSONExtractString(properties,'referrer')) = '" + sqlStrip(v) + "'")
		}
	}
	return b.String()
}

// GET /v1/projects/:id/web-analytics?days=30[&country=US&path=/pricing&...]
// Website metrics from "Page Viewed" events, scoped to any active filters, with
// new-vs-returning, compare-to-previous deltas, and the usual breakdowns.
func (h *ProductHandler) WebAnalytics(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}
	curStart := time.Now().UTC().AddDate(0, 0, -(days - 1))
	since := curStart.Format(dateFmt)
	prevStart := curStart.AddDate(0, 0, -days).Format(dateFmt) // for compare-to-previous

	flt := webFilter(c)
	// Server-generated date literals inline to keep one bound param (projectID) per query.
	base := `project_id = ? AND event_type = 'Page Viewed' AND event_time >= toDate('` + since + `')` + flt
	prevBase := `project_id = ? AND event_type = 'Page Viewed' AND event_time >= toDate('` + prevStart + `') AND event_time < toDate('` + since + `')` + flt

	// All metrics below are independent reads. Run them CONCURRENTLY instead of
	// one-after-another — each goroutine writes only its own variable(s), so there
	// is no shared mutable state and no data race. Wall-clock drops from the SUM of
	// ~15 ClickHouse queries (~2-3s) to roughly the slowest single one.
	var (
		pageviews, sessions, visitors uint64
		pvPrev, sPrev, vPrev          uint64
		newVisitors                   uint64
		liveVisitors                  uint64
		bounced, totalSessions        uint64
		pagesPerSession, avgDuration  float64
		avgEngagement                 float64
		byDate                        = map[string]map[string]any{}
		topPages, landing, exit       []map[string]any
		referrers                     []map[string]any
		countries, browsers           []map[string]any
		osBreakdown, devices          []map[string]any
	)

	var wg sync.WaitGroup
	run := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }

	// Headline counters (current + previous window for deltas).
	run(func() {
		_ = h.ch.QueryRow(ctx, `SELECT count(), uniqIf(session_id, session_id != ''), uniq(`+identityExpr+`) FROM inspectuser.events WHERE `+base, projectID).
			Scan(&pageviews, &sessions, &visitors)
	})
	run(func() {
		_ = h.ch.QueryRow(ctx, `SELECT count(), uniqIf(session_id, session_id != ''), uniq(`+identityExpr+`) FROM inspectuser.events WHERE `+prevBase, projectID).
			Scan(&pvPrev, &sPrev, &vPrev)
	})
	// New vs returning: among the (filtered) visitors, how many are globally new.
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT uniqIf(v.id, g.fs >= toDate('`+since+`'))
			FROM (SELECT DISTINCT `+identityExpr+` AS id FROM inspectuser.events WHERE `+base+`) v
			INNER JOIN (
				SELECT `+identityExpr+` AS id, min(toDate(event_time)) AS fs
				FROM inspectuser.events WHERE project_id = ? GROUP BY id
			) g ON v.id = g.id
		`, projectID, projectID).Scan(&newVisitors)
	})
	// Realtime: distinct visitors active in the last 5 minutes (scoped to filters).
	run(func() {
		_ = h.ch.QueryRow(ctx,
			`SELECT uniq(`+identityExpr+`) FROM inspectuser.events
			 WHERE project_id = ? AND event_time >= now() - INTERVAL 5 MINUTE`+flt,
			projectID).Scan(&liveVisitors)
	})
	// Per-session stats → bounce rate, pages/session, avg duration.
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT countIf(pvs = 1), count(), ifNull(avg(pvs), 0), ifNull(avg(dur), 0)
			FROM (
				SELECT session_id, count() AS pvs,
				       dateDiff('second', min(event_time), max(event_time)) AS dur
				FROM inspectuser.events WHERE `+base+` AND session_id != ''
				GROUP BY session_id
			)
		`, projectID).Scan(&bounced, &totalSessions, &pagesPerSession, &avgDuration)
	})
	// Accurate engaged time per session (sum of foreground time across pages).
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT ifNull(avg(sess_ms), 0) FROM (
				SELECT session_id, sum(JSONExtractInt(properties,'engaged_ms')) AS sess_ms
				FROM inspectuser.events
				WHERE project_id = ? AND event_type = 'Page Engagement' AND session_id != ''
				  AND event_time >= toDate('`+since+`')`+flt+`
				GROUP BY session_id
			)
		`, projectID).Scan(&avgEngagement)
	})
	// Daily pageviews + sessions + visitors trend (raw; zero-filled after).
	run(func() {
		rows, err := h.ch.Query(ctx, `
			SELECT toDate(event_time) AS d, count() AS pv, uniqIf(session_id, session_id != '') AS s, uniq(`+identityExpr+`) AS v
			FROM inspectuser.events WHERE `+base+`
			GROUP BY d ORDER BY d ASC
		`, projectID)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var p, s, v uint64
			if rows.Scan(&d, &p, &s, &v) == nil {
				ds := d.Format(dateFmt)
				byDate[ds] = map[string]any{"date": ds, "pageviews": p, "sessions": s, "visitors": v}
			}
		}
	})
	// Breakdowns / top lists — each its own query.
	run(func() { topPages = h.topPages(ctx, projectID, since, flt) })
	run(func() { landing = h.sessionEdgePages(ctx, projectID, since, flt, "argMin") })
	run(func() { exit = h.sessionEdgePages(ctx, projectID, since, flt, "argMax") })
	run(func() { referrers = h.topReferrers(ctx, projectID, since, flt) })
	run(func() { countries = h.webBreakdown(ctx, projectID, since, flt, "country") })
	run(func() { browsers = h.webBreakdown(ctx, projectID, since, flt, "browser") })
	run(func() { osBreakdown = h.webBreakdown(ctx, projectID, since, flt, "os_name") })
	run(func() { devices = h.webBreakdown(ctx, projectID, since, flt, "device_type") })

	wg.Wait()

	// Derived values (pure Go) — computed once all reads are in.
	returningVisitors := uint64(0)
	if visitors > newVisitors {
		returningVisitors = visitors - newVisitors
	}
	bounceRate := 0.0
	if totalSessions > 0 {
		bounceRate = float64(bounced) / float64(totalSessions)
	}
	trend := []map[string]any{}
	for i := 0; i < days; i++ {
		ds := curStart.AddDate(0, 0, i).Format(dateFmt)
		if row, ok := byDate[ds]; ok {
			trend = append(trend, row)
		} else {
			trend = append(trend, map[string]any{"date": ds, "pageviews": uint64(0), "sessions": uint64(0), "visitors": uint64(0)})
		}
	}
	delta := func(cur, prev uint64) any {
		if prev == 0 {
			return nil
		}
		return (float64(cur) - float64(prev)) / float64(prev)
	}

	return c.JSON(fiber.Map{
		"pageviews":          pageviews,
		"sessions":           sessions,
		"visitors":           visitors,
		"new_visitors":       newVisitors,
		"returning_visitors": returningVisitors,
		"live_visitors":      liveVisitors,
		"bounce_rate":        nz(bounceRate),
		"pages_per_session":  nz(pagesPerSession),
		"avg_duration":       nz(avgDuration),
		"avg_engagement":     nz(avgEngagement),
		"delta_pageviews":    delta(pageviews, pvPrev),
		"delta_sessions":     delta(sessions, sPrev),
		"delta_visitors":     delta(visitors, vPrev),
		"trend":              trend,
		"top_pages":          topPages,
		"landing_pages":      landing,
		"exit_pages":         exit,
		"referrers":          referrers,
		"countries":          countries,
		"browsers":           browsers,
		"os":                 osBreakdown,
		"devices":            devices,
	})
}

// webBreakdown: unique visitors by a native dimension, scoped to the filters.
func (h *ProductHandler) webBreakdown(ctx context.Context, projectID, since, flt, column string) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT `+column+` AS v, uniq(`+identityExpr+`) AS visitors
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Page Viewed' AND event_time >= toDate('`+since+`')`+flt+`
		GROUP BY v ORDER BY visitors DESC LIMIT 8
	`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		var visitors uint64
		if rows.Scan(&v, &visitors) == nil {
			if v == "" {
				v = "(unknown)"
			}
			out = append(out, map[string]any{"value": v, "visitors": visitors})
		}
	}
	return out
}

// topPages: most-viewed paths with unique visitors.
func (h *ProductHandler) topPages(ctx context.Context, projectID, since, flt string) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT path, count() AS views, uniq(id) AS visitors FROM (
			SELECT JSONExtractString(properties, 'path') AS path, `+identityExpr+` AS id
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = 'Page Viewed' AND event_time >= toDate('`+since+`')`+flt+`
		)
		GROUP BY path ORDER BY views DESC LIMIT 12
	`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var path string
		var views, visitors uint64
		if rows.Scan(&path, &views, &visitors) == nil {
			if path == "" {
				path = "(no path)"
			}
			out = append(out, map[string]any{"value": path, "views": views, "visitors": visitors})
		}
	}
	return out
}

// sessionEdgePages: first (argMin) / last (argMax) page per session = landing / exit.
func (h *ProductHandler) sessionEdgePages(ctx context.Context, projectID, since, flt, agg string) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT path, count() AS sessions FROM (
			SELECT session_id, `+agg+`(JSONExtractString(properties, 'path'), event_time) AS path
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = 'Page Viewed' AND session_id != '' AND event_time >= toDate('`+since+`')`+flt+`
			GROUP BY session_id
		)
		GROUP BY path ORDER BY sessions DESC LIMIT 10
	`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var path string
		var sessions uint64
		if rows.Scan(&path, &sessions) == nil {
			if path == "" {
				path = "(no path)"
			}
			out = append(out, map[string]any{"value": path, "sessions": sessions})
		}
	}
	return out
}

// topReferrers: acquisition sources by SESSION, from each session's entry
// pageview. utm_source wins (social/campaign traffic like X & LinkedIn strips the
// HTTP referrer, so referrer-only attribution misses it); then external referrer
// domain; otherwise Direct.
func (h *ProductHandler) topReferrers(ctx context.Context, projectID, since, flt string) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT source, count() AS sessions FROM (
			SELECT multiIf(
			           entry_utm != '', entry_utm,
			           entry_ref = '' OR domain(entry_ref) = entry_dom, 'Direct',
			           domain(entry_ref)
			       ) AS source
			FROM (
				SELECT session_id,
				       argMinIf(utm_source, event_time, utm_source != '') AS entry_utm,
				       argMin(JSONExtractString(properties, 'referrer'), event_time) AS entry_ref,
				       argMin(JSONExtractString(properties, 'domain'),   event_time) AS entry_dom
				FROM inspectuser.events
				WHERE project_id = ? AND event_type = 'Page Viewed' AND session_id != '' AND event_time >= toDate('`+since+`')`+flt+`
				GROUP BY session_id
			)
		)
		GROUP BY source ORDER BY sessions DESC LIMIT 10
	`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var ref string
		var sessions uint64
		if rows.Scan(&ref, &sessions) == nil {
			out = append(out, map[string]any{"value": ref, "sessions": sessions})
		}
	}
	return out
}

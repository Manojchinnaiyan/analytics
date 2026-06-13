package handler

import (
	"context"
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/inspectuser/query/internal/analytics"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type ProductHandler struct {
	ch  clickhouse.Conn
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewProductHandler(ch clickhouse.Conn, db *pgxpool.Pool, log *zap.Logger) *ProductHandler {
	return &ProductHandler{ch: ch, db: db, log: log}
}

// identity expression reused across the product metrics.
const identityExpr = `if(user_id != '', user_id, device_id)`

// tzRe guards a timezone before it's interpolated into SQL (IANA names only).
var tzRe = regexp.MustCompile(`^[A-Za-z0-9_+/.\-]{1,64}$`)

// projectTZ returns the project's reporting timezone (validated; UTC fallback).
func (h *ProductHandler) projectTZ(ctx context.Context, projectID string) string {
	var tz string
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(timezone, 'UTC') FROM projects WHERE id = $1`, projectID).Scan(&tz)
	if tz == "" || !tzRe.MatchString(tz) {
		return "UTC"
	}
	return tz
}

// GET /v1/projects/:id/product-overview?days=30
// Vendor-grade product-health home: current DAU/WAU/MAU + stickiness with
// period deltas, new users, engagement depth (events/user, sessions/user,
// sessions/day), windowed avg session duration, DAU/WAU/MAU + stickiness trend,
// a new-user retention snapshot (D1/D7), top events, and breakdowns. The `days`
// range scopes the trends and windowed aggregates (headline DAU/WAU/MAU are
// current rolling snapshots, like Amplitude's home).
func (h *ProductHandler) ProductOverview(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if d, err := strconv.Atoi(c.Query("days")); err == nil && d >= 7 {
		days = d
	}
	if days > 90 {
		days = 90
	}
	win := int64(days - 1) // today() - win covers `days` calendar days incl. today

	// Reporting timezone: day boundaries (DAU, daily trend) use the project's tz
	// so a day means the product's local day, not UTC.
	tz := h.projectTZ(ctx, projectID)
	lt := "toDate(now(), '" + tz + "')" // local "today" as a Date

	// All metrics below are independent reads — run them CONCURRENTLY (each
	// goroutine writes only its own variable(s); no shared mutable state). Cuts
	// wall-clock from the SUM of ~11 ClickHouse queries to roughly the slowest.
	var (
		dau, dauToday, wau, mau, totalEvents, uniqueUsers uint64
		dauPrev, wauPrev, mauPrev                         uint64
		lastEvent                                         time.Time
		newInRange, newToday, newPrev                     uint64
		avgSession                                        float64
		evTot, usrTot, sessTot                            uint64
		trend, retention, topEvents                       any
		bdCountry, bdPlatform, bdDevice                   any
	)

	var wg sync.WaitGroup
	run := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }

	// Headline active-user metrics (DAU = last complete local day; WAU/MAU rolling).
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT
				uniqIf(id, d = `+lt+` - 1)                                           AS dau,
				uniqIf(id, d = `+lt+`)                                               AS dau_today,
				uniqIf(id, ts >= now() - INTERVAL 7 DAY)                             AS wau,
				uniqIf(id, ts >= now() - INTERVAL 30 DAY)                            AS mau,
				uniqIf(id, d = `+lt+` - 2)                                           AS dau_prev,
				uniqIf(id, ts >= now() - INTERVAL 14 DAY AND ts < now() - INTERVAL 7 DAY)  AS wau_prev,
				uniqIf(id, ts >= now() - INTERVAL 60 DAY AND ts < now() - INTERVAL 30 DAY) AS mau_prev,
				count()                                                              AS total_events,
				max(ts)                                                              AS last_event,
				uniq(id)                                                             AS unique_users
			FROM (
				SELECT `+identityExpr+` AS id, event_time AS ts, toDate(event_time, '`+tz+`') AS d
				FROM inspectuser.events WHERE project_id = ?
			)
		`, projectID).Scan(&dau, &dauToday, &wau, &mau, &dauPrev, &wauPrev, &mauPrev, &totalEvents, &lastEvent, &uniqueUsers)
	})
	// New users — selected range vs the immediately-prior range.
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT
				countIf(first_day >= `+lt+` - ?)                              AS n,
				countIf(first_day = `+lt+`)                                   AS ntoday,
				countIf(first_day >= `+lt+` - ? AND first_day < `+lt+` - ?)   AS nprev
			FROM (
				SELECT `+identityExpr+` AS id, toDate(min(event_time), '`+tz+`') AS first_day
				FROM inspectuser.events WHERE project_id = ? GROUP BY id
			)
		`, win, int64(2*days-1), win, projectID).Scan(&newInRange, &newToday, &newPrev)
	})
	// Average session duration (seconds) over the selected range.
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT ifNull(avg(dur), 0) FROM (
				SELECT dateDiff('second', min(event_time), max(event_time)) AS dur
				FROM inspectuser.events
				WHERE project_id = ? AND session_id != '' AND event_time >= today() - ?
				GROUP BY session_id
				HAVING dur >= 0
			)
		`, projectID, win).Scan(&avgSession)
	})
	// Engagement depth: events/user, sessions/user.
	run(func() {
		_ = h.ch.QueryRow(ctx, `
			SELECT count(), uniq(`+identityExpr+`), uniqIf(session_id, session_id != '')
			FROM inspectuser.events WHERE project_id = ? AND event_time >= today() - ?
		`, projectID, win).Scan(&evTot, &usrTot, &sessTot)
	})
	run(func() { trend = h.trendSeries(ctx, projectID, tz, days) })
	run(func() { retention = h.retentionSnapshot(ctx, projectID, tz, days) })
	run(func() { topEvents = h.topEvents(ctx, projectID, win) })
	run(func() { bdCountry = h.breakdown(ctx, projectID, "country", win) })
	run(func() { bdPlatform = h.breakdown(ctx, projectID, "platform", win) })
	run(func() { bdDevice = h.breakdown(ctx, projectID, "device_type", win) })

	wg.Wait()

	// Derived values (pure Go) — once all reads are in.
	if math.IsNaN(avgSession) || math.IsInf(avgSession, 0) {
		avgSession = 0 // avg() over an empty window returns NaN, which breaks JSON
	}
	eventsPerUser, sessionsPerUser := 0.0, 0.0
	if usrTot > 0 {
		eventsPerUser = float64(evTot) / float64(usrTot)
		sessionsPerUser = float64(sessTot) / float64(usrTot)
	}
	stickiness := 0.0
	if mau > 0 {
		stickiness = float64(dau) / float64(mau)
	}
	pctDelta := func(cur, prev uint64) *float64 {
		if prev == 0 {
			return nil
		}
		d := (float64(cur) - float64(prev)) / float64(prev)
		return &d
	}

	return c.JSON(fiber.Map{
		"connected":           totalEvents > 0,
		"range_days":          days,
		"last_event_time":     lastEvent,
		"timezone":            tz,
		"dau":                 dau,
		"dau_today":           dauToday,
		"wau":                 wau,
		"mau":                 mau,
		"new_users":           newInRange,
		"new_users_today":     newToday,
		"avg_session_seconds": avgSession,
		"events_per_user":     eventsPerUser,
		"sessions_per_user":   sessionsPerUser,
		"stickiness":          stickiness,
		"total_events":        totalEvents,
		"trend":               trend,
		"retention":           retention,
		"top_events":          topEvents,
		"delta_dau":           pctDelta(dau, dauPrev),
		"delta_wau":           pctDelta(wau, wauPrev),
		"delta_mau":           pctDelta(mau, mauPrev),
		"delta_new_users":     pctDelta(newInRange, newPrev),
		"breakdown_country":   bdCountry,
		"breakdown_platform":  bdPlatform,
		"breakdown_device":    bdDevice,
	})
}

// trendSeries returns the per-day active-users trend split into NEW vs
// RETURNING (Amplitude's home "Active Users" chart), plus rolling WAU/MAU and
// stickiness. "new" = active that day AND it's the user's global first-seen day;
// "returning" = active that day with an earlier first-seen.
func (h *ProductHandler) trendSeries(ctx context.Context, projectID, tz string, days int) []map[string]any {
	out := []map[string]any{}
	byDate := map[string]map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT day,
		       toInt64(uniqExactIf(id, ed = day))             AS dau,
		       toInt64(uniqExactIf(id, ed = day AND fd = day)) AS new_users,
		       toInt64(uniqExactIf(id, ed = day AND fd < day)) AS returning,
		       toInt64(uniqExactIf(id, ed >= day - 6))         AS wau,
		       toInt64(uniqExact(id))                          AS mau
		FROM (SELECT toDate(now(), '`+tz+`') - toUInt32(number) AS day FROM numbers(?)) spine
		CROSS JOIN (
			SELECT ev.id AS id, ev.ed AS ed, fs.fd AS fd
			FROM (
				SELECT DISTINCT `+identityExpr+` AS id, toDate(event_time, '`+tz+`') AS ed
				FROM inspectuser.events WHERE project_id = ? AND event_time >= today() - ?
			) ev
			INNER JOIN (
				SELECT `+identityExpr+` AS id, toDate(min(event_time), '`+tz+`') AS fd
				FROM inspectuser.events WHERE project_id = ? GROUP BY id
			) fs ON ev.id = fs.id
		) ev
		WHERE ev.ed >= day - 29 AND ev.ed <= day
		GROUP BY day ORDER BY day ASC
	`, int64(days), projectID, int64(days+29), projectID)
	if err != nil {
		h.log.Warn("trend series failed", zap.Error(err))
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var dau, newU, retU, wau, mau int64
		if rows.Scan(&day, &dau, &newU, &retU, &wau, &mau) != nil {
			continue
		}
		stick := 0.0
		if mau > 0 {
			stick = float64(dau) / float64(mau)
		}
		byDate[day.Format(dateFmt)] = map[string]any{
			"date": day.Format(dateFmt), "dau": dau, "new_users": newU, "returning": retU,
			"wau": wau, "mau": mau, "stickiness": stick,
		}
	}

	// Zero-fill the full range so the chart honestly spans all `days`. Use the
	// project tz so the generated date keys align with the SQL's local days.
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -(days - 1))
	for i := 0; i < days; i++ {
		ds := start.AddDate(0, 0, i).Format(dateFmt)
		if row, ok := byDate[ds]; ok {
			out = append(out, row)
		} else {
			out = append(out, map[string]any{
				"date": ds, "dau": int64(0), "new_users": int64(0), "returning": int64(0),
				"wau": int64(0), "mau": int64(0), "stickiness": 0.0,
			})
		}
	}
	return out
}

// retentionSnapshot returns D1/D7 new-user retention: of users whose first day
// is in range AND old enough to be eligible, the % active on exactly day+N.
func (h *ProductHandler) retentionSnapshot(ctx context.Context, projectID, tz string, days int) map[string]any {
	var eligD1, retD1, eligD7, retD7 uint64
	lt := "toDate(now(), '" + tz + "')" // local "today" so the cohort shares DAU's day
	day := "toDate(event_time, '" + tz + "')"
	// fd must be the user's GLOBAL first-seen day (unbounded subquery `g`), not the
	// first day seen inside the window — otherwise a long-tenured user active in the
	// window is mistaken for a new user and pollutes the new-user retention cohort.
	// days_arr comes from the windowed scan and covers fd..today for eligible users.
	_ = h.ch.QueryRow(ctx, `
		SELECT
			countIf(fd <= `+lt+` - 1) AS elig_d1,
			countIf(fd <= `+lt+` - 1 AND has(days_arr, fd + 1)) AS ret_d1,
			countIf(fd <= `+lt+` - 7) AS elig_d7,
			countIf(fd <= `+lt+` - 7 AND has(days_arr, fd + 7)) AS ret_d7
		FROM (
			SELECT a.id AS id, g.fd AS fd, a.days_arr AS days_arr
			FROM (
				SELECT id, groupUniqArray(d) AS days_arr FROM (
					SELECT `+identityExpr+` AS id, `+day+` AS d
					FROM inspectuser.events WHERE project_id = ? AND event_time >= now() - INTERVAL ? DAY
				) GROUP BY id
			) a
			INNER JOIN (
				SELECT `+identityExpr+` AS id, min(`+day+`) AS fd
				FROM inspectuser.events WHERE project_id = ?
				GROUP BY id HAVING fd >= `+lt+` - ?
			) g USING (id)
		)
	`, projectID, int64(days+7), projectID, win64(days)).Scan(&eligD1, &retD1, &eligD7, &retD7)
	rate := func(r, e uint64) float64 {
		if e == 0 {
			return 0
		}
		return float64(r) / float64(e)
	}
	return map[string]any{
		"d1": rate(retD1, eligD1), "d1_eligible": eligD1,
		"d7": rate(retD7, eligD7), "d7_eligible": eligD7,
	}
}

// topEvents returns the most frequent events in the range with user counts.
func (h *ProductHandler) topEvents(ctx context.Context, projectID string, win int64) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT event_type, toInt64(count()) AS c, toInt64(uniq(`+identityExpr+`)) AS u
		FROM inspectuser.events WHERE project_id = ? AND event_time >= today() - ?
		GROUP BY event_type ORDER BY c DESC LIMIT 8
	`, projectID, win)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var et string
		var c, u int64
		if rows.Scan(&et, &c, &u) == nil {
			out = append(out, map[string]any{"event_type": et, "count": c, "users": u})
		}
	}
	return out
}

func win64(days int) int64 { return int64(days - 1) }

// GET /v1/projects/:id/feature-engagement
// Per-event adoption over the last 30 days: unique users, total events,
// engFeature is one row of the engagement matrix.
type engFeature struct {
	EventType  string  `json:"event_type"`
	Users      int64   `json:"users"`
	Events     int64   `json:"events"`
	Adoption   float64 `json:"adoption"`   // breadth: users / active users (%MAU style)
	FreqDays   float64 `json:"freq_days"`  // avg active days performed per user
	FreqTimes  float64 `json:"freq_times"` // avg times performed per user
	Stickiness float64 `json:"stickiness"` // DAU/MAU over a fixed 30d basis
	Trend      []int64 `json:"trend"`      // daily unique users across the window
}

// FeatureEngagement implements Amplitude's Engagement Matrix. Per feature
// (event) over a chosen window it returns breadth (adoption = % of active
// users) and BOTH frequency measures Amplitude offers — average days performed
// and average times performed — so the client can switch the Y-axis without a
// refetch. Quadrant dividers (median OR average of each axis) are returned for
// both, and the client classifies Core/Power/Broad/Niche. Stickiness (DAU/MAU)
// is computed on a fixed 30-day basis, independent of the matrix window.
// Supports a user segment via property filters, like Amplitude's "User Segment".
func (h *ProductHandler) FeatureEngagement(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if d, err := strconv.Atoi(c.Query("days")); err == nil && d > 0 {
		days = d
	}
	if days > 365 {
		days = 365
	}
	since := int64(days - 1) // today() - (N-1) covers N calendar days incl. today

	// Optional segment: property filters, compiled identically to segmentation.
	var filters []analytics.Filter
	if raw := c.Query("filters"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &filters)
	}
	seg := analytics.FilterSQL(filters)

	// Dimension: raw events (default) or named feature-groups (group=features),
	// where a "feature" is a user-defined set of events (like Amplitude).
	dim := "event_type"
	if c.Query("group") == "features" {
		if defs := h.loadFeatureDefs(ctx, projectID); len(defs) > 0 {
			dim = featureGroupExpr(defs)
		}
	}

	// Active users in window (adoption denominator), scoped to the segment.
	var activeUsers uint64
	_ = h.ch.QueryRow(ctx,
		`SELECT uniq(`+identityExpr+`) FROM inspectuser.events
		 WHERE project_id = ? AND event_time >= today() - ?`+seg,
		projectID, since).Scan(&activeUsers)

	// Per-feature breadth + depth. user_days = distinct (user, day) pairs.
	rows, err := h.ch.Query(ctx, `
		SELECT `+dim+`                                                  AS feat,
		       toInt64(uniq(`+identityExpr+`))                        AS users,
		       toInt64(count())                                       AS events,
		       toInt64(uniq((`+identityExpr+`, toDate(event_time))))  AS user_days
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= today() - ?`+seg+`
		GROUP BY feat ORDER BY users DESC LIMIT 100`,
		projectID, since)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []engFeature{}
	for rows.Next() {
		var f engFeature
		var userDays int64
		if rows.Scan(&f.EventType, &f.Users, &f.Events, &userDays) != nil {
			continue
		}
		if f.EventType == "" {
			continue // events not in any feature-group (group mode only)
		}
		if activeUsers > 0 {
			f.Adoption = float64(f.Users) / float64(activeUsers)
		}
		if f.Users > 0 {
			f.FreqDays = float64(userDays) / float64(f.Users)
			f.FreqTimes = float64(f.Events) / float64(f.Users)
		}
		f.Trend = make([]int64, days)
		out = append(out, f)
	}
	idxByType := map[string]int{}
	for i, f := range out {
		idxByType[f.EventType] = i
	}

	h.fillStickiness(ctx, projectID, seg, dim, out, idxByType)
	h.fillTrend(ctx, projectID, seg, dim, since, days, out, idxByType)

	// Quadrant dividers: return BOTH median and average per axis; the client
	// picks one (Amplitude's "Median / Average" toggle) and classifies.
	adopt := collect(out, func(f engFeature) float64 { return f.Adoption })
	fdays := collect(out, func(f engFeature) float64 { return f.FreqDays })
	ftimes := collect(out, func(f engFeature) float64 { return f.FreqTimes })

	return c.JSON(fiber.Map{
		"active_users": activeUsers,
		"window_days":  days,
		"dividers": fiber.Map{
			"adoption":   fiber.Map{"median": median(adopt), "mean": mean(adopt)},
			"freq_days":  fiber.Map{"median": median(fdays), "mean": mean(fdays)},
			"freq_times": fiber.Map{"median": median(ftimes), "mean": mean(ftimes)},
		},
		"features": out,
	})
}

// fillStickiness computes Amplitude's exact stickiness per feature: DAU/MAU,
// where DAU is the distinct users active on the last COMPLETE day and MAU is the
// 30-day distinct users — i.e. "% of monthly feature users active on that day"
// (was an averaged DAU/MAU, which only approximated the ratio).
func (h *ProductHandler) fillStickiness(ctx context.Context, projectID, seg, dim string, out []engFeature, idx map[string]int) {
	rows, err := h.ch.Query(ctx, `
		SELECT `+dim+`                                                              AS feat,
		       toInt64(uniq(`+identityExpr+`))                                      AS mau,
		       toInt64(uniqIf(`+identityExpr+`, toDate(event_time) = today() - 1))  AS dau
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= today() - 29`+seg+`
		GROUP BY feat`, projectID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var et string
		var mau, dau int64
		if rows.Scan(&et, &mau, &dau) != nil {
			continue
		}
		if i, ok := idx[et]; ok && mau > 0 {
			out[i].Stickiness = float64(dau) / float64(mau) // DAU(last complete day) / MAU
		}
	}
}

// fillTrend fills each feature's daily unique-user sparkline across the window.
func (h *ProductHandler) fillTrend(ctx context.Context, projectID, seg, dim string, since int64, days int, out []engFeature, idx map[string]int) {
	dateIdx := map[string]int{}
	start := time.Now().UTC().AddDate(0, 0, -(days - 1))
	for i := 0; i < days; i++ {
		dateIdx[start.AddDate(0, 0, i).Format("2006-01-02")] = i
	}
	rows, err := h.ch.Query(ctx, `
		SELECT `+dim+` AS feat, toDate(event_time) AS d, toInt64(uniq(`+identityExpr+`)) AS u
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= today() - ?`+seg+`
		GROUP BY feat, d`, projectID, since)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var et string
		var d time.Time
		var u int64
		if rows.Scan(&et, &d, &u) != nil {
			continue
		}
		fi, ok := idx[et]
		if !ok {
			continue
		}
		if di, ok := dateIdx[d.Format("2006-01-02")]; ok {
			out[fi].Trend[di] = u
		}
	}
}

// collect maps a slice to a []float64 via a selector (used for axis medians).
func collect[T any](s []T, f func(T) float64) []float64 {
	out := make([]float64, len(s))
	for i, v := range s {
		out[i] = f(v)
	}
	return out
}

// mean returns the arithmetic average of xs (0 if empty).
func mean(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	var sum float64
	for _, x := range xs {
		sum += x
	}
	return sum / float64(len(xs))
}

// median returns the middle value of xs (0 if empty). Sorts a copy.
func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	c := append([]float64(nil), xs...)
	sort.Float64s(c)
	n := len(c)
	if n%2 == 1 {
		return c[n/2]
	}
	return (c[n/2-1] + c[n/2]) / 2
}

// breakdown returns top dimension values by unique active users over the range.
// column is from a fixed allowlist (caller passes literals) — safe to interpolate.
func (h *ProductHandler) breakdown(ctx context.Context, projectID, column string, win int64) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT `+column+` AS v, uniq(`+identityExpr+`) AS u
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= today() - ?
		GROUP BY v ORDER BY u DESC LIMIT 10
	`, projectID, win)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		var u uint64
		if rows.Scan(&v, &u) == nil {
			if v == "" {
				v = "(unknown)"
			}
			out = append(out, map[string]any{"value": v, "users": u})
		}
	}
	return out
}

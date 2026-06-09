package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

// GET /v1/projects/:id/events/live?limit=50&after=<unix_ms>&event_type=&search=
// Real-time event stream for debugging instrumentation. Returns the newest
// events first; pass `after` (unix millis) to fetch only events seen since.
func (h *ProductHandler) LiveEvents(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	limit := 50
	if n, err := strconv.Atoi(c.Query("limit")); err == nil && n > 0 && n <= 200 {
		limit = n
	}

	conds := "project_id = ?"
	args := []any{projectID}

	if after := c.Query("after"); after != "" {
		if ms, err := strconv.ParseInt(after, 10, 64); err == nil && ms > 0 {
			conds += " AND event_time > fromUnixTimestamp64Milli(?)"
			args = append(args, ms)
		}
	}
	if et := c.Query("event_type"); et != "" {
		conds += " AND event_type = ?"
		args = append(args, et)
	}
	if s := c.Query("search"); s != "" {
		conds += " AND (positionCaseInsensitive(event_type, ?) > 0 OR positionCaseInsensitive(user_id, ?) > 0 OR positionCaseInsensitive(device_id, ?) > 0)"
		args = append(args, s, s, s)
	}

	rows, err := h.ch.Query(ctx, `
		SELECT toUnixTimestamp64Milli(event_time) AS ts_ms, event_type, user_id, device_id,
		       platform, os_name, device_type, country, city, utm_source, properties
		FROM inspectuser.events
		WHERE `+conds+`
		ORDER BY event_time DESC
		LIMIT ?
	`, append(args, limit)...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var tsMs int64
		var eventType, userID, deviceID, platform, osName, deviceType, country, city, utmSource, props string
		if rows.Scan(&tsMs, &eventType, &userID, &deviceID, &platform, &osName, &deviceType, &country, &city, &utmSource, &props) != nil {
			continue
		}
		out = append(out, map[string]any{
			"ts_ms": tsMs, "event_type": eventType, "user_id": userID, "device_id": deviceID,
			"platform": platform, "os_name": osName, "device_type": deviceType,
			"country": country, "city": city, "utm_source": utmSource, "properties": props,
		})
	}
	return c.JSON(fiber.Map{"events": out})
}

// GET /v1/projects/:id/lifecycle?days=30
// Daily lifecycle breakdown (new / current / resurrected / dormant) plus
// stickiness ratios (DAU/MAU, DAU/WAU, WAU/MAU).
func (h *ProductHandler) Lifecycle(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}

	// Buffer one day before the window so we can see "active yesterday" on the
	// first rendered day. cutoff == today-days == (winStart - 1).
	cutoff := time.Now().UTC().AddDate(0, 0, -days).Format(dateFmt)

	rows, err := h.ch.Query(ctx, `
		SELECT id, groupUniqArrayIf(d, d >= toDate(?)) AS act_days, min(d) AS first_seen
		FROM (
			SELECT `+identityExpr+` AS id, toDate(event_time) AS d
			FROM inspectuser.events WHERE project_id = ?
		)
		GROUP BY id
		HAVING max(d) >= toDate(?)
	`, cutoff, projectID, cutoff)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type uinfo struct {
		active map[string]bool
		first  string
	}
	users := []uinfo{}
	for rows.Next() {
		var id string
		var ds []time.Time
		var first time.Time
		if rows.Scan(&id, &ds, &first) != nil {
			continue
		}
		m := make(map[string]bool, len(ds))
		for _, d := range ds {
			m[d.Format(dateFmt)] = true
		}
		users = append(users, uinfo{active: m, first: first.Format(dateFmt)})
	}

	type day struct {
		Date        string `json:"date"`
		New         int    `json:"new"`
		Current     int    `json:"current"`
		Resurrected int    `json:"resurrected"`
		Dormant     int    `json:"dormant"` // rendered as a negative bar
	}
	winStart := time.Now().UTC().AddDate(0, 0, -(days - 1))
	series := make([]day, 0, days)
	for i := 0; i < days; i++ {
		dt := winStart.AddDate(0, 0, i)
		ds := dt.Format(dateFmt)
		pds := dt.AddDate(0, 0, -1).Format(dateFmt)
		d := day{Date: ds}
		for _, u := range users {
			switch {
			case u.active[ds] && u.first == ds:
				d.New++
			case u.active[ds] && u.active[pds]:
				d.Current++
			case u.active[ds]:
				d.Resurrected++
			case u.active[pds]:
				d.Dormant-- // active yesterday, gone today
			}
		}
		series = append(series, d)
	}

	// Stickiness ratios.
	var dau, wau, mau uint64
	_ = h.ch.QueryRow(ctx, `
		SELECT
			uniqIf(id, d = today())                  AS dau,
			uniqIf(id, ts >= now() - INTERVAL 7 DAY) AS wau,
			uniqIf(id, ts >= now() - INTERVAL 30 DAY) AS mau
		FROM (
			SELECT `+identityExpr+` AS id, event_time AS ts, toDate(event_time) AS d
			FROM inspectuser.events WHERE project_id = ?
		)
	`, projectID).Scan(&dau, &wau, &mau)

	ratio := func(a, b uint64) float64 {
		if b == 0 {
			return 0
		}
		return float64(a) / float64(b)
	}

	// Quick Ratio = (new + resurrected) / churned, over the window. >1 means the
	// product is growing its active base faster than it loses it (Social Capital's
	// growth-accounting metric). Dormant is stored negative, so negate to get churn.
	var totNew, totRes, totDormant int
	for _, d := range series {
		totNew += d.New
		totRes += d.Resurrected
		totDormant += d.Dormant
	}
	churned := -totDormant
	quickRatio := 0.0
	if churned > 0 {
		quickRatio = float64(totNew+totRes) / float64(churned)
	}

	return c.JSON(fiber.Map{
		"series":             series,
		"dau":                dau,
		"wau":                wau,
		"mau":                mau,
		"stickiness_dau_mau": ratio(dau, mau),
		"stickiness_dau_wau": ratio(dau, wau),
		"stickiness_wau_mau": ratio(wau, mau),
		"quick_ratio":        quickRatio,
		"totals":             fiber.Map{"new": totNew, "resurrected": totRes, "churned": churned},
	})
}

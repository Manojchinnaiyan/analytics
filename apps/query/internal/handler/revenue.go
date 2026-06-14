package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

// Revenue implements monetization analytics from the SDK's Revenue events
// ($revenue/$currency/$productId/$revenueType), matching Amplitude/Mixpanel
// definitions:
//   total revenue = Σ $revenue          purchases = # Revenue events
//   paying users  = distinct buyers      AOV  = revenue / purchases
//   ARPU  = revenue / active users        ARPPU = revenue / paying users
//   paid conversion = paying users / active users
//
// GET /v1/projects/:id/revenue?days=30
func (h *ProductHandler) Revenue(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}
	win := int64(days - 1)
	const rev = `event_type = 'Revenue'`
	const amt = `JSONExtractFloat(properties, '$revenue')`

	// Headline for the range and the immediately-prior range (for deltas), plus
	// active users in range — two independent queries, run concurrently.
	var totalRev, prevRev float64
	var purchases, payers, prevPayers uint64
	var activeUsers uint64
	parallel(
		func() {
			_ = h.ch.QueryRow(ctx, `
		SELECT
			sumIf(`+amt+`, event_time >= today() - ?)                                 AS rev,
			countIf(event_time >= today() - ?)                                        AS purchases,
			uniqIf(`+identityExpr+`, event_time >= today() - ?)                       AS payers,
			sumIf(`+amt+`, event_time >= today() - ? AND event_time < today() - ?)    AS prev_rev,
			uniqIf(`+identityExpr+`, event_time >= today() - ? AND event_time < today() - ?) AS prev_payers
		FROM inspectuser.events
		WHERE project_id = ? AND `+rev+`
	`, win, win, win, int64(2*days-1), win, int64(2*days-1), win, projectID).
				Scan(&totalRev, &purchases, &payers, &prevRev, &prevPayers)
		},
		func() {
			// Active users in range (denominator for ARPU + paid conversion).
			_ = h.ch.QueryRow(ctx,
				`SELECT uniq(`+identityExpr+`) FROM inspectuser.events WHERE project_id = ? AND event_time >= today() - ?`,
				projectID, win).Scan(&activeUsers)
		},
	)

	div := func(a float64, b uint64) float64 {
		if b == 0 {
			return 0
		}
		return a / float64(b)
	}
	pctDelta := func(cur, prev float64) *float64 {
		if prev == 0 {
			return nil
		}
		d := (cur - prev) / prev
		return &d
	}
	paidConv := 0.0
	if activeUsers > 0 {
		paidConv = float64(payers) / float64(activeUsers)
	}

	return c.JSON(fiber.Map{
		"range_days":      days,
		"total_revenue":   totalRev,
		"purchases":       purchases,
		"paying_users":    payers,
		"active_users":    activeUsers,
		"arpu":            div(totalRev, activeUsers),
		"arppu":           div(totalRev, payers),
		"aov":             div(totalRev, purchases),
		"paid_conversion": paidConv,
		"delta_revenue":   pctDelta(totalRev, prevRev),
		"delta_paying":    pctDelta(float64(payers), float64(prevPayers)),
		"currency":        h.dominantCurrency(c, projectID, win),
		"trend":           h.revenueTrend(c, projectID, days),
		"by_product":      h.revBreakdown(c, projectID, win, "$productId"),
		"by_type":         h.revBreakdown(c, projectID, win, "$revenueType"),
		"by_currency":     h.revBreakdown(c, projectID, win, "$currency"),
	})
}

func (h *ProductHandler) dominantCurrency(c fiber.Ctx, projectID string, win int64) string {
	var cur string
	_ = h.ch.QueryRow(c.Context(), `
		SELECT JSONExtractString(properties, '$currency') AS cur
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Revenue' AND event_time >= today() - ?
		GROUP BY cur ORDER BY count() DESC LIMIT 1
	`, projectID, win).Scan(&cur)
	if cur == "" {
		cur = "USD"
	}
	return cur
}

// revenueTrend: daily revenue + purchases, zero-filled across the full range.
func (h *ProductHandler) revenueTrend(c fiber.Ctx, projectID string, days int) []map[string]any {
	byDate := map[string]map[string]any{}
	rows, err := h.ch.Query(c.Context(), `
		SELECT toDate(event_time) AS d,
		       sum(JSONExtractFloat(properties, '$revenue')) AS rev,
		       count() AS purchases
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Revenue' AND event_time >= today() - ?
		GROUP BY d ORDER BY d ASC
	`, projectID, int64(days-1))
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var revv float64
			var p uint64
			if rows.Scan(&d, &revv, &p) == nil {
				ds := d.Format(dateFmt)
				byDate[ds] = map[string]any{"date": ds, "revenue": revv, "purchases": p}
			}
		}
	}
	out := []map[string]any{}
	start := time.Now().UTC().AddDate(0, 0, -(days - 1))
	for i := 0; i < days; i++ {
		ds := start.AddDate(0, 0, i).Format(dateFmt)
		if row, ok := byDate[ds]; ok {
			out = append(out, row)
		} else {
			out = append(out, map[string]any{"date": ds, "revenue": 0.0, "purchases": uint64(0)})
		}
	}
	return out
}

// revBreakdown: revenue + purchases grouped by a Revenue property ($productId/$revenueType/$currency).
func (h *ProductHandler) revBreakdown(c fiber.Ctx, projectID string, win int64, prop string) []map[string]any {
	out := []map[string]any{}
	rows, err := h.ch.Query(c.Context(), `
		SELECT JSONExtractString(properties, ?) AS v,
		       sum(JSONExtractFloat(properties, '$revenue')) AS rev,
		       count() AS purchases
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Revenue' AND event_time >= today() - ?
		GROUP BY v ORDER BY rev DESC LIMIT 10
	`, prop, projectID, win)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		var revv float64
		var p uint64
		if rows.Scan(&v, &revv, &p) == nil {
			if v == "" {
				v = "(none)"
			}
			out = append(out, map[string]any{"value": v, "revenue": revv, "purchases": p})
		}
	}
	return out
}

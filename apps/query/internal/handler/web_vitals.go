package handler

import (
	"math"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

// WebVitals reports Core Web Vitals at p75 (the percentile Google grades on) from
// "Page Performance" events: LCP, CLS, FCP — overall and per page — scoped to the
// active web-dashboard filters. (INP/load are emitted too; INP needs an SDK add.)
// GET /v1/projects/:id/web/vitals?days=30[&country=US&path=/pricing&...]
func (h *ProductHandler) WebVitals(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}
	since := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format(dateFmt)
	flt := webFilter(c)
	where := `project_id = ? AND event_type = 'Page Performance' AND event_time >= toDate('` + since + `')` + flt

	// p75 counts only events that actually reported each metric (JSONHas guard).
	clamp := func(x float64) float64 {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0
		}
		return x
	}

	var lcp, cls, fcp, inp, load float64
	var samples uint64
	_ = h.ch.QueryRow(ctx, `
		SELECT
			quantileIf(0.75)(JSONExtractFloat(properties,'lcp_ms'), JSONHas(properties,'lcp_ms')) AS lcp,
			quantileIf(0.75)(JSONExtractFloat(properties,'cls'),    JSONHas(properties,'cls'))    AS cls,
			quantileIf(0.75)(JSONExtractFloat(properties,'fcp_ms'), JSONHas(properties,'fcp_ms')) AS fcp,
			quantileIf(0.75)(JSONExtractFloat(properties,'inp_ms'), JSONHas(properties,'inp_ms')) AS inp,
			quantileIf(0.75)(JSONExtractFloat(properties,'load_ms'),JSONHas(properties,'load_ms'))AS load,
			count() AS samples
		FROM inspectuser.events WHERE `+where, projectID).
		Scan(&lcp, &cls, &fcp, &inp, &load, &samples)

	// Per-page p75 (top pages by sample volume).
	pages := []fiber.Map{}
	if rows, err := h.ch.Query(ctx, `
		SELECT path, samples, lcp, cls, fcp, inp FROM (
			SELECT JSONExtractString(properties,'path') AS path, count() AS samples,
				quantileIf(0.75)(JSONExtractFloat(properties,'lcp_ms'), JSONHas(properties,'lcp_ms')) AS lcp,
				quantileIf(0.75)(JSONExtractFloat(properties,'cls'),    JSONHas(properties,'cls'))    AS cls,
				quantileIf(0.75)(JSONExtractFloat(properties,'fcp_ms'), JSONHas(properties,'fcp_ms')) AS fcp,
				quantileIf(0.75)(JSONExtractFloat(properties,'inp_ms'), JSONHas(properties,'inp_ms')) AS inp
			FROM inspectuser.events WHERE `+where+`
			GROUP BY path
		) ORDER BY samples DESC LIMIT 12
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var path string
			var s uint64
			var pl, pc, pf, pi float64
			if rows.Scan(&path, &s, &pl, &pc, &pf, &pi) != nil {
				continue
			}
			if path == "" {
				path = "(no path)"
			}
			pages = append(pages, fiber.Map{
				"value": path, "samples": s,
				"lcp": clamp(pl), "cls": clamp(pc), "fcp": clamp(pf), "inp": clamp(pi),
			})
		}
	}

	return c.JSON(fiber.Map{
		"samples": samples,
		"lcp":     clamp(lcp), // ms — good ≤2500, poor >4000
		"cls":     clamp(cls), // unitless — good ≤0.1, poor >0.25
		"inp":     clamp(inp), // ms — good ≤200, poor >500
		"fcp":     clamp(fcp), // ms — good ≤1800, poor >3000
		"load":    clamp(load),
		"pages":   pages,
	})
}

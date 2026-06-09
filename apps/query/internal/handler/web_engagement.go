package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

// autocapture/system events excluded from the "custom events" report — anything
// the customer explicitly track()s (and isn't $-prefixed) is a custom event.
const notCustom = `event_type NOT IN (
	'Page Viewed','Element Clicked','Form Started','Form Submitted','Input Changed',
	'Scroll Depth','File Downloaded','Page Performance','Revenue','session_start'
) AND NOT startsWith(event_type, '$')`

// WebEngagement surfaces three reports off data the SDK already collects: file
// downloads, custom (non-autocapture) events, and scroll-depth reach — all
// scoped to the active web-dashboard filters.
// GET /v1/projects/:id/web/engagement?days=30[&country=US&path=/pricing&...]
func (h *ProductHandler) WebEngagement(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}
	since := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format(dateFmt)
	flt := webFilter(c)
	win := `project_id = ? AND event_time >= toDate('` + since + `')` + flt

	// 1) Top downloaded files.
	downloads := []fiber.Map{}
	if rows, err := h.ch.Query(ctx, `
		SELECT href, count() AS downloads, uniq(id) AS visitors FROM (
			SELECT JSONExtractString(properties,'href') AS href, `+identityExpr+` AS id
			FROM inspectuser.events WHERE `+win+` AND event_type = 'File Downloaded'
		)
		GROUP BY href ORDER BY downloads DESC LIMIT 12
	`, projectID); err == nil {
		for rows.Next() {
			var href string
			var d, v uint64
			if rows.Scan(&href, &d, &v) == nil {
				if href == "" {
					href = "(unknown)"
				}
				downloads = append(downloads, fiber.Map{"value": href, "downloads": d, "visitors": v})
			}
		}
		rows.Close()
	}

	// 1b) Outbound link clicks by destination domain.
	outbound := []fiber.Map{}
	if rows, err := h.ch.Query(ctx, `
		SELECT domain, count() AS clicks, uniq(id) AS visitors FROM (
			SELECT JSONExtractString(properties,'domain') AS domain, `+identityExpr+` AS id
			FROM inspectuser.events WHERE `+win+` AND event_type = 'Outbound Link Clicked'
		)
		GROUP BY domain ORDER BY clicks DESC LIMIT 12
	`, projectID); err == nil {
		for rows.Next() {
			var domain string
			var cl, v uint64
			if rows.Scan(&domain, &cl, &v) == nil {
				if domain == "" {
					domain = "(unknown)"
				}
				outbound = append(outbound, fiber.Map{"value": domain, "clicks": cl, "visitors": v})
			}
		}
		rows.Close()
	}

	// 2) Custom events (anything explicitly track()'d).
	customEvents := []fiber.Map{}
	if rows, err := h.ch.Query(ctx, `
		SELECT event_type AS name, count() AS events, uniq(`+identityExpr+`) AS visitors
		FROM inspectuser.events WHERE `+win+` AND `+notCustom+`
		GROUP BY name ORDER BY events DESC LIMIT 15
	`, projectID); err == nil {
		for rows.Next() {
			var name string
			var e, v uint64
			if rows.Scan(&name, &e, &v) == nil {
				customEvents = append(customEvents, fiber.Map{"value": name, "events": e, "visitors": v})
			}
		}
		rows.Close()
	}

	// 2b) Time on page: average foreground engagement per page (Page Engagement).
	timeOnPage := []fiber.Map{}
	if rows, err := h.ch.Query(ctx, `
		SELECT path, count() AS views, avg(ms) AS avg_ms FROM (
			SELECT JSONExtractString(properties,'path') AS path, JSONExtractInt(properties,'engaged_ms') AS ms
			FROM inspectuser.events WHERE `+win+` AND event_type = 'Page Engagement'
		)
		GROUP BY path ORDER BY views DESC LIMIT 12
	`, projectID); err == nil {
		for rows.Next() {
			var path string
			var views uint64
			var avgMs float64
			if rows.Scan(&path, &views, &avgMs) == nil {
				if path == "" {
					path = "(no path)"
				}
				timeOnPage = append(timeOnPage, fiber.Map{"value": path, "views": views, "avg_ms": avgMs})
			}
		}
		rows.Close()
	}

	// 3) Scroll-depth reach: visitors who reached each milestone, vs all visitors.
	var base, d25, d50, d75, d100 uint64
	_ = h.ch.QueryRow(ctx, `SELECT uniq(`+identityExpr+`) FROM inspectuser.events WHERE `+win+` AND event_type = 'Page Viewed'`, projectID).Scan(&base)
	_ = h.ch.QueryRow(ctx, `
		SELECT
			uniqIf(`+identityExpr+`, JSONExtractInt(properties,'depth') >= 25)  AS d25,
			uniqIf(`+identityExpr+`, JSONExtractInt(properties,'depth') >= 50)  AS d50,
			uniqIf(`+identityExpr+`, JSONExtractInt(properties,'depth') >= 75)  AS d75,
			uniqIf(`+identityExpr+`, JSONExtractInt(properties,'depth') >= 100) AS d100
		FROM inspectuser.events WHERE `+win+` AND event_type = 'Scroll Depth'
	`, projectID).Scan(&d25, &d50, &d75, &d100)
	scroll := []fiber.Map{
		{"depth": 25, "visitors": d25}, {"depth": 50, "visitors": d50},
		{"depth": 75, "visitors": d75}, {"depth": 100, "visitors": d100},
	}

	return c.JSON(fiber.Map{
		"downloads":     downloads,
		"outbound":      outbound,
		"time_on_page":  timeOnPage,
		"custom_events": customEvents,
		"scroll":        scroll,
		"scroll_base":   base,
	})
}

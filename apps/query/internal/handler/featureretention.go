package handler

import (
	"encoding/json"
	"strconv"

	"github.com/inspectuser/query/internal/analytics"
	"github.com/gofiber/fiber/v3"
)

// FeatureRetention answers Amplitude's core feature question: do users who adopt
// a feature retain better than those who don't? The cohort is NEW users (global
// first-seen in the window); adoption is measured on their first day (the
// formation window) and retention is whether they returned on any later day — so
// the feature event itself can't inflate the return signal, and a long-tenured
// user active in the window is never mistaken for a new user (the bug an earlier
// window-relative first-day computation had). Returns adopter vs non-adopter
// return rates and the lift.
//
// GET /v1/projects/:id/feature-retention?event=<name>&days=30[&filters=...]
func (h *ProductHandler) FeatureRetention(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	event := c.Query("event")
	if event == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "event is required"})
	}
	days := 30
	if d, err := strconv.Atoi(c.Query("days")); err == nil && d > 0 {
		days = d
	}
	if days > 365 {
		days = 365
	}
	since := int64(days - 1)

	var filters []analytics.Filter
	if raw := c.Query("filters"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &filters)
	}
	seg := analytics.FilterSQL(filters)

	// fd = each user's GLOBAL first-seen day (no window floor); HAVING keeps only
	// users whose first-ever day falls in the window (true new users). adopted =
	// performed the feature on that first day; returned = active on any later day.
	rows, err := h.ch.Query(ctx, `
		SELECT adopted, toInt64(count()) AS users, toInt64(countIf(returned)) AS retained
		FROM (
			SELECT e.uid AS uid,
			       maxIf(1, e.d = f.fd AND e.et = ?) AS adopted,
			       max(e.d > f.fd) AS returned
			FROM (
				SELECT `+identityExpr+` AS uid, toDate(event_time) AS d, event_type AS et
				FROM inspectuser.events
				WHERE project_id = ? AND event_time >= today() - ?`+seg+`
			) e
			INNER JOIN (
				SELECT `+identityExpr+` AS uid, min(toDate(event_time)) AS fd
				FROM inspectuser.events
				WHERE project_id = ?`+seg+`
				GROUP BY uid
				HAVING fd >= today() - ?
			) f USING (uid)
			GROUP BY e.uid
		)
		GROUP BY adopted`,
		event, projectID, since, projectID, since)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type grp struct {
		Users     int64   `json:"users"`
		Retained  int64   `json:"retained"`
		Retention float64 `json:"retention"`
	}
	var adopters, nonAdopters grp
	for rows.Next() {
		var adopted uint8
		var users, retained int64
		if rows.Scan(&adopted, &users, &retained) != nil {
			continue
		}
		g := grp{Users: users, Retained: retained}
		if users > 0 {
			g.Retention = float64(retained) / float64(users)
		}
		if adopted == 1 {
			adopters = g
		} else {
			nonAdopters = g
		}
	}

	return c.JSON(fiber.Map{
		"event":        event,
		"window_days":  days,
		"adopters":     adopters,
		"non_adopters": nonAdopters,
		"lift":         adopters.Retention - nonAdopters.Retention,
	})
}

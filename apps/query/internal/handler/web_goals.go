package handler

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

// WebGoals reports each goal's conversions and conversion rate, scoped to the
// active web-dashboard filters (same params as the web report). A goal converts
// when a FILTERED visitor performs it — so "source=Google" shows conversions
// among Google visitors, not just events that carry the property (Plausible
// semantics). Goal types: "event" (event_type match) or "page" (Page Viewed on a
// path). GET /v1/projects/:id/web/goals?days=30[&country=US&...]
func (h *ProductHandler) WebGoals(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 7 && n <= 90 {
		days = n
	}
	since := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format(dateFmt)
	flt := webFilter(c)
	base := `project_id = ? AND event_type = 'Page Viewed' AND event_time >= toDate('` + since + `')` + flt

	// Denominator: distinct filtered visitors in the window.
	var visitors uint64
	_ = h.ch.QueryRow(ctx, `SELECT uniq(`+identityExpr+`) FROM inspectuser.events WHERE `+base, projectID).Scan(&visitors)

	pctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	grows, err := h.db.Query(pctx, `SELECT id::text, name, type, match FROM web_goals WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	type goal struct{ id, name, gtype, match string }
	goals := []goal{}
	for grows.Next() {
		var g goal
		if grows.Scan(&g.id, &g.name, &g.gtype, &g.match) == nil {
			goals = append(goals, g)
		}
	}
	grows.Close()

	out := []fiber.Map{}
	for _, g := range goals {
		// Goal predicate: an event_type, or a Page Viewed on a specific path.
		cond := "event_type = '" + sqlStrip(g.match) + "'"
		if g.gtype == "page" {
			cond = "event_type = 'Page Viewed' AND JSONExtractString(properties, 'path') = '" + sqlStrip(g.match) + "'"
		}
		var conv uint64
		_ = h.ch.QueryRow(ctx, `
			SELECT uniq(gg.id) FROM
				(SELECT DISTINCT `+identityExpr+` AS id FROM inspectuser.events
				 WHERE project_id = ? AND `+cond+` AND event_time >= toDate('`+since+`')) gg
			INNER JOIN
				(SELECT DISTINCT `+identityExpr+` AS id FROM inspectuser.events WHERE `+base+`) v
			ON gg.id = v.id
		`, projectID, projectID).Scan(&conv)
		rate := 0.0
		if visitors > 0 {
			rate = float64(conv) / float64(visitors)
		}
		out = append(out, fiber.Map{
			"id": g.id, "name": g.name, "type": g.gtype, "match": g.match,
			"conversions": conv, "rate": rate,
		})
	}
	return c.JSON(fiber.Map{"visitors": visitors, "goals": out})
}

// POST /v1/projects/:id/web/goals — {name, type:event|page, match}
func (h *ProductHandler) CreateWebGoal(c fiber.Ctx) error {
	projectID := c.Params("id")
	var b struct {
		Name  string `json:"name"`
		Type  string `json:"type"`
		Match string `json:"match"`
	}
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Name == "" || b.Match == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and match are required"})
	}
	if b.Type != "page" {
		b.Type = "event"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	if err := h.db.QueryRow(ctx,
		`INSERT INTO web_goals (project_id, name, type, match) VALUES ($1,$2,$3,$4) RETURNING id::text`,
		projectID, b.Name, b.Type, b.Match,
	).Scan(&id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// DELETE /v1/projects/:id/web/goals/:goalId
func (h *ProductHandler) DeleteWebGoal(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := h.db.Exec(ctx, `DELETE FROM web_goals WHERE id = $1 AND project_id = $2`,
		c.Params("goalId"), c.Params("id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

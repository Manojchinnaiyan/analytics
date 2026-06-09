package handler

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// featureDef is a named group of events that together represent one product
// feature (Amplitude lets you analyze a "feature" made of several events).
type featureDef struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Events []string `json:"events"`
}

func sqlQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// loadFeatureDefs returns the project's feature definitions.
func (h *ProductHandler) loadFeatureDefs(ctx context.Context, projectID string) []featureDef {
	out := []featureDef{}
	rows, err := h.db.Query(ctx,
		`SELECT id, name, events FROM feature_definitions WHERE project_id = $1 ORDER BY name`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var f featureDef
		if rows.Scan(&f.ID, &f.Name, &f.Events) == nil {
			out = append(out, f)
		}
	}
	return out
}

// featureGroupExpr builds a ClickHouse expression mapping each event_type to its
// feature name (first matching definition wins); unmatched events map to '' and
// are dropped by the caller.
func featureGroupExpr(defs []featureDef) string {
	var b strings.Builder
	b.WriteString("multiIf(")
	for _, d := range defs {
		if len(d.Events) == 0 {
			continue
		}
		quoted := make([]string, len(d.Events))
		for i, e := range d.Events {
			quoted[i] = sqlQuote(e)
		}
		b.WriteString("event_type IN (" + strings.Join(quoted, ",") + "), " + sqlQuote(d.Name) + ", ")
	}
	b.WriteString("'')")
	return b.String()
}

// GET /v1/projects/:id/features — list feature definitions.
func (h *ProductHandler) ListFeatures(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"features": h.loadFeatureDefs(c.Context(), c.Params("id"))})
}

// POST /v1/projects/:id/features — create a feature definition {name, events[]}.
func (h *ProductHandler) CreateFeature(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Name   string   `json:"name"`
		Events []string `json:"events"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Events) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and at least one event are required"})
	}
	var id string
	err := h.db.QueryRow(c.Context(),
		`INSERT INTO feature_definitions (project_id, name, events) VALUES ($1, $2, $3) RETURNING id`,
		projectID, body.Name, body.Events).Scan(&id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create feature"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id, "name": body.Name, "events": body.Events})
}

// DELETE /v1/projects/:id/features/:featureId — remove a feature definition.
func (h *ProductHandler) DeleteFeature(c fiber.Ctx) error {
	tag, err := h.db.Exec(c.Context(),
		`DELETE FROM feature_definitions WHERE id = $1 AND project_id = $2`, c.Params("featureId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "feature not found"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

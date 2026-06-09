package handler

import (
	"context"
	"time"

	"github.com/inspectuser/query/internal/analytics"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type DerivedHandler struct {
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewDerivedHandler(db *pgxpool.Pool, log *zap.Logger) *DerivedHandler {
	return &DerivedHandler{db: db, log: log}
}

// GET /v1/projects/:id/derived
func (h *DerivedHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, source_property, source_type, transform, COALESCE(config,'') FROM derived_properties
		WHERE project_id=$1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, name, src, srcType, transform, config string
		if rows.Scan(&id, &name, &src, &srcType, &transform, &config) == nil {
			out = append(out, fiber.Map{
				"id": id, "name": name, "source_property": src, "source_type": srcType,
				"transform": transform, "config": config,
			})
		}
	}
	return c.JSON(fiber.Map{"derived": out})
}

// POST /v1/projects/:id/derived  {name, source_property, source_type, transform, config}
func (h *DerivedHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var b struct {
		Name           string `json:"name"`
		SourceProperty string `json:"source_property"`
		SourceType     string `json:"source_type"`
		Transform      string `json:"transform"`
		Config         string `json:"config"`
	}
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Name == "" || b.SourceProperty == "" || b.Transform == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, source_property and transform are required"})
	}
	if b.SourceType == "" {
		b.SourceType = "event"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	if err := h.db.QueryRow(ctx, `
		INSERT INTO derived_properties (project_id, name, source_property, source_type, transform, config)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
	`, projectID, b.Name, b.SourceProperty, b.SourceType, b.Transform, b.Config).Scan(&id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// DELETE /v1/projects/:id/derived/:derivedId
func (h *DerivedHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM derived_properties WHERE id=$1 AND project_id=$2`, c.Params("derivedId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

// resolveDerivedFilters compiles any derived-property filters into RawExpr so the
// query engine substitutes the computed expression. No-op if none are derived.
func (h *QueryHandler) resolveDerivedFilters(projectID string, filters []analytics.Filter) {
	hasDerived := false
	for _, f := range filters {
		if f.Type == "derived" {
			hasDerived = true
			break
		}
	}
	if !hasDerived {
		return
	}
	exprs := h.derivedExprMap(projectID)
	for i := range filters {
		if filters[i].Type == "derived" {
			if e, ok := exprs[filters[i].Property]; ok {
				filters[i].RawExpr = e
			}
		}
	}
}

// derivedExprMap loads the project's derived properties as name → compiled
// ClickHouse expression, so the query handlers can substitute them in filters.
func (h *QueryHandler) derivedExprMap(projectID string) map[string]string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out := map[string]string{}
	rows, err := h.db.Query(ctx, `SELECT name, source_property, source_type, transform, COALESCE(config,'') FROM derived_properties WHERE project_id=$1`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name, src, srcType, transform, config string
		if rows.Scan(&name, &src, &srcType, &transform, &config) == nil {
			out[name] = analytics.DerivedExpr(src, srcType, transform, config)
		}
	}
	return out
}

package handler

import (
	"context"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type DashboardHandler struct {
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewDashboardHandler(db *pgxpool.Pool, log *zap.Logger) *DashboardHandler {
	return &DashboardHandler{db: db, log: log}
}

// GET /v1/projects/:id/dashboard — all saved charts for the project.
func (h *DashboardHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, type, config, created_at
		FROM charts WHERE project_id = $1 ORDER BY created_at ASC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, ctype, config string
		var createdAt time.Time
		if rows.Scan(&id, &name, &ctype, &config, &createdAt) != nil {
			continue
		}
		var cfg map[string]any
		_ = sonic.Unmarshal([]byte(config), &cfg)
		out = append(out, fiber.Map{"id": id, "name": name, "type": ctype, "config": cfg, "created_at": createdAt})
	}
	return c.JSON(fiber.Map{"charts": out})
}

// POST /v1/projects/:id/dashboard/charts — save a chart config.
func (h *DashboardHandler) SaveChart(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Name   string         `json:"name"`
		Type   string         `json:"type"`
		Config map[string]any `json:"config"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.Name == "" || body.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and type are required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cfgJSON, _ := sonic.Marshal(body.Config)

	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO charts (project_id, name, type, config) VALUES ($1, $2, $3, $4) RETURNING id
	`, projectID, body.Name, body.Type, string(cfgJSON)).Scan(&id)
	if err != nil {
		h.log.Error("save chart failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save chart"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// DELETE /v1/projects/:id/dashboard/charts/:chartId
func (h *DashboardHandler) DeleteChart(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM charts WHERE id = $1 AND project_id = $2`,
		c.Params("chartId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

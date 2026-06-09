package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/amplitude-clone/query/internal/warehouse"
)

type WarehouseHandler struct {
	db  *pgxpool.Pool
	exp *warehouse.Exporter
	log *zap.Logger
}

func NewWarehouseHandler(db *pgxpool.Pool, exp *warehouse.Exporter, log *zap.Logger) *WarehouseHandler {
	return &WarehouseHandler{db: db, exp: exp, log: log}
}

// GET /v1/projects/:id/exports
func (h *WarehouseHandler) List(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id::text, endpoint, bucket, COALESCE(prefix,'events'), interval_minutes, enabled,
		       COALESCE(last_status,''), last_run, rows_exported
		FROM warehouse_exports WHERE project_id = $1 ORDER BY created_at DESC
	`, c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, endpoint, bucket, prefix, status string
		var interval int
		var enabled bool
		var lastRun *time.Time
		var rowsExported int64
		if rows.Scan(&id, &endpoint, &bucket, &prefix, &interval, &enabled, &status, &lastRun, &rowsExported) != nil {
			continue
		}
		out = append(out, fiber.Map{
			"id": id, "endpoint": endpoint, "bucket": bucket, "prefix": prefix,
			"interval_minutes": interval, "enabled": enabled, "last_status": status,
			"last_run": lastRun, "rows_exported": rowsExported,
		})
	}
	return c.JSON(fiber.Map{"exports": out})
}

// POST /v1/projects/:id/exports
func (h *WarehouseHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var b struct {
		Endpoint     string `json:"endpoint"`
		Bucket       string `json:"bucket"`
		Prefix       string `json:"prefix"`
		AccessKey    string `json:"access_key"`
		SecretKey    string `json:"secret_key"`
		IntervalMin  int    `json:"interval_minutes"`
	}
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Endpoint == "" || b.Bucket == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "endpoint and bucket are required"})
	}
	if b.Prefix == "" {
		b.Prefix = "events"
	}
	if b.IntervalMin < 5 {
		b.IntervalMin = 60
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO warehouse_exports (project_id, endpoint, bucket, prefix, access_key, secret_key, interval_minutes)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text
	`, projectID, b.Endpoint, b.Bucket, b.Prefix, b.AccessKey, b.SecretKey, b.IntervalMin).Scan(&id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// POST /v1/projects/:id/exports/:exportId/run — export immediately.
func (h *WarehouseHandler) RunNow(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := h.exp.RunByID(ctx, c.Params("exportId"), c.Params("id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /v1/projects/:id/exports/:exportId
func (h *WarehouseHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := h.db.Exec(ctx, `DELETE FROM warehouse_exports WHERE id = $1 AND project_id = $2`,
		c.Params("exportId"), c.Params("id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

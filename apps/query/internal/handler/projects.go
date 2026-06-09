package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type ProjectHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	log *zap.Logger
}

func NewProjectHandler(db *pgxpool.Pool, rdb *redis.Client, log *zap.Logger) *ProjectHandler {
	return &ProjectHandler{db: db, rdb: rdb, log: log}
}

// GET /v1/projects — list all projects in the caller's org.
func (h *ProjectHandler) List(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, api_key FROM projects WHERE org_id = $1 ORDER BY created_at ASC
	`, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, apiKey string
		if rows.Scan(&id, &name, &apiKey) == nil {
			out = append(out, fiber.Map{"project_id": id, "name": name, "api_key": apiKey})
		}
	}
	return c.JSON(fiber.Map{"projects": out})
}

// POST /v1/projects — create a project in the caller's org.
func (h *ProjectHandler) Create(c fiber.Ctx) error {
	var body struct {
		OrgID string `json:"org_id"`
		Name  string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	// Always bind the project to the caller's own org — never trust a client
	// supplied org_id, or a user could create projects inside another tenant.
	body.OrgID, _ = c.Locals("org_id").(string)
	if body.Name == "" || body.OrgID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	apiKey := "amp_" + generateKey(32)
	secretKey := "amp_secret_" + generateKey(32)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var projectID string
	err := h.db.QueryRow(ctx, `
		INSERT INTO projects (org_id, name, api_key, secret_key)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, body.OrgID, body.Name, apiKey, secretKey).Scan(&projectID)
	if err != nil {
		h.log.Error("failed to create project", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create project"})
	}

	// Seed api_key → project_id into Redis so ingestion can validate instantly
	if err := h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0).Err(); err != nil {
		h.log.Warn("failed to seed api key in redis", zap.Error(err))
	}
	h.rdb.Set(ctx, "projorg:"+projectID, body.OrgID, time.Hour)
	h.rdb.Set(ctx, "usage:limit:"+projectID, 0, 0) // new project: unlimited

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"project_id": projectID,
		"api_key":    apiKey,
		"secret_key": secretKey,
		"name":       body.Name,
	})
}

// PUT /v1/projects/:id/usage/limit — set the monthly event cap (0 = unlimited).
// Owner/admin only. Mirrors the limit into Redis so ingestion enforces it.
func (h *ProjectHandler) SetUsageLimit(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		EventLimit int64 `json:"event_limit"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.EventLimit < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "event_limit must be >= 0"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := h.db.Exec(ctx, `UPDATE projects SET event_limit = $1 WHERE id = $2`, body.EventLimit, projectID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update quota"})
	}
	h.rdb.Set(ctx, "usage:limit:"+projectID, body.EventLimit, 0)
	return c.JSON(fiber.Map{"event_limit": body.EventLimit})
}

// GET /v1/projects/:id
func (h *ProjectHandler) Get(c fiber.Ctx) error {
	projectID := c.Params("id")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var name, apiKey, timezone string
	err := h.db.QueryRow(ctx, `
		SELECT name, api_key, COALESCE(timezone, 'UTC') FROM projects WHERE id = $1
	`, projectID).Scan(&name, &apiKey, &timezone)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "project not found"})
	}

	return c.JSON(fiber.Map{
		"project_id": projectID,
		"name":       name,
		"api_key":    apiKey,
		"timezone":   timezone,
	})
}

// PUT /v1/projects/:id/timezone — set the reporting timezone (settings.manage).
func (h *ProjectHandler) SetTimezone(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Timezone string `json:"timezone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	// Validate against Go's tz database so we never store a bad zone.
	if _, err := time.LoadLocation(body.Timezone); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid timezone"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := h.db.Exec(ctx, `UPDATE projects SET timezone = $1 WHERE id = $2`, body.Timezone, projectID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update timezone"})
	}
	return c.JSON(fiber.Map{"timezone": body.Timezone})
}

// POST /v1/orgs
func (h *ProjectHandler) CreateOrg(c fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	if body.Name == "" || body.Slug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and slug are required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var orgID string
	err := h.db.QueryRow(ctx, `
		INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id
	`, body.Name, body.Slug).Scan(&orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create org"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"org_id": orgID,
		"name":   body.Name,
		"slug":   body.Slug,
	})
}

func generateKey(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

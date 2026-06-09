package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type LinkHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	log *zap.Logger
}

func NewLinkHandler(db *pgxpool.Pool, rdb *redis.Client, log *zap.Logger) *LinkHandler {
	return &LinkHandler{db: db, rdb: rdb, log: log}
}

// linkConfig is what the ingestion redirect endpoint reads from Redis.
type linkConfig struct {
	Destination string `json:"destination"`
	UTMSource   string `json:"utm_source"`
	UTMMedium   string `json:"utm_medium"`
	UTMCampaign string `json:"utm_campaign"`
	Extra       string `json:"extra"` // raw query params to pass through (e.g. key=...&api=...)
}

func shortSlug() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// POST /v1/projects/:id/links — create a smart link.
func (h *LinkHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Destination string `json:"destination"`
		UTMSource   string `json:"utm_source"`
		UTMMedium   string `json:"utm_medium"`
		UTMCampaign string `json:"utm_campaign"`
		Extra       string `json:"extra"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.Destination == "" || body.UTMSource == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "destination and utm_source are required"})
	}
	slug := body.Slug
	if slug == "" {
		slug = shortSlug()
	}
	if body.Name == "" {
		body.Name = body.UTMSource
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cfg := linkConfig{
		Destination: body.Destination, UTMSource: body.UTMSource, UTMMedium: body.UTMMedium,
		UTMCampaign: body.UTMCampaign, Extra: body.Extra,
	}
	cfgJSON, _ := sonic.Marshal(cfg)

	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO links (project_id, name, slug, config) VALUES ($1, $2, $3, $4)
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, config = EXCLUDED.config
		RETURNING id
	`, projectID, body.Name, slug, string(cfgJSON)).Scan(&id)
	if err != nil {
		h.log.Error("create link failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create link"})
	}

	// Seed Redis so the ingestion redirect can resolve instantly.
	h.rdb.Set(ctx, "link:"+slug, string(cfgJSON), 0)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id, "slug": slug, "name": body.Name})
}

// GET /v1/projects/:id/links — list smart links with click counts.
func (h *LinkHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, slug, config, created_at FROM links WHERE project_id = $1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, slug, cfgStr string
		var createdAt time.Time
		if rows.Scan(&id, &name, &slug, &cfgStr, &createdAt) != nil {
			continue
		}
		var cfg linkConfig
		_ = sonic.Unmarshal([]byte(cfgStr), &cfg)
		clicks, _ := h.rdb.Get(ctx, "linkclicks:"+slug).Int64()
		out = append(out, fiber.Map{
			"id": id, "name": name, "slug": slug,
			"utm_source": cfg.UTMSource, "utm_medium": cfg.UTMMedium, "utm_campaign": cfg.UTMCampaign,
			"destination": cfg.Destination, "clicks": clicks, "created_at": createdAt,
		})
	}
	return c.JSON(fiber.Map{"links": out})
}

// DELETE /v1/projects/:id/links/:linkId
func (h *LinkHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var slug string
	_ = h.db.QueryRow(ctx, `SELECT slug FROM links WHERE id = $1 AND project_id = $2`,
		c.Params("linkId"), c.Params("id")).Scan(&slug)
	_, err := h.db.Exec(ctx, `DELETE FROM links WHERE id = $1 AND project_id = $2`,
		c.Params("linkId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if slug != "" {
		h.rdb.Del(ctx, "link:"+slug)
	}
	return c.JSON(fiber.Map{"deleted": true})
}

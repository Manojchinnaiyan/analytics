package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/inspectuser/query/internal/analytics"
	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type DashboardHandler struct {
	db  *pgxpool.Pool
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewDashboardHandler(db *pgxpool.Pool, ch clickhouse.Conn, log *zap.Logger) *DashboardHandler {
	return &DashboardHandler{db: db, ch: ch, log: log}
}

func shareToken() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// chartConfig is the saved-chart shape used to recompute data for public views.
type chartConfig struct {
	EventType string `json:"event_type"`
	Metric    string `json:"metric"`
	Property  string `json:"property"`
	GroupBy   string `json:"group_by"`
	Days      int    `json:"days"`
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

// GET /v1/projects/:id/dashboard/share — current public-share token (or null).
func (h *DashboardHandler) GetShare(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var token string
	if err := h.db.QueryRow(ctx, `SELECT token FROM dashboard_shares WHERE project_id = $1`, c.Params("id")).Scan(&token); err != nil {
		return c.JSON(fiber.Map{"token": nil})
	}
	return c.JSON(fiber.Map{"token": token})
}

// POST /v1/projects/:id/dashboard/share — make the dashboard public (idempotent).
func (h *DashboardHandler) EnableShare(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var token string
	err := h.db.QueryRow(ctx, `
		INSERT INTO dashboard_shares (token, project_id, name)
		VALUES ($1, $2, (SELECT name FROM projects WHERE id = $2))
		ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name
		RETURNING token
	`, shareToken(), projectID).Scan(&token)
	if err != nil {
		h.log.Error("enable share failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to enable sharing"})
	}
	return c.JSON(fiber.Map{"token": token})
}

// DELETE /v1/projects/:id/dashboard/share — revoke the public link.
func (h *DashboardHandler) DisableShare(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = h.db.Exec(ctx, `DELETE FROM dashboard_shares WHERE project_id = $1`, c.Params("id"))
	return c.JSON(fiber.Map{"disabled": true})
}

// GET /public/dashboard/:token — NO AUTH. Resolves the share token, recomputes
// each saved chart server-side, and returns name + chart data so a logged-out
// viewer can render the dashboard read-only.
func (h *DashboardHandler) PublicDashboard(c fiber.Ctx) error {
	token := c.Params("token")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var projectID, name string
	if err := h.db.QueryRow(ctx,
		`SELECT project_id, name FROM dashboard_shares WHERE token = $1`, token).Scan(&projectID, &name); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "dashboard not found"})
	}

	rows, err := h.db.Query(ctx,
		`SELECT id, name, type, config FROM charts WHERE project_id = $1 ORDER BY created_at ASC`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, cname, ctype, configStr string
		if rows.Scan(&id, &cname, &ctype, &configStr) != nil {
			continue
		}
		var cfg chartConfig
		_ = sonic.Unmarshal([]byte(configStr), &cfg)
		days := cfg.Days
		if days <= 0 {
			days = 30
		}
		metric := cfg.Metric
		if metric == "" {
			metric = "totals"
		}
		end := time.Now().UTC()
		data, qerr := analytics.Segmentation(ctx, h.ch, analytics.SegmentationQuery{
			ProjectID:   projectID,
			EventType:   cfg.EventType,
			StartDate:   end.AddDate(0, 0, -days),
			EndDate:     end,
			Granularity: "day",
			GroupBy:     cfg.GroupBy,
			Metric:      metric,
			Property:    cfg.Property,
		})
		if qerr != nil {
			data = nil
		}
		out = append(out, fiber.Map{
			"id": id, "name": cname, "type": ctype,
			"config": map[string]any{"metric": metric, "group_by": cfg.GroupBy, "event_type": cfg.EventType},
			"data": data,
		})
	}
	return c.JSON(fiber.Map{"name": name, "charts": out})
}

package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type AlertHandler struct {
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewAlertHandler(db *pgxpool.Pool, log *zap.Logger) *AlertHandler {
	return &AlertHandler{db: db, log: log}
}

var alertMetrics = map[string]bool{"count": true, "unique_users": true}
var alertOperators = map[string]bool{"above": true, "below": true}

// GET /v1/projects/:id/alerts — list alert rules with their current state.
func (h *AlertHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, event_type, metric, window_minutes, operator, threshold, COALESCE(mode,'threshold'),
		       COALESCE(webhook_url, ''), enabled, is_triggered, last_value, last_checked_at, last_triggered_at
		FROM alerts WHERE project_id = $1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, eventType, metric, operator, mode, webhook string
		var windowMin int
		var threshold, lastValue float64
		var enabled, isTriggered bool
		var lastChecked, lastTriggered *time.Time
		if rows.Scan(&id, &name, &eventType, &metric, &windowMin, &operator, &threshold, &mode,
			&webhook, &enabled, &isTriggered, &lastValue, &lastChecked, &lastTriggered) != nil {
			continue
		}
		out = append(out, fiber.Map{
			"id": id, "name": name, "event_type": eventType, "metric": metric,
			"window_minutes": windowMin, "operator": operator, "threshold": threshold, "mode": mode,
			"webhook_url": webhook, "enabled": enabled, "is_triggered": isTriggered,
			"last_value": lastValue, "last_checked_at": lastChecked, "last_triggered_at": lastTriggered,
		})
	}
	return c.JSON(fiber.Map{"alerts": out})
}

type alertBody struct {
	Name       string  `json:"name"`
	EventType  string  `json:"event_type"`
	Metric     string  `json:"metric"`
	WindowMin  int     `json:"window_minutes"`
	Operator   string  `json:"operator"`
	Threshold  float64 `json:"threshold"`
	Mode       string  `json:"mode"` // threshold | change
	WebhookURL string  `json:"webhook_url"`
	Enabled    *bool   `json:"enabled"`
}

func (b *alertBody) normalize() {
	if !alertMetrics[b.Metric] {
		b.Metric = "count"
	}
	if !alertOperators[b.Operator] {
		b.Operator = "above"
	}
	if b.Mode != "change" {
		b.Mode = "threshold"
	}
	if b.WindowMin < 1 || b.WindowMin > 10080 {
		b.WindowMin = 60
	}
}

// POST /v1/projects/:id/alerts
func (h *AlertHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var b alertBody
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Name == "" || b.EventType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and event_type are required"})
	}
	b.normalize()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO alerts (project_id, name, event_type, metric, window_minutes, operator, threshold, mode, webhook_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
	`, projectID, b.Name, b.EventType, b.Metric, b.WindowMin, b.Operator, b.Threshold, b.Mode, b.WebhookURL).Scan(&id)
	if err != nil {
		h.log.Error("create alert failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// PUT /v1/projects/:id/alerts/:alertId — full update (also used to toggle enabled).
func (h *AlertHandler) Update(c fiber.Ctx) error {
	projectID := c.Params("id")
	alertID := c.Params("alertId")
	var b alertBody
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	b.normalize()
	enabled := true
	if b.Enabled != nil {
		enabled = *b.Enabled
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Reset trigger state on edit so the rule can fire fresh.
	tag, err := h.db.Exec(ctx, `
		UPDATE alerts SET name=$1, event_type=$2, metric=$3, window_minutes=$4, operator=$5,
		       threshold=$6, mode=$7, webhook_url=$8, enabled=$9, is_triggered=false
		WHERE id=$10 AND project_id=$11
	`, b.Name, b.EventType, b.Metric, b.WindowMin, b.Operator, b.Threshold, b.Mode, b.WebhookURL, enabled, alertID, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "alert not found"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /v1/projects/:id/alerts/:alertId
func (h *AlertHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM alerts WHERE id=$1 AND project_id=$2`,
		c.Params("alertId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

// GET /v1/projects/:id/alerts/events — recent triggered notifications.
func (h *AlertHandler) Events(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT e.id, e.message, e.value, e.threshold, e.created_at, COALESCE(a.name, 'deleted alert')
		FROM alert_events e LEFT JOIN alerts a ON a.id = e.alert_id
		WHERE e.project_id = $1 ORDER BY e.created_at DESC LIMIT 50
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, message, name string
		var value, threshold float64
		var createdAt time.Time
		if rows.Scan(&id, &message, &value, &threshold, &createdAt, &name) != nil {
			continue
		}
		out = append(out, fiber.Map{
			"id": id, "message": message, "value": value, "threshold": threshold,
			"created_at": createdAt, "alert_name": name,
		})
	}
	return c.JSON(fiber.Map{"events": out})
}

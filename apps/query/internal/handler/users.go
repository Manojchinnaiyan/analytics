package handler

import (
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
)

type UserHandler struct {
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewUserHandler(ch clickhouse.Conn, log *zap.Logger) *UserHandler {
	return &UserHandler{ch: ch, log: log}
}

// GET /v1/projects/:id/users?search=&limit= — list users with activity summary.
// Identity is resolved (user_id when present, else the anonymous device_id), so
// anonymous visitors show up too — not just logged-in users.
func (h *UserHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	search := c.Query("search", "")
	limit := c.Query("limit", "50")

	sql := `
		SELECT
			id,
			max(has_uid)        AS is_known,
			count()             AS events,
			uniq(event_type)    AS event_types,
			min(event_time)     AS first_seen,
			max(event_time)     AS last_seen
		FROM (
			SELECT ` + identityExpr + ` AS id, toUInt8(user_id != '') AS has_uid, event_type, event_time
			FROM inspectuser.events
			WHERE project_id = ?
		)
		WHERE id != ''
	`
	args := []any{projectID}
	if search != "" {
		sql += ` AND id ILIKE ?`
		args = append(args, "%"+search+"%")
	}
	sql += ` GROUP BY id ORDER BY last_seen DESC LIMIT ` + sanitizeLimit(limit)

	rows, err := h.ch.Query(c.Context(), sql, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type user struct {
		UserID      string    `json:"user_id"`
		IsAnonymous bool      `json:"is_anonymous"`
		Events      uint64    `json:"events"`
		EventTypes  uint64    `json:"event_types"`
		FirstSeen   time.Time `json:"first_seen"`
		LastSeen    time.Time `json:"last_seen"`
	}
	out := []user{}
	for rows.Next() {
		var u user
		var isKnown uint8
		if err := rows.Scan(&u.UserID, &isKnown, &u.Events, &u.EventTypes, &u.FirstSeen, &u.LastSeen); err == nil {
			u.IsAnonymous = isKnown == 0
			out = append(out, u)
		}
	}
	return c.JSON(fiber.Map{"users": out})
}

// GET /v1/projects/:id/users/:userId — single user profile + event timeline
func (h *UserHandler) Profile(c fiber.Ctx) error {
	projectID := c.Params("id")
	userID := c.Params("userId")
	ctx := c.Context()

	// Summary + latest user properties
	var events, eventTypes uint64
	var firstSeen, lastSeen time.Time
	var userProps, platform, country string
	var isKnown uint8
	_ = h.ch.QueryRow(ctx, `
		SELECT
			count(),
			uniq(event_type),
			min(event_time),
			max(event_time),
			argMax(user_properties, event_time),
			argMax(platform, event_time),
			argMax(country, event_time),
			max(toUInt8(user_id != ''))
		FROM inspectuser.events
		WHERE project_id = ? AND `+identityExpr+` = ?
	`, projectID, userID).Scan(&events, &eventTypes, &firstSeen, &lastSeen, &userProps, &platform, &country, &isKnown)

	if events == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	// Event timeline (most recent 100)
	timeline := []map[string]any{}
	rows, err := h.ch.Query(ctx, `
		SELECT event_type, event_time, properties, platform
		FROM inspectuser.events
		WHERE project_id = ? AND `+identityExpr+` = ?
		ORDER BY event_time DESC
		LIMIT 100
	`, projectID, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var et, props, plat string
			var t time.Time
			if rows.Scan(&et, &t, &props, &plat) == nil {
				timeline = append(timeline, map[string]any{
					"event_type": et,
					"event_time": t,
					"properties": props,
					"platform":   plat,
				})
			}
		}
	}

	return c.JSON(fiber.Map{
		"user_id":         userID,
		"is_anonymous":    isKnown == 0,
		"events":          events,
		"event_types":     eventTypes,
		"first_seen":      firstSeen,
		"last_seen":       lastSeen,
		"user_properties": userProps,
		"platform":        platform,
		"country":         country,
		"timeline":        timeline,
	})
}

// sanitizeLimit clamps the limit param to digits only, default 50, max 500.
func sanitizeLimit(s string) string {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return "50"
		}
		n = n*10 + int(r-'0')
		if n > 500 {
			return "500"
		}
	}
	if n == 0 {
		return "50"
	}
	return s
}

package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type AuditHandler struct {
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewAuditHandler(db *pgxpool.Pool, log *zap.Logger) *AuditHandler {
	return &AuditHandler{db: db, log: log}
}

// GET /v1/audit — recent admin/config actions for the caller's org (team.manage).
func (h *AuditHandler) List(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT a.created_at, a.method, a.path, a.status, COALESCE(a.ip, ''),
		       COALESCE(u.email, '(removed)'), COALESCE(u.name, '')
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id
		WHERE a.org_id = $1
		ORDER BY a.created_at DESC
		LIMIT 250
	`, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	entries := []fiber.Map{}
	for rows.Next() {
		var ts time.Time
		var method, path, ip, email, name string
		var status int
		if rows.Scan(&ts, &method, &path, &status, &ip, &email, &name) != nil {
			continue
		}
		entries = append(entries, fiber.Map{
			"time": ts, "method": method, "path": path, "status": status,
			"ip": ip, "actor_email": email, "actor_name": name,
		})
	}
	return c.JSON(fiber.Map{"entries": entries})
}

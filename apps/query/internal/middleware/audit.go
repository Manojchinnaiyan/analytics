package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLog records every state-changing request (POST/PUT/DELETE) under /v1 to
// the audit_logs table — who (actor), what (method + path), the outcome (status)
// and from where (IP). Read-only analytics queries (/v1/query/*) and token
// refresh are skipped to keep the trail to meaningful admin/config actions.
// The insert runs in the background so it never adds latency to the response;
// all request values are copied out of the ctx first (fasthttp recycles it).
func AuditLog(db *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		err := c.Next()

		switch c.Method() {
		case fiber.MethodPost, fiber.MethodPut, fiber.MethodDelete, fiber.MethodPatch:
		default:
			return err
		}
		path := c.Path()
		if strings.HasPrefix(path, "/v1/query/") || strings.HasSuffix(path, "/auth/refresh") {
			return err
		}
		actor, _ := c.Locals("user_id").(string)
		org, _ := c.Locals("org_id").(string)
		if actor == "" || org == "" {
			return err
		}
		method := c.Method()
		status := c.Response().StatusCode()
		ip := c.IP()

		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, _ = db.Exec(ctx,
				`INSERT INTO audit_logs (org_id, actor_id, method, path, status, ip)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				org, actor, method, path, status, ip)
		}()
		return err
	}
}

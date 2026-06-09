package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// ProjectAuthz enforces tenant isolation: a request that targets a project (via
// the :id URL param OR a project_id in the JSON body) is only allowed if that
// project belongs to the caller's org. Without this, any authenticated user
// could read any project's data by changing the id — a multi-tenancy hole.
func ProjectAuthz(db *pgxpool.Pool, rdb *redis.Client) fiber.Handler {
	return func(c fiber.Ctx) error {
		orgID, _ := c.Locals("org_id").(string)
		if orgID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
		}

		// Resolve the project this request targets, if any. Group-level
		// middleware doesn't see route params (:id), so parse the path:
		// /v1/projects/<pid>/... → pid.
		projectID := ""
		segs := strings.Split(strings.Trim(c.Path(), "/"), "/")
		for i, s := range segs {
			if s == "projects" && i+1 < len(segs) {
				projectID = segs[i+1]
				break
			}
		}
		// Body-scoped routes (/query/*) carry project_id in the JSON body.
		if projectID == "" {
			var body struct {
				ProjectID string `json:"project_id"`
			}
			_ = c.Bind().JSON(&body) // body is buffered — handler can bind again
			projectID = body.ProjectID
		}
		if projectID == "" {
			return c.Next() // not project-scoped (e.g. /me, /team, /projects list)
		}

		if !ownsProject(db, rdb, projectID, orgID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you don't have access to this project"})
		}
		return c.Next()
	}
}

// ownsProject checks project→org ownership, cached in Redis to avoid a DB hit
// per request.
func ownsProject(db *pgxpool.Pool, rdb *redis.Client, projectID, orgID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if owner, err := rdb.Get(ctx, "projorg:"+projectID).Result(); err == nil {
		return owner == orgID
	}
	var owner string
	if db.QueryRow(ctx, `SELECT org_id FROM projects WHERE id = $1`, projectID).Scan(&owner) != nil {
		return false // unknown project → deny
	}
	rdb.Set(ctx, "projorg:"+projectID, owner, time.Hour)
	return owner == orgID
}

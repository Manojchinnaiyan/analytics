package middleware

import (
	"context"
	"encoding/json"
	"time"

	"github.com/inspectuser/query/internal/perms"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// cachedPerms is what we store in Redis per user so permission checks avoid a
// Postgres round-trip on every request.
type cachedPerms struct {
	Role  string   `json:"role"`
	Perms []string `json:"perms"`
}

func permCacheKey(userID string) string { return "userperm:" + userID }

// ResolvePerms returns a user's role and effective permission set, computed from
// their role defaults plus any per-member overrides. Results are cached in Redis
// for an hour and invalidated explicitly whenever a member's role/permissions
// change, so updates take effect immediately.
func ResolvePerms(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, userID string) (string, map[string]bool, error) {
	if raw, err := rdb.Get(ctx, permCacheKey(userID)).Bytes(); err == nil {
		var cp cachedPerms
		if json.Unmarshal(raw, &cp) == nil {
			set := make(map[string]bool, len(cp.Perms))
			for _, k := range cp.Perms {
				set[k] = true
			}
			return cp.Role, set, nil
		}
	}

	var role string
	var overridesRaw []byte
	if err := db.QueryRow(ctx, `SELECT role, COALESCE(permissions, '{}'::jsonb) FROM users WHERE id = $1`, userID).
		Scan(&role, &overridesRaw); err != nil {
		return "", nil, err
	}
	overrides := map[string]bool{}
	_ = json.Unmarshal(overridesRaw, &overrides)

	set := perms.Effective(role, overrides)
	if blob, err := json.Marshal(cachedPerms{Role: role, Perms: perms.List(set)}); err == nil {
		rdb.Set(ctx, permCacheKey(userID), blob, time.Hour)
	}
	return role, set, nil
}

// InvalidatePerms drops a user's cached permissions so the next request recomputes.
func InvalidatePerms(ctx context.Context, rdb *redis.Client, userID string) {
	rdb.Del(ctx, permCacheKey(userID))
}

// RequirePerm gates a route on a single permission key. The owner role always
// passes. Returns 403 otherwise.
func RequirePerm(db *pgxpool.Pool, rdb *redis.Client, key string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userID, _ := c.Locals("user_id").(string)
		if userID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		role, set, err := ResolvePerms(ctx, db, rdb, userID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "permission check failed"})
		}
		if role == "owner" || set[key] {
			c.Locals("perms", set)
			return c.Next()
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "you don't have permission to do this", "required": key,
		})
	}
}

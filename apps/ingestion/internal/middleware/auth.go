package middleware

import (
	"context"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
)

// cacheTTL is how long a successfully-resolved key stays trusted in memory.
// Long enough to ride out a brief Redis blip without dropping a known tenant's
// events, short enough that a revoked key stops working promptly.
const cacheTTL = 10 * time.Minute

type cacheEntry struct {
	projectID string
	expires   time.Time
}

type AuthMiddleware struct {
	redis *redis.Client
	cache sync.Map // apiKey -> cacheEntry
}

func NewAuth(redis *redis.Client) *AuthMiddleware {
	return &AuthMiddleware{redis: redis}
}

// ValidateAPIKey reads api_key from X-API-Key header or request body,
// resolves it to a project_id via Redis, and stores it in locals.
//
// On a Redis error we fall back to a short-lived in-memory cache of
// previously-validated keys — so a transient outage doesn't drop a known
// tenant's events, but an unknown/garbage key is still rejected (fail closed).
func (a *AuthMiddleware) ValidateAPIKey(c fiber.Ctx) error {
	apiKey := c.Get("X-API-Key")

	// Fall back to body field (SDK sends it there)
	if apiKey == "" {
		var body struct {
			APIKey string `json:"api_key"`
		}
		// Peek body without consuming it
		if err := c.Bind().JSON(&body); err == nil {
			apiKey = body.APIKey
		}
	}

	if apiKey == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing api_key"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	projectID, err := a.redis.Get(ctx, "apikey:"+apiKey).Result()
	switch {
	case err == nil:
		a.cache.Store(apiKey, cacheEntry{projectID: projectID, expires: time.Now().Add(cacheTTL)})
	case err == redis.Nil:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid api_key"})
	default:
		// Redis unavailable — only honor keys we've recently validated.
		if id, ok := a.cachedProject(apiKey); ok {
			projectID = id
		} else {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "auth temporarily unavailable"})
		}
	}

	c.Locals("project_id", projectID)
	return c.Next()
}

// cachedProject returns a non-expired cached project_id for a key, if any.
func (a *AuthMiddleware) cachedProject(apiKey string) (string, bool) {
	v, ok := a.cache.Load(apiKey)
	if !ok {
		return "", false
	}
	e := v.(cacheEntry)
	if time.Now().After(e.expires) {
		a.cache.Delete(apiKey)
		return "", false
	}
	return e.projectID, true
}

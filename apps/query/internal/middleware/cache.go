package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// cacheablePOST are idempotent analytics reads that happen to use POST (the
// query is in the body). Mutations are never listed here.
var cacheablePOST = map[string]bool{
	"/v1/query/segmentation": true,
	"/v1/query/funnel":       true,
	"/v1/query/retention":    true,
	"/v1/query/paths":        true,
	"/v1/query/formula":      true,
}

// cacheable reports whether this request is a safe, repeatable analytics read.
func cacheable(c fiber.Ctx) bool {
	p := c.Path()
	switch c.Method() {
	case fiber.MethodGet:
		// Website-analytics reads are expensive and change slowly. Never cache
		// freshness-sensitive endpoints (onboarding poll, live events).
		if strings.Contains(p, "/events/first") || strings.Contains(p, "/live") {
			return false
		}
		return strings.Contains(p, "/web-analytics") || strings.Contains(p, "/web/")
	case fiber.MethodPost:
		return cacheablePOST[p]
	}
	return false
}

// QueryCache caches successful analytics-read responses in Redis for a short TTL.
// Repeated dashboard reads (the same project + params, hit constantly as charts
// refresh) then return from Redis in ~ms instead of re-running ClickHouse — which
// both speeds up responses and scales reads (ClickHouse only runs the cold query
// once per TTL window).
//
// The key is namespaced by org_id, so one tenant can NEVER be served another
// tenant's cached data. It runs AFTER ProjectAuthz in the chain, so every cache
// hit corresponds to an already-authorized request.
func QueryCache(rdb *redis.Client, ttl time.Duration, log *zap.Logger) fiber.Handler {
	return func(c fiber.Ctx) error {
		if !cacheable(c) {
			return c.Next()
		}
		org, _ := c.Locals("org_id").(string)
		if org == "" {
			return c.Next() // unauthenticated — let the handler reject
		}

		// Browser-only caching for GET analytics: `private` forbids shared caches
		// (Cloudflare/proxies) from storing it — critical, since these responses
		// are per-tenant and authenticated; a shared edge cache keyed by URL would
		// leak one tenant's data to another. The browser may reuse it for max-age.
		if c.Method() == fiber.MethodGet {
			c.Set("Cache-Control", "private, max-age=30")
		}

		// Key = org + method + full URL (path+query) + request body.
		sum := sha256.Sum256(append([]byte(c.Method()+"\n"+c.OriginalURL()+"\n"), c.Body()...))
		key := "qc:" + org + ":" + hex.EncodeToString(sum[:])

		if cached, err := rdb.Get(c.Context(), key).Bytes(); err == nil && len(cached) > 0 {
			c.Set("Content-Type", "application/json")
			c.Set("X-Cache", "HIT")
			return c.Send(cached)
		}

		if err := c.Next(); err != nil {
			return err
		}
		if c.Response().StatusCode() == fiber.StatusOK {
			if body := c.Response().Body(); len(body) > 0 {
				// Copy: fasthttp may reuse the body buffer after the handler returns.
				buf := append([]byte(nil), body...)
				if e := rdb.Set(c.Context(), key, buf, ttl).Err(); e != nil {
					log.Debug("query cache set failed", zap.Error(e))
				}
				c.Set("X-Cache", "MISS")
			}
		}
		return nil
	}
}

package handler

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type RedirectHandler struct {
	rdb *redis.Client
	log *zap.Logger
}

func NewRedirectHandler(rdb *redis.Client, log *zap.Logger) *RedirectHandler {
	return &RedirectHandler{rdb: rdb, log: log}
}

type linkConfig struct {
	Destination string `json:"destination"`
	UTMSource   string `json:"utm_source"`
	UTMMedium   string `json:"utm_medium"`
	UTMCampaign string `json:"utm_campaign"`
	Extra       string `json:"extra"`
}

// GET /go/:slug — smart link. Records the click server-side and 302-redirects
// to the destination with the configured UTM params appended, so the landing
// page's SDK attributes the visit to the right source.
func (h *RedirectHandler) Go(c fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	raw, err := h.rdb.Get(ctx, "link:"+slug).Result()
	if err != nil {
		return c.Status(fiber.StatusNotFound).SendString("link not found")
	}
	var cfg linkConfig
	if sonic.Unmarshal([]byte(raw), &cfg) != nil || cfg.Destination == "" {
		return c.Status(fiber.StatusNotFound).SendString("link not found")
	}

	// Only redirect to absolute http(s) URLs. Without this, a destination like
	// `javascript:...`, `data:...`, or the scheme-relative `//evil.com` would
	// turn this trusted domain into an open redirector for phishing.
	if !safeRedirectTarget(cfg.Destination) {
		return c.Status(fiber.StatusBadRequest).SendString("invalid link destination")
	}

	// Record the click (server-side, survives even if the visitor bounces).
	h.rdb.Incr(ctx, "linkclicks:"+slug)

	// Build the destination URL with UTM (and any pre-baked extra params).
	loc := cfg.Destination
	parts := []string{}
	if cfg.Extra != "" {
		parts = append(parts, cfg.Extra)
	}
	q := url.Values{}
	if cfg.UTMSource != "" {
		q.Set("utm_source", cfg.UTMSource)
	}
	if cfg.UTMMedium != "" {
		q.Set("utm_medium", cfg.UTMMedium)
	}
	if cfg.UTMCampaign != "" {
		q.Set("utm_campaign", cfg.UTMCampaign)
	}
	if enc := q.Encode(); enc != "" {
		parts = append(parts, enc)
	}
	if len(parts) > 0 {
		sep := "?"
		if strings.Contains(loc, "?") {
			sep = "&"
		}
		loc += sep + strings.Join(parts, "&")
	}

	return c.Redirect().Status(fiber.StatusFound).To(loc)
}

// safeRedirectTarget reports whether dst is an absolute http(s) URL with a host.
// Rejects javascript:/data:/mailto: schemes and scheme-relative `//host` URLs.
func safeRedirectTarget(dst string) bool {
	u, err := url.Parse(dst)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	return u.Host != ""
}

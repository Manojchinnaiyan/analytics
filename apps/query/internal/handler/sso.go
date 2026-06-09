package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/oauth2"

	"github.com/amplitude-clone/query/internal/auth"
)

// SSOHandler implements per-org OIDC single sign-on (Authorization Code flow):
// an org admin configures their IdP (issuer + client id/secret); their users log
// in through it and are just-in-time provisioned. ID-token signature/claims are
// verified by go-oidc against the IdP's JWKS.
type SSOHandler struct {
	db        *pgxpool.Pool
	rdb       *redis.Client
	jwtSecret string
	appURL    string // dashboard origin (final redirect target)
	apiURL    string // this service's origin (OIDC redirect_uri base)
	log       *zap.Logger

	mu        sync.Mutex
	providers map[string]*oidc.Provider // issuer → cached provider (discovery is slow)
}

func NewSSOHandler(db *pgxpool.Pool, rdb *redis.Client, jwtSecret, appURL, apiURL string, log *zap.Logger) *SSOHandler {
	return &SSOHandler{db: db, rdb: rdb, jwtSecret: jwtSecret, appURL: appURL, apiURL: apiURL, log: log, providers: map[string]*oidc.Provider{}}
}

type ssoConfig struct {
	orgID, issuer, clientID, clientSecret string
}

func (h *SSOHandler) configByOrgSlug(ctx context.Context, slug string) (*ssoConfig, error) {
	var cfg ssoConfig
	err := h.db.QueryRow(ctx, `
		SELECT o.id::text, s.issuer, s.client_id, s.client_secret
		FROM sso_configs s JOIN organizations o ON o.id = s.org_id
		WHERE o.slug = $1 AND s.enabled = true
	`, slug).Scan(&cfg.orgID, &cfg.issuer, &cfg.clientID, &cfg.clientSecret)
	return &cfg, err
}

func (h *SSOHandler) configByOrgID(ctx context.Context, orgID string) (*ssoConfig, error) {
	cfg := ssoConfig{orgID: orgID}
	err := h.db.QueryRow(ctx,
		`SELECT issuer, client_id, client_secret FROM sso_configs WHERE org_id = $1 AND enabled = true`, orgID,
	).Scan(&cfg.issuer, &cfg.clientID, &cfg.clientSecret)
	return &cfg, err
}

func (h *SSOHandler) provider(ctx context.Context, issuer string) (*oidc.Provider, error) {
	h.mu.Lock()
	p := h.providers[issuer]
	h.mu.Unlock()
	if p != nil {
		return p, nil
	}
	p, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	h.providers[issuer] = p
	h.mu.Unlock()
	return p, nil
}

func (h *SSOHandler) oauthConfig(p *oidc.Provider, cfg *ssoConfig) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.clientID,
		ClientSecret: cfg.clientSecret,
		Endpoint:     p.Endpoint(),
		RedirectURL:  h.apiURL + "/v1/auth/sso/callback",
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
}

// GET /v1/auth/sso/start?org=<slug> — kick off the OIDC redirect.
func (h *SSOHandler) Start(c fiber.Ctx) error {
	slug := c.Query("org")
	if slug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "org is required"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cfg, err := h.configByOrgSlug(ctx, slug)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "SSO is not configured for this organization"})
	}
	p, err := h.provider(ctx, cfg.issuer)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "could not reach the identity provider"})
	}
	// CSRF state → orgID, single-use, 10-minute TTL in Redis.
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)
	h.rdb.Set(ctx, "sso_state:"+state, cfg.orgID, 10*time.Minute)

	return c.Redirect().To(h.oauthConfig(p, cfg).AuthCodeURL(state))
}

// GET /v1/auth/sso/callback?code=&state= — exchange + verify + JIT provision.
func (h *SSOHandler) Callback(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	state := c.Query("state")
	code := c.Query("code")
	if state == "" || code == "" {
		return h.fail(c, "missing code or state")
	}
	orgID, err := h.rdb.Get(ctx, "sso_state:"+state).Result()
	if err != nil || orgID == "" {
		return h.fail(c, "invalid or expired login state")
	}
	h.rdb.Del(ctx, "sso_state:"+state)

	cfg, err := h.configByOrgID(ctx, orgID)
	if err != nil {
		return h.fail(c, "SSO configuration not found")
	}
	p, err := h.provider(ctx, cfg.issuer)
	if err != nil {
		return h.fail(c, "could not reach the identity provider")
	}
	oc := h.oauthConfig(p, cfg)
	tok, err := oc.Exchange(ctx, code)
	if err != nil {
		return h.fail(c, "token exchange failed")
	}
	rawID, ok := tok.Extra("id_token").(string)
	if !ok {
		return h.fail(c, "no id_token in response")
	}
	idToken, err := p.Verifier(&oidc.Config{ClientID: cfg.clientID}).Verify(ctx, rawID)
	if err != nil {
		return h.fail(c, "id_token verification failed")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil || claims.Email == "" {
		return h.fail(c, "no email in id_token")
	}

	// JIT provision: find-or-create the user in this org, then mint our JWT.
	var userID, role string
	err = h.db.QueryRow(ctx, `SELECT id::text, role FROM users WHERE org_id = $1 AND lower(email) = lower($2)`, orgID, claims.Email).Scan(&userID, &role)
	if err != nil {
		role = "member"
		if e := h.db.QueryRow(ctx,
			`INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,'',$4) RETURNING id::text`,
			orgID, claims.Email, claims.Name, role,
		).Scan(&userID); e != nil {
			return h.fail(c, "could not provision user")
		}
	}
	jwtTok, err := auth.GenerateToken(userID, orgID, role, h.jwtSecret)
	if err != nil {
		return h.fail(c, "could not issue session")
	}
	// Hand the token to the dashboard, which stores it and continues.
	return c.Redirect().To(h.appURL + "/sso?token=" + jwtTok)
}

func (h *SSOHandler) fail(c fiber.Ctx, reason string) error {
	h.log.Warn("sso callback failed", zap.String("reason", reason))
	return c.Redirect().To(h.appURL + "/login?sso_error=" + reason)
}

// ── Admin config (settings.manage) ──────────────────────────────────────────

// GET /v1/orgs/sso — current SSO config for the caller's org (secret omitted).
func (h *SSOHandler) GetConfig(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var issuer, clientID string
	var enabled bool
	err := h.db.QueryRow(ctx,
		`SELECT issuer, client_id, enabled FROM sso_configs WHERE org_id = $1`, orgID,
	).Scan(&issuer, &clientID, &enabled)
	if err != nil {
		return c.JSON(fiber.Map{"configured": false})
	}
	return c.JSON(fiber.Map{"configured": true, "issuer": issuer, "client_id": clientID, "enabled": enabled})
}

// PUT /v1/orgs/sso — upsert SSO config.
func (h *SSOHandler) SetConfig(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	var b struct {
		Issuer       string `json:"issuer"`
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		Enabled      *bool  `json:"enabled"`
	}
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Issuer == "" || b.ClientID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "issuer and client_id are required"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// Validate the issuer is a real OIDC provider before saving.
	if _, err := h.provider(ctx, b.Issuer); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "issuer is not a valid OIDC provider"})
	}
	enabled := true
	if b.Enabled != nil {
		enabled = *b.Enabled
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO sso_configs (org_id, issuer, client_id, client_secret, enabled)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (org_id) DO UPDATE SET issuer=$2, client_id=$3,
			client_secret = CASE WHEN $4 = '' THEN sso_configs.client_secret ELSE $4 END,
			enabled=$5, updated_at = NOW()
	`, orgID, b.Issuer, b.ClientID, b.ClientSecret, enabled)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

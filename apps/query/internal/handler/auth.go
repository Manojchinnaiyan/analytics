package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/inspectuser/query/internal/auth"
	"github.com/inspectuser/query/internal/mailer"
	"github.com/inspectuser/query/internal/perms"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db        *pgxpool.Pool
	rdb       *redis.Client
	jwtSecret string
	mail      *mailer.Mailer
	appURL    string
	log       *zap.Logger
}

func NewAuthHandler(db *pgxpool.Pool, rdb *redis.Client, jwtSecret string, mail *mailer.Mailer, appURL string, log *zap.Logger) *AuthHandler {
	return &AuthHandler{db: db, rdb: rdb, jwtSecret: jwtSecret, mail: mail, appURL: appURL, log: log}
}

// POST /v1/auth/signup
func (h *AuthHandler) Signup(c fiber.Ctx) error {
	var body struct {
		Email   string `json:"email"`
		Password string `json:"password"`
		Name    string `json:"name"`
		OrgName string `json:"org_name"`
		OrgSlug string `json:"org_slug"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	if body.Email == "" || body.Password == "" || body.OrgSlug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "email, password and org_slug are required"})
	}
	if len(body.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 8 characters"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	defer tx.Rollback(ctx)

	// Create org
	var orgID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		body.OrgName, body.OrgSlug,
	).Scan(&orgID); err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "org slug already taken"})
	}

	// Create user
	var userID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
		orgID, body.Email, body.Name, string(hash),
	).Scan(&userID); err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
	}

	// Auto-create default project so user can start tracking immediately
	apiKey := "amp_" + genKey(32)
	secretKey := "amp_secret_" + genKey(32)
	projectName := body.OrgName + " (Default)"

	var projectID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO projects (org_id, name, api_key, secret_key) VALUES ($1, $2, $3, $4) RETURNING id`,
		orgID, projectName, apiKey, secretKey,
	).Scan(&projectID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create project"})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	// Seed api_key → project_id in Redis for ingestion auth
	if err := h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0).Err(); err != nil {
		h.log.Warn("failed to seed api key in redis", zap.Error(err))
	}
	h.rdb.Set(ctx, "projorg:"+projectID, orgID, time.Hour)
	h.rdb.Set(ctx, "usage:limit:"+projectID, 0, 0) // new project: unlimited

	token, err := auth.GenerateToken(userID, orgID, "owner", h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"token":        token,
		"user_id":      userID,
		"org_id":       orgID,
		"name":         body.Name,
		"email":        body.Email,
		"project_id":   projectID,
		"project_name": projectName,
		"api_key":      apiKey,
	})
}

// POST /v1/auth/login
func (h *AuthHandler) Login(c fiber.Ctx) error {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var userID, orgID, role, hash, name string
	err := h.db.QueryRow(ctx,
		`SELECT u.id, u.org_id, u.role, u.password_hash, COALESCE(u.name, '') FROM users u WHERE u.email = $1`,
		body.Email,
	).Scan(&userID, &orgID, &role, &hash, &name)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	// Fetch default project for this org
	var projectID, apiKey, projectName string
	var eventLimit int64
	h.db.QueryRow(ctx,
		`SELECT id, api_key, name, event_limit FROM projects WHERE org_id = $1 ORDER BY created_at LIMIT 1`,
		orgID,
	).Scan(&projectID, &apiKey, &projectName, &eventLimit)

	// Re-seed Redis in case it was cleared
	if apiKey != "" {
		h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0)
		h.rdb.Set(ctx, "projorg:"+projectID, orgID, time.Hour)
		h.rdb.Set(ctx, "usage:limit:"+projectID, eventLimit, 0)
	}

	token, err := auth.GenerateToken(userID, orgID, role, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token":        token,
		"user_id":      userID,
		"org_id":       orgID,
		"role":         role,
		"name":         name,
		"email":        body.Email,
		"project_id":   projectID,
		"project_name": projectName,
		"api_key":      apiKey,
	})
}

// POST /v1/auth/refresh — issues a fresh token for a still-valid session.
// We re-load the user from the DB rather than trusting the old token's claims,
// so a deleted user can no longer roll their session forward, and a role/org
// change takes effect on the next refresh (the dashboard refreshes on load)
// instead of being frozen for the life of the long-lived token.
func (h *AuthHandler) Refresh(c fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var orgID, role string
	if err := h.db.QueryRow(ctx,
		`SELECT org_id, role FROM users WHERE id = $1`, userID,
	).Scan(&orgID, &role); err != nil {
		// User no longer exists (deleted) — refuse to extend the session.
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	token, err := auth.GenerateToken(userID, orgID, role, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}
	return c.JSON(fiber.Map{"token": token})
}

const pwResetTTL = time.Hour

// POST /v1/auth/forgot — body {email}. If the email maps to a user, issue a
// one-time reset token (stored in Redis, 1h TTL) and email a reset link. We
// ALWAYS return the same generic 200 regardless of whether the email exists, so
// the endpoint can't be used to enumerate accounts. When SMTP is disabled the
// link is logged server-side (never returned in the response) for dev use.
func (h *AuthHandler) ForgotPassword(c fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))

	const generic = "If an account exists for that email, a password reset link has been sent."

	if email != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var userID string
		if err := h.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err == nil && userID != "" {
			token := genKey(32)
			if err := h.rdb.Set(ctx, "pwreset:"+token, userID, pwResetTTL).Err(); err != nil {
				h.log.Error("failed to store reset token", zap.Error(err))
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to start reset"})
			}
			resetURL := strings.TrimRight(h.appURL, "/") + "/reset-password?token=" + token
			if h.mail != nil && h.mail.Enabled() {
				subject, html := mailer.PasswordResetEmail(resetURL)
				if err := h.mail.Send(email, subject, html); err != nil {
					h.log.Warn("password reset email failed", zap.Error(err))
				}
			} else {
				// SMTP not configured — log the link so it's usable in dev. Never
				// return it in the response (would leak the token / account existence).
				h.log.Info("password reset link (SMTP disabled)", zap.String("email", email), zap.String("reset_url", resetURL))
			}
		}
	}

	return c.JSON(fiber.Map{"message": generic})
}

// POST /v1/auth/reset — body {token, password}. Verifies the one-time reset
// token, sets the new password, and invalidates the token (single use).
func (h *AuthHandler) ResetPassword(c fiber.Ctx) error {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.Token == "" || len(body.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "token and a password of at least 8 characters are required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	key := "pwreset:" + body.Token
	userID, err := h.rdb.Get(ctx, key).Result()
	if err != nil || userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "this reset link is invalid or has expired"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to set password"})
	}
	if _, err := h.db.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, string(hash), userID); err != nil {
		h.log.Error("failed to update password", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to set password"})
	}
	h.rdb.Del(ctx, key) // one-time use

	return c.JSON(fiber.Map{"message": "Your password has been reset. You can now sign in."})
}

// GET /v1/me — returns the logged-in user + their default project.
// Used by the dashboard to reliably load project_id + api_key on every load,
// so it never relies on a possibly-stale persisted store.
func (h *AuthHandler) Me(c fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	orgID, _ := c.Locals("org_id").(string)
	if userID == "" || orgID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var name, email, role string
	var overridesRaw []byte
	_ = h.db.QueryRow(ctx,
		`SELECT COALESCE(name,''), email, role, COALESCE(permissions,'{}'::jsonb) FROM users WHERE id = $1`, userID,
	).Scan(&name, &email, &role, &overridesRaw)
	overrides := map[string]bool{}
	_ = json.Unmarshal(overridesRaw, &overrides)
	permissions := perms.List(perms.Effective(role, overrides))

	var projectID, apiKey, projectName string
	var eventLimit int64
	_ = h.db.QueryRow(ctx,
		`SELECT id, api_key, name, event_limit FROM projects WHERE org_id = $1 ORDER BY created_at LIMIT 1`, orgID,
	).Scan(&projectID, &apiKey, &projectName, &eventLimit)

	// Re-seed Redis so ingestion can validate this key (idempotent, cheap).
	if apiKey != "" {
		h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0)
		h.rdb.Set(ctx, "projorg:"+projectID, orgID, time.Hour)
		h.rdb.Set(ctx, "usage:limit:"+projectID, eventLimit, 0)
	}

	return c.JSON(fiber.Map{
		"user_id":      userID,
		"org_id":       orgID,
		"name":         name,
		"email":        email,
		"role":         role,
		"permissions":  permissions,
		"project_id":   projectID,
		"project_name": projectName,
		"api_key":      apiKey,
	})
}

func genKey(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

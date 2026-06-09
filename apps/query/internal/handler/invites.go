package handler

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/amplitude-clone/query/internal/auth"
	"github.com/amplitude-clone/query/internal/mailer"
	"github.com/amplitude-clone/query/internal/perms"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

const inviteTTL = 7 * 24 * time.Hour

type InviteHandler struct {
	db        *pgxpool.Pool
	rdb       *redis.Client
	mail      *mailer.Mailer
	jwtSecret string
	appURL    string
	log       *zap.Logger
}

func NewInviteHandler(db *pgxpool.Pool, rdb *redis.Client, mail *mailer.Mailer, jwtSecret, appURL string, log *zap.Logger) *InviteHandler {
	return &InviteHandler{db: db, rdb: rdb, mail: mail, jwtSecret: jwtSecret, appURL: appURL, log: log}
}

// POST /v1/team/invite — create a pending invite and email a set-password link.
// Gated by team.manage at the route. Falls back to returning the link when SMTP
// isn't configured.
func (h *InviteHandler) Create(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	inviterID, _ := c.Locals("user_id").(string)

	var body struct {
		Email       string          `json:"email"`
		Name        string          `json:"name"`
		Role        string          `json:"role"`
		Permissions map[string]bool `json:"permissions"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if body.Email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "email is required"})
	}
	if !perms.AssignableRoles[body.Role] {
		body.Role = "member"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Already a member?
	var exists bool
	_ = h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE org_id = $1 AND email = $2)`, orgID, body.Email).Scan(&exists)
	if exists {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "that email is already a member"})
	}

	// Replace any prior pending invite for the same email so links don't pile up.
	_, _ = h.db.Exec(ctx, `DELETE FROM invites WHERE org_id = $1 AND email = $2 AND status = 'pending'`, orgID, body.Email)

	overrides, _ := json.Marshal(body.Permissions)
	token := genKey(32)
	var inviteID string
	err := h.db.QueryRow(ctx, `
		INSERT INTO invites (org_id, email, name, role, permissions, token, invited_by, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		orgID, body.Email, body.Name, body.Role, overrides, token, inviterID, time.Now().Add(inviteTTL),
	).Scan(&inviteID)
	if err != nil {
		h.log.Error("failed to create invite", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create invite"})
	}

	acceptURL := strings.TrimRight(h.appURL, "/") + "/accept-invite?token=" + token

	// Look up org + inviter name for the email body.
	var orgName, inviterName string
	_ = h.db.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1`, orgID).Scan(&orgName)
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(name,'') FROM users WHERE id = $1`, inviterID).Scan(&inviterName)

	emailSent := false
	if h.mail.Enabled() {
		subject, html := mailer.InviteEmail(orgName, inviterName, body.Role, acceptURL)
		if err := h.mail.Send(body.Email, subject, html); err != nil {
			h.log.Warn("invite email failed; returning link instead", zap.Error(err))
		} else {
			emailSent = true
		}
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id": inviteID, "email": body.Email, "role": body.Role,
		"invite_url": acceptURL, "email_sent": emailSent,
		"expires_at": time.Now().Add(inviteTTL),
	})
}

// GET /v1/team/invites — list pending invites for the org (team.view).
func (h *InviteHandler) List(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, email, COALESCE(name,''), role, token, expires_at, created_at
		FROM invites WHERE org_id = $1 AND status = 'pending' AND expires_at > NOW()
		ORDER BY created_at DESC`, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	invites := []fiber.Map{}
	for rows.Next() {
		var id, email, name, role, token string
		var expires, created time.Time
		if rows.Scan(&id, &email, &name, &role, &token, &expires, &created) != nil {
			continue
		}
		invites = append(invites, fiber.Map{
			"id": id, "email": email, "name": name, "role": role,
			"invite_url": strings.TrimRight(h.appURL, "/") + "/accept-invite?token=" + token,
			"expires_at": expires, "created_at": created,
		})
	}
	return c.JSON(fiber.Map{"invites": invites})
}

// DELETE /v1/team/invites/:id — revoke a pending invite (team.manage).
func (h *InviteHandler) Revoke(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	id := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tag, err := h.db.Exec(ctx, `DELETE FROM invites WHERE id = $1 AND org_id = $2 AND status = 'pending'`, id, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "invite not found"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GET /v1/invite/:token — PUBLIC. Returns invite details for the accept page.
func (h *InviteHandler) Lookup(c fiber.Ctx) error {
	token := c.Params("token")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var email, name, role, orgID string
	var expires time.Time
	err := h.db.QueryRow(ctx, `
		SELECT email, COALESCE(name,''), role, org_id, expires_at
		FROM invites WHERE token = $1 AND status = 'pending'`, token).
		Scan(&email, &name, &role, &orgID, &expires)
	if err != nil || time.Now().After(expires) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "this invite is invalid or has expired", "valid": false})
	}
	var orgName string
	_ = h.db.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1`, orgID).Scan(&orgName)

	return c.JSON(fiber.Map{
		"valid": true, "email": email, "name": name, "role": role, "org_name": orgName,
	})
}

// POST /v1/invite/:token/accept — PUBLIC. Creates the member with their chosen
// password and logs them in (returns a JWT just like login).
func (h *InviteHandler) Accept(c fiber.Ctx) error {
	token := c.Params("token")
	var body struct {
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if len(body.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 8 characters"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var inviteID, email, name, role, orgID string
	var overridesRaw []byte
	var expires time.Time
	err := h.db.QueryRow(ctx, `
		SELECT id, email, COALESCE(name,''), role, org_id, COALESCE(permissions,'{}'::jsonb), expires_at
		FROM invites WHERE token = $1 AND status = 'pending'`, token).
		Scan(&inviteID, &email, &name, &role, &orgID, &overridesRaw, &expires)
	if err != nil || time.Now().After(expires) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "this invite is invalid or has expired"})
	}
	if strings.TrimSpace(body.Name) != "" {
		name = strings.TrimSpace(body.Name)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `
		INSERT INTO users (org_id, email, name, password_hash, role, permissions)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		orgID, email, name, string(hash), role, overridesRaw).Scan(&userID)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "this email is already registered — try logging in"})
	}
	if _, err := tx.Exec(ctx, `UPDATE invites SET status = 'accepted' WHERE id = $1`, inviteID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	// Hand back a session + the org's default project, mirroring login.
	var projectID, apiKey, projectName string
	_ = h.db.QueryRow(ctx,
		`SELECT id, api_key, name FROM projects WHERE org_id = $1 ORDER BY created_at LIMIT 1`, orgID,
	).Scan(&projectID, &apiKey, &projectName)

	jwtToken, err := auth.GenerateToken(userID, orgID, role, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token": jwtToken, "user_id": userID, "org_id": orgID, "role": role,
		"name": name, "email": email,
		"project_id": projectID, "project_name": projectName, "api_key": apiKey,
	})
}

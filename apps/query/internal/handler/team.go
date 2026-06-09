package handler

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/inspectuser/query/internal/perms"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

type TeamHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	log *zap.Logger
}

func NewTeamHandler(db *pgxpool.Pool, rdb *redis.Client, log *zap.Logger) *TeamHandler {
	return &TeamHandler{db: db, rdb: rdb, log: log}
}

// invalidatePerms drops a member's cached effective-permission set so role and
// permission changes apply on their next request. Key must match middleware.
func (h *TeamHandler) invalidatePerms(ctx context.Context, userID string) {
	h.rdb.Del(ctx, "userperm:"+userID)
}

// effectivePerms resolves a member's granted permission keys from role + overrides.
func effectivePerms(role string, overridesRaw []byte) []string {
	overrides := map[string]bool{}
	_ = json.Unmarshal(overridesRaw, &overrides)
	return perms.List(perms.Effective(role, overrides))
}

// GET /v1/team — list members of the caller's org with their effective perms.
func (h *TeamHandler) List(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, email, COALESCE(name, ''), role, COALESCE(permissions, '{}'::jsonb), created_at
		FROM users WHERE org_id = $1 ORDER BY created_at ASC
	`, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	members := []fiber.Map{}
	for rows.Next() {
		var id, email, name, role string
		var overrides []byte
		var created time.Time
		if rows.Scan(&id, &email, &name, &role, &overrides, &created) != nil {
			continue
		}
		ov := map[string]bool{}
		_ = json.Unmarshal(overrides, &ov)
		members = append(members, fiber.Map{
			"id": id, "email": email, "name": name, "role": role,
			"overrides": ov, "permissions": effectivePerms(role, overrides),
			"created_at": created,
		})
	}
	// Expose the catalog so the UI can render a permission editor.
	return c.JSON(fiber.Map{"members": members, "catalog": perms.Catalog, "roles": []string{"admin", "manager", "member", "viewer"}})
}

// POST /v1/team — directly add a member with a temporary password (owner/admin
// alternative to the email invite). Returns the temp password ONCE.
func (h *TeamHandler) Create(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)

	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
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

	tempPassword := genKey(8) // 16 hex chars
	hash, err := bcrypt.GenerateFromPassword([]byte(tempPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var id string
	err = h.db.QueryRow(ctx, `
		INSERT INTO users (org_id, email, name, password_hash, role)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, orgID, body.Email, body.Name, string(hash), body.Role).Scan(&id)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id": id, "email": body.Email, "name": body.Name, "role": body.Role,
		"temp_password": tempPassword,
	})
}

// PUT /v1/team/:userId — change a member's role (team.manage gated at route).
func (h *TeamHandler) UpdateRole(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	targetID := c.Params("userId")

	var body struct {
		Role string `json:"role"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if !perms.AssignableRoles[body.Role] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Never change the owner's role.
	tag, err := h.db.Exec(ctx, `
		UPDATE users SET role = $1, updated_at = NOW()
		WHERE id = $2 AND org_id = $3 AND role != 'owner'
	`, body.Role, targetID, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "member not found or is the owner"})
	}
	h.invalidatePerms(ctx, targetID)
	return c.JSON(fiber.Map{"ok": true})
}

// PUT /v1/team/:userId/permissions — set per-member permission overrides
// (team.manage). Body: {"permissions": {"flags.manage": true, "billing.manage": false}}.
func (h *TeamHandler) SetPermissions(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	targetID := c.Params("userId")

	var body struct {
		Permissions map[string]bool `json:"permissions"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	overrides, _ := json.Marshal(body.Permissions)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Owners always have every permission; don't let overrides shadow that.
	tag, err := h.db.Exec(ctx, `
		UPDATE users SET permissions = $1, updated_at = NOW()
		WHERE id = $2 AND org_id = $3 AND role != 'owner'
	`, overrides, targetID, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "member not found or is the owner"})
	}
	h.invalidatePerms(ctx, targetID)

	// Return the new effective set so the UI can update immediately.
	var role string
	_ = h.db.QueryRow(ctx, `SELECT role FROM users WHERE id = $1`, targetID).Scan(&role)
	return c.JSON(fiber.Map{"ok": true, "permissions": effectivePerms(role, overrides)})
}

// DELETE /v1/team/:userId — remove a member (team.manage gated at route).
func (h *TeamHandler) Delete(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	callerID, _ := c.Locals("user_id").(string)
	targetID := c.Params("userId")

	if targetID == callerID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "you can't remove yourself"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Never delete the owner.
	tag, err := h.db.Exec(ctx, `
		DELETE FROM users WHERE id = $1 AND org_id = $2 AND role != 'owner'
	`, targetID, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "member not found or is the owner"})
	}
	h.invalidatePerms(ctx, targetID)
	return c.JSON(fiber.Map{"ok": true})
}

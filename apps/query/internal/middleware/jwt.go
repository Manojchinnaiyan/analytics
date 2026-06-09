package middleware

import (
	"strings"

	"github.com/amplitude-clone/query/internal/auth"
	"github.com/gofiber/fiber/v3"
)

func JWTAuth(secret string) fiber.Handler {
	return func(c fiber.Ctx) error {
		header := c.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing token"})
		}

		claims, err := auth.ParseToken(strings.TrimPrefix(header, "Bearer "), secret)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		c.Locals("user_id", claims.UserID)
		c.Locals("org_id", claims.OrgID)
		c.Locals("role", claims.Role)
		return c.Next()
	}
}

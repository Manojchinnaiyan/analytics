package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type AnnotationHandler struct {
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewAnnotationHandler(db *pgxpool.Pool, log *zap.Logger) *AnnotationHandler {
	return &AnnotationHandler{db: db, log: log}
}

// GET /v1/projects/:id/annotations
func (h *AnnotationHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, to_char(date, 'YYYY-MM-DD'), label
		FROM annotations WHERE project_id = $1 ORDER BY date ASC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, date, label string
		if rows.Scan(&id, &date, &label) != nil {
			continue
		}
		out = append(out, fiber.Map{"id": id, "date": date, "label": label})
	}
	return c.JSON(fiber.Map{"annotations": out})
}

// POST /v1/projects/:id/annotations  body: {date: "YYYY-MM-DD", label}
func (h *AnnotationHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Date  string `json:"date"`
		Label string `json:"label"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if _, perr := time.Parse(dateFmt, body.Date); perr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date must be YYYY-MM-DD"})
	}
	if body.Label == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "label is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO annotations (project_id, date, label) VALUES ($1, $2, $3) RETURNING id
	`, projectID, body.Date, body.Label).Scan(&id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id, "date": body.Date, "label": body.Label})
}

// DELETE /v1/projects/:id/annotations/:annId
func (h *AnnotationHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM annotations WHERE id = $1 AND project_id = $2`,
		c.Params("annId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

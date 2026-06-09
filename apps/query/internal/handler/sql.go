package handler

import (
	"context"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type SQLHandler struct {
	ch  clickhouse.Conn
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewSQLHandler(ch clickhouse.Conn, db *pgxpool.Pool, log *zap.Logger) *SQLHandler {
	return &SQLHandler{ch: ch, db: db, log: log}
}

// forbidden statements — this is a read-only analytics console.
var forbiddenSQL = regexp.MustCompile(`(?i)\b(insert|alter|drop|delete|update|create|truncate|rename|attach|detach|optimize|grant|revoke|system|kill|set\s)\b`)
var limitClause = regexp.MustCompile(`(?i)\blimit\s+\d+`)

// POST /v1/projects/:id/sql  body: {query}
// Runs a read-only SELECT against ClickHouse with hard caps. Only SELECT/WITH is
// allowed; a single statement; an automatic LIMIT if none is given.
func (h *SQLHandler) Run(c fiber.Ctx) error {
	var body struct {
		Query string `json:"query"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	q := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(body.Query), ";"))
	if q == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query is required"})
	}
	low := strings.ToLower(q)
	if !strings.HasPrefix(low, "select") && !strings.HasPrefix(low, "with") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only SELECT / WITH queries are allowed"})
	}
	if strings.Contains(q, ";") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only a single statement is allowed"})
	}
	if forbiddenSQL.MatchString(q) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only read-only queries are allowed"})
	}
	if !limitClause.MatchString(q) {
		q += " LIMIT 1000"
	}

	// Read-only execution with tight resource caps. readonly=2 forbids writes
	// but still allows us to set the resource limits below.
	ctx := clickhouse.Context(c.Context(), clickhouse.WithSettings(clickhouse.Settings{
		"readonly":             "2",
		"max_execution_time":   15,
		"max_result_rows":      "10000",
		"result_overflow_mode": "break",
	}))

	start := time.Now()
	rows, err := h.ch.Query(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	cols := rows.Columns()
	colTypes := rows.ColumnTypes()
	out := []map[string]any{}
	for rows.Next() {
		// Build correctly-typed scan targets from each column's ScanType — the
		// reliable way to read an arbitrary query with clickhouse-go.
		ptrs := make([]any, len(colTypes))
		for i, ct := range colTypes {
			ptrs[i] = reflect.New(ct.ScanType()).Interface()
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		row := make(map[string]any, len(cols))
		for i, c := range cols {
			row[c] = normalizeVal(reflect.ValueOf(ptrs[i]).Elem().Interface())
		}
		out = append(out, row)
	}

	return c.JSON(fiber.Map{
		"columns":  cols,
		"rows":     out,
		"row_count": len(out),
		"elapsed_ms": time.Since(start).Milliseconds(),
	})
}

// normalizeVal makes ClickHouse values JSON-friendly.
func normalizeVal(v any) any {
	switch t := v.(type) {
	case time.Time:
		return t.Format("2006-01-02 15:04:05")
	case *time.Time:
		if t != nil {
			return t.Format("2006-01-02 15:04:05")
		}
		return nil
	default:
		return fmt.Sprintf("%v", v)
	}
}

// GET /v1/projects/:id/sql/saved
func (h *SQLHandler) ListSaved(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `SELECT id, name, query, created_at FROM saved_queries WHERE project_id=$1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, name, query string
		var createdAt time.Time
		if rows.Scan(&id, &name, &query, &createdAt) == nil {
			out = append(out, fiber.Map{"id": id, "name": name, "query": query, "created_at": createdAt})
		}
	}
	return c.JSON(fiber.Map{"queries": out})
}

// POST /v1/projects/:id/sql/saved  body: {name, query}
func (h *SQLHandler) Save(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct{ Name, Query string }
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.Name == "" || body.Query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and query are required"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var id string
	if err := h.db.QueryRow(ctx, `INSERT INTO saved_queries (project_id, name, query) VALUES ($1,$2,$3) RETURNING id`,
		projectID, body.Name, body.Query).Scan(&id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// DELETE /v1/projects/:id/sql/saved/:queryId
func (h *SQLHandler) DeleteSaved(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM saved_queries WHERE id=$1 AND project_id=$2`, c.Params("queryId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

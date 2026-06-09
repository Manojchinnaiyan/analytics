package handler

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type TaxonomyHandler struct {
	ch  clickhouse.Conn
	db  *pgxpool.Pool
	rdb *redis.Client
	log *zap.Logger
}

func NewTaxonomyHandler(ch clickhouse.Conn, db *pgxpool.Pool, rdb *redis.Client, log *zap.Logger) *TaxonomyHandler {
	return &TaxonomyHandler{ch: ch, db: db, rdb: rdb, log: log}
}

var taxonomyStatuses = map[string]bool{"active": true, "deprecated": true, "blocked": true}

// GET /v1/projects/:id/taxonomy
// Lists every event seen in ClickHouse, enriched with the description/status
// stored in Postgres (event_definitions). Events default to "active".
func (h *TaxonomyHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	// Real events + volume + last seen.
	type entry struct {
		Name        string    `json:"name"`
		Count       int64     `json:"count"`
		LastSeen    time.Time `json:"last_seen"`
		Description string    `json:"description"`
		Status      string    `json:"status"`
		ExpectedProps string  `json:"expected_properties"` // JSON array of {name,type,required}
	}
	order := []string{}
	byName := map[string]*entry{}

	rows, err := h.ch.Query(ctx, `
		SELECT event_type, toInt64(count()) AS cnt, max(event_time) AS last_seen
		FROM inspectuser.events WHERE project_id = ?
		GROUP BY event_type ORDER BY cnt DESC LIMIT 500
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var cnt int64
		var last time.Time
		if rows.Scan(&name, &cnt, &last) != nil {
			continue
		}
		e := &entry{Name: name, Count: cnt, LastSeen: last, Status: "active"}
		byName[name] = e
		order = append(order, name)
	}

	// Overlay stored definitions (description + status, including blocked events
	// that may not have any rows in ClickHouse).
	pctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defs, derr := h.db.Query(pctx, `
		SELECT name, COALESCE(description, ''), status, COALESCE(expected_properties, '') FROM event_definitions WHERE project_id = $1
	`, projectID)
	if derr == nil {
		defer defs.Close()
		for defs.Next() {
			var name, desc, status, props string
			if defs.Scan(&name, &desc, &status, &props) != nil {
				continue
			}
			if e, ok := byName[name]; ok {
				e.Description = desc
				e.ExpectedProps = props
				if status != "" {
					e.Status = status
				}
			} else {
				byName[name] = &entry{Name: name, Description: desc, Status: status, ExpectedProps: props}
				order = append(order, name)
			}
		}
	}

	out := make([]*entry, 0, len(order))
	for _, n := range order {
		out = append(out, byName[n])
	}
	return c.JSON(fiber.Map{"events": out})
}

// PUT /v1/projects/:id/taxonomy
// Upserts an event's description/status. "blocked" events are added to a Redis
// set the ingestion service consults to drop them at the door.
func (h *TaxonomyHandler) Upsert(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Event         string `json:"event"`
		Description   string `json:"description"`
		Status        string `json:"status"`
		ExpectedProps string `json:"expected_properties"` // JSON array of {name,type,required}
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.Event == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "event is required"})
	}
	if !taxonomyStatuses[body.Status] {
		body.Status = "active"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `
		INSERT INTO event_definitions (project_id, name, description, status, expected_properties)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (project_id, name)
		DO UPDATE SET description = $3, status = $4, expected_properties = $5, updated_at = NOW()
	`, projectID, body.Event, body.Description, body.Status, body.ExpectedProps)
	if err != nil {
		h.log.Error("taxonomy upsert failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Keep the ingestion blocklist in sync.
	key := "blocked:" + projectID
	if body.Status == "blocked" {
		h.rdb.SAdd(ctx, key, body.Event)
	} else {
		h.rdb.SRem(ctx, key, body.Event)
	}

	return c.JSON(fiber.Map{"ok": true})
}

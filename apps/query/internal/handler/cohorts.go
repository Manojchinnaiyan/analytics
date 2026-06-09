package handler

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type CohortHandler struct {
	db  *pgxpool.Pool
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewCohortHandler(db *pgxpool.Pool, ch clickhouse.Conn, log *zap.Logger) *CohortHandler {
	return &CohortHandler{db: db, ch: ch, log: log}
}

// cohortDefinition supports three cohort types (Amplitude-style):
//   behavioral — did <event_type> ≥ <min_count> times in last <days>
//   property   — has an event where <property> <operator> <value> in last <days>
//   funnel     — did <did_event> but NOT <not_event> in last <days> (e.g. signed up, didn't purchase)
type cohortDefinition struct {
	Type      string `json:"type"` // behavioral | property | funnel (default behavioral)
	EventType string `json:"event_type"`
	MinCount  int    `json:"min_count"`
	Days      int    `json:"days"`
	// property
	Property string `json:"property"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
	PropType string `json:"prop_type"` // event | user | system
	// funnel
	DidEvent string `json:"did_event"`
	NotEvent string `json:"not_event"`
}

var cohortNativeCols = map[string]bool{
	"country": true, "region": true, "city": true, "platform": true, "os_name": true,
	"device_type": true, "browser": true, "utm_source": true, "utm_medium": true,
	"utm_campaign": true, "referrer": true,
}

func sqlStrip(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r != '\'' && r != '\\' {
			out = append(out, r)
		}
	}
	return string(out)
}

func cohortCol(prop, ptype string) string {
	esc := sqlStrip(prop)
	switch ptype {
	case "user":
		return "JSONExtractString(user_properties, '" + esc + "')"
	case "system":
		if cohortNativeCols[prop] {
			return prop // allowlisted native column
		}
		return "JSONExtractString(properties, '" + esc + "')"
	default:
		return "JSONExtractString(properties, '" + esc + "')"
	}
}

func cohortClause(col, op, val string) string {
	v := sqlStrip(val)
	switch op {
	case "is":
		return col + " = '" + v + "'"
	case "is_not":
		return col + " != '" + v + "'"
	case "contains":
		return col + " ILIKE '%" + v + "%'"
	case "greater_than":
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			return "toFloat64OrZero(" + col + ") > " + v
		}
	case "less_than":
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			return "toFloat64OrZero(" + col + ") < " + v
		}
	}
	return "1 = 1"
}

// cohortMemberSQL returns a subquery that SELECTs the member identities for a
// cohort definition — shared by sizing (count wrapper) and filtering (IN clause).
func cohortMemberSQL(projectID string, def cohortDefinition) string {
	if def.Days <= 0 {
		def.Days = 30
	}
	pid := sqlStrip(projectID)
	base := fmt.Sprintf(`SELECT if(user_id != '', user_id, device_id) AS id
		FROM amplitude.events
		WHERE project_id = '%s' AND event_time >= now() - INTERVAL %d DAY`, pid, def.Days)

	switch def.Type {
	case "property":
		return base + " AND " + cohortClause(cohortCol(def.Property, def.PropType), def.Operator, def.Value) + " GROUP BY id"
	case "funnel":
		did, not := sqlStrip(def.DidEvent), sqlStrip(def.NotEvent)
		return base + fmt.Sprintf(" GROUP BY id HAVING countIf(event_type = '%s') > 0 AND countIf(event_type = '%s') = 0", did, not)
	default: // behavioral
		if def.MinCount <= 0 {
			def.MinCount = 1
		}
		return base + fmt.Sprintf(" AND event_type = '%s' GROUP BY id HAVING count() >= %d", sqlStrip(def.EventType), def.MinCount)
	}
}

// computeSize counts distinct identities matching the cohort definition.
func (h *CohortHandler) computeSize(ctx context.Context, projectID string, def cohortDefinition) int64 {
	var n int64
	_ = h.ch.QueryRow(ctx, "SELECT toInt64(count()) FROM ("+cohortMemberSQL(projectID, def)+")").Scan(&n)
	return n
}

// POST /v1/projects/:id/cohorts
func (h *CohortHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var body struct {
		Name string `json:"name"`
		cohortDefinition
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	def := body.cohortDefinition
	if def.Type == "" {
		def.Type = "behavioral"
	}
	okDef := (def.Type == "behavioral" && def.EventType != "") ||
		(def.Type == "property" && def.Property != "" && def.Operator != "") ||
		(def.Type == "funnel" && def.DidEvent != "" && def.NotEvent != "")
	if body.Name == "" || !okDef {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and a complete definition are required"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	size := h.computeSize(ctx, projectID, def)
	defJSON, _ := sonic.Marshal(def)

	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO cohorts (project_id, name, definition, user_count, computed_at)
		VALUES ($1, $2, $3, $4, NOW()) RETURNING id
	`, projectID, body.Name, string(defJSON), size).Scan(&id)
	if err != nil {
		h.log.Error("create cohort failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create cohort"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id": id, "name": body.Name, "definition": def, "user_count": size,
	})
}

// GET /v1/projects/:id/cohorts
func (h *CohortHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, definition, user_count, computed_at
		FROM cohorts WHERE project_id = $1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, defStr string
		var count int64
		var computedAt time.Time
		if rows.Scan(&id, &name, &defStr, &count, &computedAt) != nil {
			continue
		}
		var def cohortDefinition
		_ = sonic.Unmarshal([]byte(defStr), &def)
		out = append(out, fiber.Map{
			"id": id, "name": name, "definition": def,
			"user_count": count, "computed_at": computedAt,
		})
	}
	return c.JSON(fiber.Map{"cohorts": out})
}

// DELETE /v1/projects/:id/cohorts/:cohortId
func (h *CohortHandler) Delete(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM cohorts WHERE id = $1 AND project_id = $2`,
		c.Params("cohortId"), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

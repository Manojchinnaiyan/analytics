package handler

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/inspectuser/query/internal/analytics"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

const (
	errInvalidJSON = "invalid JSON"
	dateFmt        = "2006-01-02"
)

type QueryHandler struct {
	ch  clickhouse.Conn
	db  *pgxpool.Pool
	log *zap.Logger
}

func NewQueryHandler(ch clickhouse.Conn, db *pgxpool.Pool, log *zap.Logger) *QueryHandler {
	return &QueryHandler{ch: ch, db: db, log: log}
}

// cohortFilter loads a cohort by id and returns a SQL fragment restricting the
// resolved identity to the cohort's members. Empty string if no cohort.
func (h *QueryHandler) cohortFilter(projectID, cohortID string) string {
	if cohortID == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var defStr string
	if err := h.db.QueryRow(ctx,
		`SELECT definition FROM cohorts WHERE id = $1 AND project_id = $2`, cohortID, projectID,
	).Scan(&defStr); err != nil {
		return ""
	}
	var def cohortDefinition
	if sonic.Unmarshal([]byte(defStr), &def) != nil {
		return ""
	}
	// Restrict the resolved identity to the cohort's members (any cohort type),
	// reusing the same membership SQL the cohort sizing uses.
	return " AND if(user_id != '', user_id, device_id) IN (" + cohortMemberSQL(projectID, def) + ")"
}

// escapeIdent strips single quotes AND backslashes from an identifier used in
// interpolated SQL. Stripping only `'` is unsafe: a trailing `\` escapes the
// closing quote (`\'`) and breaks out of the string literal (SQL injection).
func escapeIdent(s string) string {
	out := ""
	for _, r := range s {
		if r != '\'' && r != '\\' {
			out += string(r)
		}
	}
	return out
}

// POST /v1/query/segmentation
func (h *QueryHandler) Segmentation(c fiber.Ctx) error {
	var body struct {
		ProjectID   string             `json:"project_id"`
		EventType   string             `json:"event_type"`
		Start       string             `json:"start"`
		End         string             `json:"end"`
		Granularity string             `json:"granularity"`
		Metric      string             `json:"metric"`
		Property    string             `json:"property"`
		GroupBy     string             `json:"group_by"`
		Filters     []analytics.Filter `json:"filters"`
		CohortID    string             `json:"cohort_id"`
		Compare     bool               `json:"compare"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}

	start, _ := time.Parse(dateFmt, body.Start)
	end, _ := time.Parse(dateFmt, body.End)
	endExcl := end.Add(24 * time.Hour)

	h.resolveDerivedFilters(body.ProjectID, body.Filters)

	q := analytics.SegmentationQuery{
		ProjectID:   body.ProjectID,
		EventType:   body.EventType,
		StartDate:   start,
		EndDate:     endExcl,
		Granularity: body.Granularity,
		Metric:      body.Metric,
		Property:    body.Property,
		GroupBy:     body.GroupBy,
		Filters:     body.Filters,
		CohortSQL:   h.cohortFilter(body.ProjectID, body.CohortID),
	}
	data, err := analytics.Segmentation(c.Context(), h.ch, q)
	if err != nil {
		h.log.Error("segmentation query failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	resp := fiber.Map{"data": data, "total": sumPoints(data)}

	// Compare to the immediately-preceding window of equal length.
	// Disabled when broken down (group_by), matching Amplitude.
	if body.Compare && body.GroupBy == "" {
		span := endExcl.Sub(start)
		prev := q
		prev.StartDate = start.Add(-span)
		prev.EndDate = start
		prevData, perr := analytics.Segmentation(c.Context(), h.ch, prev)
		if perr == nil {
			resp["compare_data"] = prevData
			prevTotal := sumPoints(prevData)
			resp["compare_total"] = prevTotal
			if prevTotal > 0 {
				resp["delta"] = (sumPoints(data) - prevTotal) / prevTotal
			}
		}
	}

	return c.JSON(resp)
}

// sumPoints totals the Value across a segmentation series.
func sumPoints(pts []analytics.DataPoint) float64 {
	var t float64
	for _, p := range pts {
		t += p.Value
	}
	return t
}

// POST /v1/query/funnel
func (h *QueryHandler) Funnel(c fiber.Ctx) error {
	var body struct {
		ProjectID   string                 `json:"project_id"`
		Steps       []analytics.FunnelStep `json:"steps"`
		Start       string                 `json:"start"`
		End         string                 `json:"end"`
		WindowDays  int                    `json:"window_days"`  // legacy
		WindowValue int                    `json:"window_value"` // with WindowUnit
		WindowUnit  string                 `json:"window_unit"`  // minute | hour | day
		Mode        string                 `json:"mode"`         // ordered | strict | any
		Breakdown   string                 `json:"breakdown"`
		CountedBy   string                 `json:"counted_by"` // users | sessions
		Exclusions  []string               `json:"exclusions"`
		Filters     []analytics.Filter     `json:"filters"`
		CohortID    string                 `json:"cohort_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}

	start, _ := time.Parse(dateFmt, body.Start)
	end, _ := time.Parse(dateFmt, body.End)

	// Resolve the conversion window to seconds.
	windowSeconds := int64(0)
	if body.WindowValue > 0 {
		unit := int64(86400)
		switch body.WindowUnit {
		case "minute":
			unit = 60
		case "hour":
			unit = 3600
		}
		windowSeconds = int64(body.WindowValue) * unit
	} else {
		if body.WindowDays == 0 {
			body.WindowDays = 14
		}
		windowSeconds = int64(body.WindowDays) * 86400
	}

	result, err := analytics.Funnel(c.Context(), h.ch, analytics.FunnelQuery{
		ProjectID:     body.ProjectID,
		Steps:         body.Steps,
		StartDate:     start,
		EndDate:       end.Add(24 * time.Hour),
		WindowSeconds: windowSeconds,
		Mode:          body.Mode,
		Breakdown:     body.Breakdown,
		CountedBy:     body.CountedBy,
		Exclusions:    body.Exclusions,
		Filters:       body.Filters,
		CohortSQL:     h.cohortFilter(body.ProjectID, body.CohortID),
	})
	if err != nil {
		h.log.Error("funnel query failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// POST /v1/query/retention
func (h *QueryHandler) Retention(c fiber.Ctx) error {
	var body struct {
		ProjectID   string `json:"project_id"`
		StartEvent  string `json:"start_event"`
		ReturnEvent string `json:"return_event"`
		Start       string `json:"start"`
		End         string `json:"end"`
		Granularity string             `json:"granularity"`
		Periods     int                `json:"periods"`
		Mode        string             `json:"mode"`
		Filters     []analytics.Filter `json:"filters"`
		CohortID    string             `json:"cohort_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}

	start, _ := time.Parse(dateFmt, body.Start)
	end, _ := time.Parse(dateFmt, body.End)

	if body.Periods == 0 {
		body.Periods = 8
	}

	result, err := analytics.Retention(c.Context(), h.ch, analytics.RetentionQuery{
		ProjectID:   body.ProjectID,
		StartEvent:  body.StartEvent,
		ReturnEvent: body.ReturnEvent,
		StartDate:   start,
		EndDate:     end.Add(24 * time.Hour),
		Granularity: body.Granularity,
		Periods:     body.Periods,
		Mode:        body.Mode,
		Filters:     body.Filters,
		CohortSQL:   h.cohortFilter(body.ProjectID, body.CohortID),
	})
	if err != nil {
		h.log.Error("retention query failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"data": result})
}

// GET /v1/projects/:id/events/first — onboarding polls this to detect first event
func (h *QueryHandler) FirstEvent(c fiber.Ctx) error {
	projectID := c.Params("id")

	rows, err := h.ch.Query(c.Context(), `
		SELECT event_type, user_id, event_time
		FROM inspectuser.events
		WHERE project_id = ?
		ORDER BY event_time ASC
		LIMIT 1
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	if rows.Next() {
		var eventType, userID string
		var eventTime time.Time
		rows.Scan(&eventType, &userID, &eventTime)
		return c.JSON(fiber.Map{
			"received":   true,
			"event_type": eventType,
			"user_id":    userID,
			"event_time": eventTime,
		})
	}

	return c.JSON(fiber.Map{"received": false})
}

// GET /v1/projects/:id/events/types — distinct event names (for dropdowns)
func (h *QueryHandler) EventTypes(c fiber.Ctx) error {
	projectID := c.Params("id")

	rows, err := h.ch.Query(c.Context(), `
		SELECT event_type, count() AS cnt
		FROM inspectuser.events
		WHERE project_id = ?
		GROUP BY event_type
		ORDER BY cnt DESC
		LIMIT 200
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type evt struct {
		EventType string `json:"event_type"`
		Count     uint64 `json:"count"`
	}
	out := []evt{}
	for rows.Next() {
		var e evt
		if err := rows.Scan(&e.EventType, &e.Count); err == nil {
			out = append(out, e)
		}
	}
	return c.JSON(fiber.Map{"event_types": out})
}

// GET /v1/projects/:id/overview — headline stats + volume + top events + connection
// Usage reports billing-relevant metering for a project: per-month event
// volume and MTU (monthly tracked users — distinct user/device identities), the
// last 12 months from ClickHouse, plus the configured monthly event cap.
// Matches how Amplitude (MTU) / Mixpanel & PostHog (event volume) bill.
func (h *QueryHandler) Usage(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	// Independent reads (ClickHouse monthly usage + Postgres plan limit) — concurrent.
	months := []map[string]any{}
	var eventLimit int64
	parallel(
		func() {
			rows, err := h.ch.Query(ctx, `
				SELECT toYYYYMM(event_time) AS m,
				       count() AS events,
				       uniqExact(if(user_id != '', user_id, device_id)) AS mtu
				FROM inspectuser.events
				WHERE project_id = ?
				  AND event_time >= toStartOfMonth(now()) - INTERVAL 11 MONTH
				GROUP BY m ORDER BY m`, projectID)
			if err != nil {
				return
			}
			defer rows.Close()
			for rows.Next() {
				var m uint32
				var events, mtu uint64
				if rows.Scan(&m, &events, &mtu) == nil {
					months = append(months, map[string]any{"month": m, "events": events, "mtu": mtu})
				}
			}
		},
		func() {
			_ = h.db.QueryRow(ctx, `SELECT event_limit FROM projects WHERE id = $1`, projectID).Scan(&eventLimit)
		},
	)

	// Current-month headline = last bucket (or zero if no events yet this month).
	var curEvents, curMTU uint64
	curMonth := time.Now().UTC().Year()*100 + int(time.Now().UTC().Month())
	if n := len(months); n > 0 {
		if last := months[n-1]; last["month"].(uint32) == uint32(curMonth) {
			curEvents = last["events"].(uint64)
			curMTU = last["mtu"].(uint64)
		}
	}

	return c.JSON(fiber.Map{
		"month":          curMonth,
		"current_events": curEvents,
		"current_mtu":    curMTU,
		"event_limit":    eventLimit,
		"months":         months,
	})
}

func (h *QueryHandler) Overview(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	// Four independent reads — run concurrently.
	var totalEvents, uniqueUsers, eventsToday, eventsLastHour uint64
	var lastEventTime time.Time
	volume := []map[string]any{}
	topEvents := []map[string]any{}
	recent := []map[string]any{}

	parallel(
		// Headline counters
		func() {
			_ = h.ch.QueryRow(ctx, `
				SELECT
					count(),
					uniq(user_id),
					countIf(toDate(event_time) = today()),
					countIf(event_time >= now() - INTERVAL 1 HOUR),
					max(event_time)
				FROM inspectuser.events
				WHERE project_id = ?
			`, projectID).Scan(&totalEvents, &uniqueUsers, &eventsToday, &eventsLastHour, &lastEventTime)
		},
		// 30-day event volume time series
		func() {
			vrows, err := h.ch.Query(ctx, `
				SELECT toDate(event_time) AS d, count() AS c
				FROM inspectuser.events
				WHERE project_id = ? AND event_time >= today() - 29
				GROUP BY d ORDER BY d ASC
			`, projectID)
			if err != nil {
				return
			}
			defer vrows.Close()
			for vrows.Next() {
				var d time.Time
				var cnt uint64
				if vrows.Scan(&d, &cnt) == nil {
					volume = append(volume, map[string]any{"date": d.Format(dateFmt), "value": cnt})
				}
			}
		},
		// Top events
		func() {
			trows, err := h.ch.Query(ctx, `
				SELECT event_type, count() AS c, uniq(user_id) AS u
				FROM inspectuser.events
				WHERE project_id = ?
				GROUP BY event_type ORDER BY c DESC LIMIT 8
			`, projectID)
			if err != nil {
				return
			}
			defer trows.Close()
			for trows.Next() {
				var et string
				var cnt, usr uint64
				if trows.Scan(&et, &cnt, &usr) == nil {
					topEvents = append(topEvents, map[string]any{"event_type": et, "count": cnt, "users": usr})
				}
			}
		},
		// Recent events feed
		func() {
			rrows, err := h.ch.Query(ctx, `
				SELECT event_type, user_id, event_time
				FROM inspectuser.events
				WHERE project_id = ?
				ORDER BY event_time DESC LIMIT 12
			`, projectID)
			if err != nil {
				return
			}
			defer rrows.Close()
			for rrows.Next() {
				var et, uid string
				var t time.Time
				if rrows.Scan(&et, &uid, &t) == nil {
					recent = append(recent, map[string]any{"event_type": et, "user_id": uid, "event_time": t})
				}
			}
		},
	)

	return c.JSON(fiber.Map{
		"connected":        totalEvents > 0,
		"total_events":     totalEvents,
		"unique_users":     uniqueUsers,
		"events_today":     eventsToday,
		"events_last_hour": eventsLastHour,
		"last_event_time":  lastEventTime,
		"volume":           volume,
		"top_events":       topEvents,
		"recent_events":    recent,
	})
}

func Health(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

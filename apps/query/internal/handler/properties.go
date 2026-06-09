package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
)

// systemProperties are the first-class event columns (Amplitude calls these
// "Amplitude Event/User Properties"). Always available, no discovery needed.
var systemProperties = []string{
	"country", "region", "city", "platform", "os_name", "os_version",
	"device_type", "browser", "browser_version",
	"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer",
}

// GET /v1/projects/:id/properties
// Auto-discovers the property taxonomy from ingested data — event properties
// (keys in the properties blob), user properties (keys in user_properties), and
// the built-in system properties — each with a usage count. Same idea as the
// event picker: discovered from data, never hand-declared.
func (h *QueryHandler) Properties(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	discover := func(column string) []fiber.Map {
		out := []fiber.Map{}
		rows, err := h.ch.Query(ctx, `
			SELECT key, toInt64(count()) AS c FROM (
				SELECT arrayJoin(JSONExtractKeys(`+column+`)) AS key
				FROM inspectuser.events
				WHERE project_id = ? AND event_time >= today() - 30
			)
			WHERE key != ''
			GROUP BY key ORDER BY c DESC LIMIT 300
		`, projectID)
		if err != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var key string
			var count int64
			if rows.Scan(&key, &count) == nil {
				out = append(out, fiber.Map{"key": key, "count": count})
			}
		}
		return out
	}

	sys := make([]fiber.Map, 0, len(systemProperties))
	for _, p := range systemProperties {
		sys = append(sys, fiber.Map{"key": p})
	}

	return c.JSON(fiber.Map{
		"event_properties":  discover("properties"),
		"user_properties":   discover("user_properties"),
		"system_properties": sys,
	})
}

// GET /v1/projects/:id/properties/detail?key=&type=
// The metadata panel: usage count, distinct values, first/last seen, and a few
// sample values for a property — like Amplitude's property detail card.
func (h *QueryHandler) PropertyDetail(c fiber.Ctx) error {
	projectID := c.Params("id")
	key := c.Query("key")
	typ := c.Query("type", "event")
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key required"})
	}

	expr := "JSONExtractString(properties, '" + escapeIdent(key) + "')"
	switch typ {
	case "user":
		expr = "JSONExtractString(user_properties, '" + escapeIdent(key) + "')"
	case "system":
		if nativeCols[key] {
			expr = key
		}
	}

	var count, distinct uint64
	var first, last time.Time
	_ = h.ch.QueryRow(c.Context(), `
		SELECT countIf(`+expr+` != ''), uniqIf(`+expr+`, `+expr+` != ''), min(event_time), max(event_time)
		FROM inspectuser.events WHERE project_id = ?
	`, projectID).Scan(&count, &distinct, &first, &last)

	samples := []string{}
	if srows, err := h.ch.Query(c.Context(), `
		SELECT DISTINCT `+expr+` AS v FROM inspectuser.events WHERE project_id = ? AND `+expr+` != '' LIMIT 8
	`, projectID); err == nil {
		defer srows.Close()
		for srows.Next() {
			var v string
			if srows.Scan(&v) == nil {
				samples = append(samples, v)
			}
		}
	}

	return c.JSON(fiber.Map{
		"key": key, "type": typ, "count": count, "distinct": distinct,
		"first_seen": first, "last_seen": last, "samples": samples,
	})
}

// nativeCols mirrors the analytics package's native column set for detail lookups.
var nativeCols = map[string]bool{
	"country": true, "region": true, "city": true, "platform": true, "os_name": true,
	"os_version": true, "device_type": true, "browser": true, "browser_version": true,
	"utm_source": true, "utm_medium": true, "utm_campaign": true, "utm_term": true,
	"utm_content": true, "referrer": true, "user_id": true, "device_id": true, "session_id": true,
}

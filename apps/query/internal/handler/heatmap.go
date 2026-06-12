package handler

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"github.com/inspectuser/query/internal/replay"
	"go.uber.org/zap"
)

type HeatmapHandler struct {
	ch    clickhouse.Conn
	store replay.Store
	log   *zap.Logger
}

func NewHeatmapHandler(ch clickhouse.Conn, store replay.Store, log *zap.Logger) *HeatmapHandler {
	return &HeatmapHandler{ch: ch, store: store, log: log}
}

type heatPoint struct {
	RX    float64 `json:"rx"` // 0–1 horizontal position (fraction of page width)
	Y     int32   `json:"y"`  // document-relative vertical position (px)
	Count uint64  `json:"count"`
}

type scrollReach struct {
	Depth int    `json:"depth"`
	Pct   float64 `json:"pct"`
}

type clickedEl struct {
	Label string `json:"label"`
	Count uint64 `json:"count"`
}

// GET /v1/projects/:id/heatmap?path=/&days=30
// Aggregates autocaptured "Element Clicked" coordinates into a click-density
// grid for one page, plus scroll-depth reach and the most-clicked elements.
// Coordinates: prefers document-relative px/py + page dims dw (added for
// heatmaps); falls back to viewport x/y for older events.
func (h *HeatmapHandler) Heatmap(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 1 && n <= 90 {
		days = n
	}
	since := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format(dateFmt)

	// Pages that actually have click data, most-clicked first — populates the picker.
	paths := []string{}
	if rows, err := h.ch.Query(ctx, `
		SELECT JSONExtractString(properties, 'path') AS path, count() AS c
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Element Clicked' AND event_time >= toDate('`+since+`')
		GROUP BY path HAVING path != '' ORDER BY c DESC LIMIT 50
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var p string
			var c uint64
			if rows.Scan(&p, &c) == nil {
				paths = append(paths, p)
			}
		}
	}

	path := c.Query("path")
	if path == "" && len(paths) > 0 {
		path = paths[0]
	}
	if path == "" {
		return c.JSON(fiber.Map{"path": "", "paths": paths, "points": []heatPoint{}, "scroll": []scrollReach{}, "elements": []clickedEl{}, "total_clicks": 0, "pageviews": 0})
	}
	safePath := sqlStrip(path)

	// Normalised x (rx, fraction of page width) preferring px/dw, else viewport x.
	// Document-relative y preferring py, else viewport y.
	const rxExpr = `if(JSONExtractFloat(properties,'dw') > 0,
		JSONExtractFloat(properties,'px') / JSONExtractFloat(properties,'dw'),
		if(JSONExtractFloat(properties,'viewport_width') > 0,
			JSONExtractFloat(properties,'x') / JSONExtractFloat(properties,'viewport_width'), -1))`
	const yExpr = `if(JSONExtractFloat(properties,'py') > 0, JSONExtractFloat(properties,'py'), JSONExtractFloat(properties,'y'))`

	// Click-density grid: 100 horizontal buckets × 10px vertical buckets.
	points := []heatPoint{}
	if rows, err := h.ch.Query(ctx, `
		SELECT (floor(rx * 100) + 0.5) / 100 AS bx, toInt32(floor(yv / 10) * 10) AS by, count() AS c
		FROM (
			SELECT `+rxExpr+` AS rx, `+yExpr+` AS yv
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = 'Element Clicked'
			  AND JSONExtractString(properties, 'path') = '`+safePath+`'
			  AND event_time >= toDate('`+since+`')
		)
		WHERE rx >= 0 AND rx <= 1 AND yv >= 0 AND yv < 30000
		GROUP BY bx, by ORDER BY c DESC LIMIT 6000
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var p heatPoint
			if rows.Scan(&p.RX, &p.Y, &p.Count) == nil {
				points = append(points, p)
			}
		}
	} else {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Total clicks + page views (sample size) for this path.
	var totalClicks, pageviews uint64
	_ = h.ch.QueryRow(ctx, `
		SELECT
			countIf(event_type = 'Element Clicked') AS clicks,
			uniqIf(if(user_id != '', user_id, device_id), event_type = 'Page Viewed') AS viewers
		FROM inspectuser.events
		WHERE project_id = ? AND event_type IN ('Element Clicked', 'Page Viewed')
		  AND JSONExtractString(properties, 'path') = '`+safePath+`' AND event_time >= toDate('`+since+`')
	`, projectID).Scan(&totalClicks, &pageviews)

	// Scroll reach: % of this page's viewers who reached each depth milestone.
	scroll := []scrollReach{}
	depthUsers := map[int]uint64{}
	if rows, err := h.ch.Query(ctx, `
		SELECT JSONExtractInt(properties, 'depth') AS d, uniq(if(user_id != '', user_id, device_id)) AS u
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Scroll Depth'
		  AND JSONExtractString(properties, 'path') = '`+safePath+`' AND event_time >= toDate('`+since+`')
		GROUP BY d
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var d int32
			var u uint64
			if rows.Scan(&d, &u) == nil {
				depthUsers[int(d)] = u
			}
		}
	}
	base := pageviews
	if base == 0 {
		base = depthUsers[25]
	}
	for _, d := range []int{25, 50, 75, 100} {
		pct := 0.0
		if base > 0 {
			pct = float64(depthUsers[d]) / float64(base)
			if pct > 1 {
				pct = 1
			}
		}
		scroll = append(scroll, scrollReach{Depth: d, Pct: pct})
	}

	// Most-clicked elements (by visible text, else tag).
	elements := []clickedEl{}
	if rows, err := h.ch.Query(ctx, `
		SELECT if(JSONExtractString(properties,'text') != '', JSONExtractString(properties,'text'), JSONExtractString(properties,'tag')) AS label, count() AS c
		FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Element Clicked'
		  AND JSONExtractString(properties, 'path') = '`+safePath+`' AND event_time >= toDate('`+since+`')
		GROUP BY label HAVING label != '' ORDER BY c DESC LIMIT 15
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var e clickedEl
			if rows.Scan(&e.Label, &e.Count) == nil {
				elements = append(elements, e)
			}
		}
	}

	return c.JSON(fiber.Map{
		"path":         path,
		"paths":        paths,
		"points":       points,
		"scroll":       scroll,
		"elements":     elements,
		"total_clicks": totalClicks,
		"pageviews":    pageviews,
	})
}

// GET /v1/projects/:id/heatmap/snapshot?path=/&days=30
// Returns a static rrweb snapshot (Meta + first FullSnapshot) of a recorded
// session that viewed the page, so the dashboard can render the real page as
// the heatmap background. Empty {found:false} when no recording matches.
func (h *HeatmapHandler) Snapshot(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()

	days := 30
	if n, err := strconv.Atoi(c.Query("days")); err == nil && n >= 1 && n <= 90 {
		days = n
	}
	since := time.Now().UTC().AddDate(0, 0, -(days - 1)).Format(dateFmt)

	path := c.Query("path")
	if path == "" {
		return c.JSON(fiber.Map{"found": false})
	}
	safePath := sqlStrip(path)

	// Recent sessions that viewed this page.
	viewed := []string{}
	if rows, err := h.ch.Query(ctx, `
		SELECT session_id FROM inspectuser.events
		WHERE project_id = ? AND event_type = 'Page Viewed'
		  AND JSONExtractString(properties, 'path') = '`+safePath+`'
		  AND session_id != '' AND event_time >= toDate('`+since+`')
		GROUP BY session_id ORDER BY max(event_time) DESC LIMIT 300
	`, projectID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			if rows.Scan(&s) == nil {
				viewed = append(viewed, s)
			}
		}
	}
	if len(viewed) == 0 {
		return c.JSON(fiber.Map{"found": false})
	}

	// Intersect with recorded sessions (store-agnostic: works for CH or R2).
	metas, err := h.store.List(ctx, projectID)
	if err != nil {
		return c.JSON(fiber.Map{"found": false})
	}
	recorded := map[string]bool{}
	for _, m := range metas {
		recorded[m.SessionID] = true
	}
	pick := ""
	for _, s := range viewed {
		if recorded[s] {
			pick = s
			break
		}
	}
	if pick == "" {
		return c.JSON(fiber.Map{"found": false})
	}

	evs, err := h.store.Events(ctx, projectID, pick)
	if err != nil || len(evs) == 0 {
		return c.JSON(fiber.Map{"found": false})
	}

	// Keep events up to and including the first FullSnapshot (type 2) — enough to
	// render a static first frame. Read viewport dims from the Meta event (type 4).
	out := make([]json.RawMessage, 0, 4)
	width, height := 0, 0
	for _, raw := range evs {
		var e struct {
			Type int `json:"type"`
			Data struct {
				Width  int `json:"width"`
				Height int `json:"height"`
			} `json:"data"`
		}
		_ = json.Unmarshal(raw, &e)
		out = append(out, raw)
		if e.Type == 4 {
			if e.Data.Width > 0 {
				width = e.Data.Width
			}
			if e.Data.Height > 0 {
				height = e.Data.Height
			}
		}
		if e.Type == 2 {
			break
		}
	}
	if width == 0 {
		width = 1280
	}
	if len(out) < 2 {
		return c.JSON(fiber.Map{"found": false})
	}

	return c.JSON(fiber.Map{
		"found":      true,
		"session_id": pick,
		"width":      width,
		"height":     height,
		"events":     out,
	})
}

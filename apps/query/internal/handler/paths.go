package handler

import (
	"sort"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
)

// POST /v1/query/paths
// Pathfinder / Journeys: starting from a chosen event, build a Sankey flow graph
// of where users go next. Nodes are (step, event) pairs; links are the number of
// users transitioning from one event to the next, with an "(exit)" sink for
// drop-off and an "(other)" bucket for long tails — same model as Amplitude
// Journeys / Mixpanel Flows / PostHog Paths.
func (h *QueryHandler) Paths(c fiber.Ctx) error {
	var body struct {
		ProjectID  string   `json:"project_id"`
		StartEvent string   `json:"start_event"`
		Start      string   `json:"start"`
		End        string   `json:"end"`
		Depth      int      `json:"depth"`
		Direction  string   `json:"direction"` // forward (next events) | backward (preceding)
		Exclude    []string `json:"exclude"`   // event types to drop from paths entirely
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if body.StartEvent == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "start_event is required"})
	}
	depth := body.Depth
	if depth < 2 || depth > 6 {
		depth = 4
	}
	backward := body.Direction == "backward"
	excluded := map[string]bool{}
	for _, e := range body.Exclude {
		excluded[e] = true
	}
	const maxPerStep = 6 // top events kept per step; the rest collapse into "(other)"

	start, _ := time.Parse(dateFmt, body.Start)
	end, _ := time.Parse(dateFmt, body.End)
	endExcl := end.Add(24 * time.Hour)

	rows, err := h.ch.Query(c.Context(), `
		SELECT arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((event_time, event_type)))) AS evs
		FROM (
			SELECT `+identityExpr+` AS id, event_time, event_type
			FROM amplitude.events
			WHERE project_id = ? AND event_time BETWEEN ? AND ?
		)
		GROUP BY id
	`, body.ProjectID, start, endExcl)
	if err != nil {
		h.log.Error("paths query failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	const other = "(other)"
	sink := "(exit)" // forward: where users drop off
	if backward {
		sink = "(entry)" // backward: where users entered from
	}
	dk := func(d int, e string) string { return strconv.Itoa(d) + "|" + e }

	// rawEdge counts transitions from (depth d, fromEvent) → (depth d+1, toEvent).
	type rawEdge struct {
		d    int
		from string
		to   string
	}
	raw := map[rawEdge]int{}
	total := 0

	for rows.Next() {
		var evs []string
		if rows.Scan(&evs) != nil {
			continue
		}
		// Drop excluded events so paths collapse over them (Amplitude "exclude").
		if len(excluded) > 0 {
			filtered := make([]string, 0, len(evs))
			for _, e := range evs {
				if !excluded[e] {
					filtered = append(filtered, e)
				}
			}
			evs = filtered
		}
		// Anchor: first occurrence (forward) or last (backward) of the start event.
		idx := -1
		if backward {
			for i := len(evs) - 1; i >= 0; i-- {
				if evs[i] == body.StartEvent {
					idx = i
					break
				}
			}
		} else {
			for i, e := range evs {
				if e == body.StartEvent {
					idx = i
					break
				}
			}
		}
		if idx == -1 {
			continue
		}
		total++

		// seq = anchor + up to `depth` events, walking forward or backward in time.
		seq := []string{}
		if backward {
			for i := idx; i >= 0 && len(seq) <= depth; i-- {
				seq = append(seq, evs[i])
			}
		} else {
			for i := idx; i < len(evs) && len(seq) <= depth; i++ {
				seq = append(seq, evs[i])
			}
		}
		for d := 0; d < depth && d < len(seq); d++ {
			to := sink
			if d+1 < len(seq) {
				to = seq[d+1]
			}
			raw[rawEdge{d, seq[d], to}]++
			if to == sink {
				break
			}
		}
	}

	if total == 0 {
		return c.JSON(fiber.Map{"start_event": body.StartEvent, "total_users": 0, "nodes": []any{}, "links": []any{}})
	}

	// Node volumes (incoming users), used to keep only the top events per step.
	volume := map[string]int{}
	volume[dk(0, body.StartEvent)] = total
	for e, c := range raw {
		volume[dk(e.d+1, e.to)] += c
	}

	// Decide which events survive at each step.
	type ev struct {
		e string
		v int
	}
	byStep := map[int][]ev{}
	for key, v := range volume {
		sep := 0
		for key[sep] != '|' {
			sep++
		}
		d, _ := strconv.Atoi(key[:sep])
		byStep[d] = append(byStep[d], ev{key[sep+1:], v})
	}
	allowed := map[string]bool{}
	for d, list := range byStep {
		sort.Slice(list, func(a, b int) bool { return list[a].v > list[b].v })
		kept := 0
		for _, item := range list {
			if item.e == sink || item.e == other {
				allowed[dk(d, item.e)] = true
				continue
			}
			if kept < maxPerStep {
				allowed[dk(d, item.e)] = true
				kept++
			}
		}
	}
	remap := func(d int, e string) string {
		if e == sink || allowed[dk(d, e)] {
			return e
		}
		return other
	}

	// Merge raw edges after remapping tail events into "(other)".
	merged := map[rawEdge]int{}
	for e, c := range raw {
		from := remap(e.d, e.from)
		to := e.to
		if to != sink {
			to = remap(e.d+1, to)
		}
		merged[rawEdge{e.d, from, to}] += c
	}

	// Build Sankey nodes + links.
	nodeIndex := map[string]int{}
	nodes := []fiber.Map{}
	getNode := func(d int, e string) int {
		key := dk(d, e)
		if i, ok := nodeIndex[key]; ok {
			return i
		}
		i := len(nodes)
		nodeIndex[key] = i
		nodes = append(nodes, fiber.Map{"name": e, "step": d})
		return i
	}
	getNode(0, body.StartEvent) // ensure the root is index 0

	links := []fiber.Map{}
	for e, c := range merged {
		s := getNode(e.d, e.from)
		t := getNode(e.d+1, e.to)
		links = append(links, fiber.Map{"source": s, "target": t, "value": c})
	}

	return c.JSON(fiber.Map{
		"start_event": body.StartEvent,
		"total_users": total,
		"nodes":       nodes,
		"links":       links,
	})
}

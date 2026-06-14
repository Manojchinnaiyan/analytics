package handler

import (
	"fmt"
	"math"
	"sort"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
)

type AttributionHandler struct {
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewAttributionHandler(ch clickhouse.Conn, log *zap.Logger) *AttributionHandler {
	return &AttributionHandler{ch: ch, log: log}
}

type attrBucket struct {
	Value       string  `json:"value"`
	Users       int64   `json:"users"`
	Conversions float64 `json:"conversions"` // fractional (credited) for multi-touch models
	ConvRate    float64 `json:"conv_rate"`
}

type attrAgg struct {
	users     int64   // total users attributed to this bucket
	conv      float64 // conversion EVENTS credited (fractional for multi-touch)
	convUsers int64   // distinct users who converted (for a sane 0–100% rate)
}

// GET /v1/projects/:id/attribution?conversion=<event>&model=<model>
// Attribution across five models:
//   first_touch / last_touch — full credit to the earliest / latest touch
//   linear — equal credit to every touch on the path
//   time_decay — exponentially more credit nearer the conversion (7-day half-life)
//   position_based — 40% first, 40% last, 20% split among the middle (U-shaped)
// Buckets credited conversions by channel, source, medium, campaign, referrer.
func (h *AttributionHandler) Attribution(c fiber.Ctx) error {
	projectID := c.Params("id")
	conversion := c.Query("conversion", "")
	model := c.Query("model", "first_touch")

	// Multi-touch models distribute fractional credit across the whole touch path
	// (needs a conversion event to anchor the path).
	if conversion != "" && (model == "linear" || model == "time_decay" || model == "position_based") {
		return h.multiTouch(c, projectID, conversion, model)
	}

	// first-touch = earliest source (argMinIf); last-touch = latest (argMaxIf).
	// The `If` restricts to events that actually carry a marketing touch, so the
	// conversion event (no UTM, often the latest) can't win last-touch as "Direct".
	agg := "argMinIf"
	if model == "last_touch" {
		agg = "argMaxIf"
	}
	// Attribute each dimension from its OWN first/last NON-EMPTY value, so a later
	// source (e.g. the same visitor's X click after a WhatsApp click) surfaces under
	// last-touch instead of being hidden behind a referrer-only touch. Internal
	// navigation (own-domain referrer) never counts as a referrer touch.
	const extRef = `referrer != '' AND domain(referrer) != JSONExtractString(properties,'domain')`

	rows, err := h.ch.Query(c.Context(), fmt.Sprintf(`
		SELECT
			%[1]s(utm_source, event_time, utm_source != '')     AS t_source,
			%[1]s(utm_medium, event_time, utm_medium != '')     AS t_medium,
			%[1]s(utm_campaign, event_time, utm_campaign != '') AS t_campaign,
			%[1]s(referrer, event_time, %[2]s)                  AS t_referrer,
			toInt64(countIf(event_type = ?)) AS conv_events
		FROM inspectuser.events
		WHERE project_id = ?
		GROUP BY if(user_id != '', user_id, device_id)
	`, agg, extRef), conversion, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	channel := map[string]*attrAgg{}
	source := map[string]*attrAgg{}
	medium := map[string]*attrAgg{}
	campaign := map[string]*attrAgg{}
	referrer := map[string]*attrAgg{}
	var totalUsers, totalConv int64

	add := func(m map[string]*attrAgg, key string, convEvents int64) {
		a := m[key]
		if a == nil {
			a = &attrAgg{}
			m[key] = a
		}
		a.users++
		a.conv += float64(convEvents) // credit the conversion EVENT count
		if convEvents > 0 {
			a.convUsers++
		}
	}

	for rows.Next() {
		var src, med, camp, ref string
		var convEvents int64
		if err := rows.Scan(&src, &med, &camp, &ref, &convEvents); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		totalUsers++
		totalConv += convEvents

		add(channel, classifyChannel(src, med, ref), convEvents)
		add(source, orDefault(src, "(direct)"), convEvents)
		add(medium, orDefault(med, "(none)"), convEvents)
		add(campaign, orDefault(camp, "(none)"), convEvents)
		add(referrer, orDefault(referrerHost(ref), "(direct)"), convEvents)
	}

	return c.JSON(fiber.Map{
		"total_users":       totalUsers,
		"total_conversions": totalConv,
		"conversion_event":  conversion,
		"channels":          toSorted(channel),
		"sources":           toSorted(source),
		"mediums":           toSorted(medium),
		"campaigns":         toSorted(campaign),
		"referrers":         toSorted(referrer),
	})
}

type touch struct {
	t                            int64
	source, medium, camp, ref    string
}

// multiTouch distributes one unit of conversion credit across each converter's
// ordered touch path per the chosen model, then buckets the credit.
func (h *AttributionHandler) multiTouch(c fiber.Ctx, projectID, conversion, model string) error {
	// Flat, id-ordered stream — one row per touch or conversion event — grouped in
	// Go. Avoids fragile Array(Tuple) scans and streams cleanly.
	rows, err := h.ch.Query(c.Context(), `
		SELECT if(user_id != '', user_id, device_id) AS id,
		       toInt64(toUnixTimestamp(event_time)) AS t,
		       utm_source, utm_medium, utm_campaign, referrer,
		       toUInt8(event_type = ?) AS is_conv
		FROM inspectuser.events
		WHERE project_id = ?
		  AND (utm_source != '' OR utm_medium != '' OR (referrer != '' AND domain(referrer) != JSONExtractString(properties,'domain')) OR event_type = ?)
		ORDER BY id, t
	`, conversion, projectID, conversion)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	channel := map[string]*attrAgg{}
	source := map[string]*attrAgg{}
	medium := map[string]*attrAgg{}
	campaign := map[string]*attrAgg{}
	referrer := map[string]*attrAgg{}
	var totalConv, converters int64

	// credit adds fractional conversion credit, and one user count per (bucket,user).
	credit := func(m map[string]*attrAgg, key string, w float64, seen map[string]bool) {
		a := m[key]
		if a == nil {
			a = &attrAgg{}
			m[key] = a
		}
		a.conv += w
		if !seen[key] {
			seen[key] = true
			a.users++
			a.convUsers++ // every user credited here is a converter
		}
	}

	var curID string
	var touches []touch
	var convTime int64
	var convCount int64 // number of conversion EVENTS for this user
	flush := func() {
		if curID == "" || convCount == 0 { // only converters get credit
			return
		}
		converters++
		totalConv += convCount
		n := float64(convCount)
		kept := touches[:0]
		for _, tc := range touches {
			if tc.t <= convTime {
				kept = append(kept, tc)
			}
		}
		cs, ms, ds, cps, rs := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
		if len(kept) == 0 { // converted with no attributable touch → Direct
			credit(channel, "Direct", n, cs)
			credit(source, "(direct)", n, ms)
			credit(medium, "(none)", n, ds)
			credit(campaign, "(none)", n, cps)
			credit(referrer, "(direct)", n, rs)
			return
		}
		weights := touchWeights(kept, convTime, model)
		for i, tc := range kept {
			w := weights[i] * n // distribute ALL of this user's conversions across the path
			credit(channel, classifyChannel(tc.source, tc.medium, tc.ref), w, cs)
			credit(source, orDefault(tc.source, "(direct)"), w, ms)
			credit(medium, orDefault(tc.medium, "(none)"), w, ds)
			credit(campaign, orDefault(tc.camp, "(none)"), w, cps)
			credit(referrer, orDefault(referrerHost(tc.ref), "(direct)"), w, rs)
		}
	}

	for rows.Next() {
		var id string
		var t int64
		var s, md, cp, rf string
		var isConv uint8
		if rows.Scan(&id, &t, &s, &md, &cp, &rf, &isConv) != nil {
			continue
		}
		if id != curID {
			flush()
			curID, touches, convTime, convCount = id, nil, 0, 0
		}
		if isConv == 1 {
			convCount++
			if convTime == 0 || t < convTime {
				convTime = t
			}
		}
		if s != "" || md != "" || rf != "" {
			touches = append(touches, touch{t, s, md, cp, rf})
		}
	}
	flush()

	return c.JSON(fiber.Map{
		"total_users":       converters,
		"total_conversions": totalConv,
		"conversion_event":  conversion,
		"model":             model,
		"channels":          toSorted(channel),
		"sources":           toSorted(source),
		"mediums":           toSorted(medium),
		"campaigns":         toSorted(campaign),
		"referrers":         toSorted(referrer),
	})
}

// touchWeights returns the per-touch credit (summing to 1) for the model.
func touchWeights(touches []touch, convTime int64, model string) []float64 {
	k := len(touches)
	w := make([]float64, k)
	if k == 0 {
		return w
	}
	switch model {
	case "time_decay":
		const halfLife = 7 * 86400.0 // 7-day half-life
		var sum float64
		for i, tc := range touches {
			age := float64(convTime - tc.t)
			if convTime == 0 || age < 0 {
				age = 0
			}
			w[i] = math.Pow(2, -age/halfLife)
			sum += w[i]
		}
		if sum > 0 {
			for i := range w {
				w[i] /= sum
			}
		}
	case "position_based":
		if k == 1 {
			w[0] = 1
		} else if k == 2 {
			w[0], w[1] = 0.5, 0.5
		} else {
			w[0], w[k-1] = 0.4, 0.4
			mid := 0.2 / float64(k-2)
			for i := 1; i < k-1; i++ {
				w[i] = mid
			}
		}
	default: // linear
		for i := range w {
			w[i] = 1 / float64(k)
		}
	}
	return w
}

func toSorted(m map[string]*attrAgg) []attrBucket {
	out := make([]attrBucket, 0, len(m))
	for k, v := range m {
		rate := 0.0
		if v.users > 0 {
			// fraction of users who converted — stays 0–100% even if the
			// conversion event fires many times per user.
			rate = float64(v.convUsers) / float64(v.users)
		}
		out = append(out, attrBucket{Value: k, Users: v.users, Conversions: v.conv, ConvRate: rate})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Users > out[j].Users })
	return out
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

// classifyChannel buckets a touch into a high-level marketing channel.
func classifyChannel(source, medium, referrer string) string {
	switch {
	case medium == "cpc" || medium == "ppc" || medium == "paid" || medium == "paid_search":
		return "Paid Search"
	case medium == "email":
		return "Email"
	case medium == "social" || isSocial(source) || isSocial(referrerHost(referrer)):
		return "Social"
	case medium == "referral" || medium == "ref":
		return "Referral"
	case medium == "organic" || medium == "seo":
		return "Organic Search"
	case medium == "display" || medium == "banner" || medium == "cpm":
		return "Display"
	case source != "":
		return "Campaign"
	case referrer != "":
		return "Referral"
	default:
		return "Direct"
	}
}

func isSocial(s string) bool {
	for _, k := range []string{"facebook", "instagram", "twitter", "x.com", "linkedin", "tiktok", "youtube", "reddit"} {
		if containsFold(s, k) {
			return true
		}
	}
	return false
}

func containsFold(s, sub string) bool {
	if sub == "" {
		return true
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			cs := s[i+j]
			if cs >= 'A' && cs <= 'Z' {
				cs += 'a' - 'A'
			}
			if cs != sub[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// referrerHost extracts the host from a referrer URL.
func referrerHost(ref string) string {
	if ref == "" {
		return ""
	}
	s := ref
	for _, p := range []string{"https://", "http://"} {
		if len(s) >= len(p) && s[:len(p)] == p {
			s = s[len(p):]
			break
		}
	}
	for i := 0; i < len(s); i++ {
		if s[i] == '/' {
			return s[:i]
		}
	}
	return s
}

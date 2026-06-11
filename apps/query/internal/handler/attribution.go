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
	users int64
	conv  float64
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
	// A real acquisition "touch" = a utm tag OR an EXTERNAL referrer. Internal
	// navigation sets the referrer column to our own domain, which must NOT count
	// as a touch — otherwise it wins first-touch and buries the real source.
	const isTouch = `(utm_source != '' OR utm_medium != '' OR utm_campaign != '' OR (referrer != '' AND domain(referrer) != JSONExtractString(properties,'domain')))`

	rows, err := h.ch.Query(c.Context(), fmt.Sprintf(`
		SELECT
			%[1]s(utm_source, event_time, %[2]s)   AS t_source,
			%[1]s(utm_medium, event_time, %[2]s)   AS t_medium,
			%[1]s(utm_campaign, event_time, %[2]s) AS t_campaign,
			%[1]s(referrer, event_time, %[2]s)     AS t_referrer,
			maxIf(toInt8(1), event_type = ?) AS converted
		FROM inspectuser.events
		WHERE project_id = ?
		GROUP BY if(user_id != '', user_id, device_id)
	`, agg, isTouch), conversion, projectID)
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

	add := func(m map[string]*attrAgg, key string, converted int8) {
		a := m[key]
		if a == nil {
			a = &attrAgg{}
			m[key] = a
		}
		a.users++
		a.conv += float64(converted)
	}

	for rows.Next() {
		var src, med, camp, ref string
		var converted int8
		if err := rows.Scan(&src, &med, &camp, &ref, &converted); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		totalUsers++
		totalConv += int64(converted)

		add(channel, classifyChannel(src, med, ref), converted)
		add(source, orDefault(src, "(direct)"), converted)
		add(medium, orDefault(med, "(none)"), converted)
		add(campaign, orDefault(camp, "(none)"), converted)
		add(referrer, orDefault(referrerHost(ref), "(direct)"), converted)
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
	var totalConv int64

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
		}
	}

	var curID string
	var touches []touch
	var convTime int64
	flush := func() {
		if curID == "" || convTime == 0 { // only converters get credit
			return
		}
		totalConv++
		kept := touches[:0]
		for _, tc := range touches {
			if tc.t <= convTime {
				kept = append(kept, tc)
			}
		}
		cs, ms, ds, cps, rs := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
		if len(kept) == 0 { // converted with no attributable touch → Direct
			credit(channel, "Direct", 1, cs)
			credit(source, "(direct)", 1, ms)
			credit(medium, "(none)", 1, ds)
			credit(campaign, "(none)", 1, cps)
			credit(referrer, "(direct)", 1, rs)
			return
		}
		weights := touchWeights(kept, convTime, model)
		for i, tc := range kept {
			w := weights[i]
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
			curID, touches, convTime = id, nil, 0
		}
		if isConv == 1 && (convTime == 0 || t < convTime) {
			convTime = t
		}
		if s != "" || md != "" || rf != "" {
			touches = append(touches, touch{t, s, md, cp, rf})
		}
	}
	flush()

	return c.JSON(fiber.Map{
		"total_users":       totalConv,
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
			rate = float64(v.conv) / float64(v.users)
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

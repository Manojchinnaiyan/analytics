package analytics

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type FunnelStep struct {
	EventType string   `json:"event_type"`
	Filters   []Filter `json:"filters"`
}

type FunnelQuery struct {
	ProjectID     string
	Steps         []FunnelStep
	StartDate     time.Time
	EndDate       time.Time
	WindowSeconds int64    // conversion window
	Mode          string   // ordered | strict | any
	Breakdown     string   // optional property to segment by
	CountedBy     string   // users (default) | sessions
	Exclusions    []string // events that disqualify a user if seen during the funnel
	Filters       []Filter
	CohortSQL     string
}

type FunnelStepResult struct {
	EventType          string  `json:"event_type"`
	Users              int64   `json:"users"`
	ConversionRate     float64 `json:"conversion_rate"`      // vs first step
	StepConversionRate float64 `json:"step_conversion_rate"` // vs previous step
	DropOff            int64   `json:"drop_off"`
	MedianSeconds      float64 `json:"median_seconds"` // median time from step 1 to this step
}

type FunnelTrendPoint struct {
	Date           string  `json:"date"`
	ConversionRate float64 `json:"conversion_rate"`
	Starters       int64   `json:"starters"`
	Completers     int64   `json:"completers"`
}

type FunnelBreakdownGroup struct {
	Value          string  `json:"value"`
	Users          []int64 `json:"users"` // per-step user counts
	ConversionRate float64 `json:"conversion_rate"`
}

type HistBucket struct {
	Label string  `json:"label"`
	From  float64 `json:"from"`
	To    float64 `json:"to"`
	Count int     `json:"count"`
}

type FunnelResult struct {
	Steps                []FunnelStepResult     `json:"steps"`
	OverallConversion    float64                `json:"overall_conversion"`
	MedianConvertSeconds float64                `json:"median_convert_seconds"`
	P25Seconds           float64                `json:"p25_seconds"`
	P90Seconds           float64                `json:"p90_seconds"`
	TimeHistogram        []HistBucket           `json:"time_histogram"`
	Trend                []FunnelTrendPoint     `json:"trend"`
	Breakdown            []FunnelBreakdownGroup `json:"breakdown"`
}

func Funnel(ctx context.Context, conn clickhouse.Conn, q FunnelQuery) (*FunnelResult, error) {
	if len(q.Steps) < 2 {
		return nil, fmt.Errorf("funnel requires at least 2 steps")
	}
	if q.WindowSeconds <= 0 {
		q.WindowSeconds = 7 * 24 * 3600
	}
	stepNames := make([]string, len(q.Steps))
	for i, s := range q.Steps {
		stepNames[i] = s.EventType
	}

	bdExpr := "''"
	if q.Breakdown != "" {
		bdExpr = colStr(q.Breakdown)
	}

	// Identity grouping: by resolved user (default) or by session.
	identityExpr := "multiIf(e.user_id != '', e.user_id, du.uid != '', du.uid, e.device_id)"
	sessionWhere := ""
	if q.CountedBy == "sessions" {
		identityExpr = "e.session_id"
		sessionWhere = " AND e.session_id != ''"
	}

	// Tracked events = funnel steps + any exclusion events (so the Go simulation
	// can see an exclusion occurring between steps and disqualify the user).
	exclSet := map[string]bool{}
	allTypes := quotedEventTypes(q.Steps)
	for _, ex := range q.Exclusions {
		if ex == "" {
			continue
		}
		exclSet[ex] = true
		allTypes += fmt.Sprintf(", '%s'", escapeVal(ex))
	}

	// Pull each user's step-events in time order (with identity stitched across
	// the anonymous→identified boundary), then simulate the funnel in Go so we
	// can derive step-to-step rates, times, trend and breakdowns in one pass.
	sql := fmt.Sprintf(`
		WITH device_user AS (
			SELECT device_id, argMax(user_id, event_time) AS uid
			FROM amplitude.events
			WHERE project_id = ? AND user_id != '' AND device_id != ''
			GROUP BY device_id
		)
		SELECT
			arrayMap(x -> toInt64(toUnixTimestamp(x.1)), arraySort(x -> x.1, groupArray((e_time, e_type)))) AS times,
			arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((e_time, e_type)))) AS evs,
			argMin(bd, e_time) AS bdval
		FROM (
			SELECT
				%s AS identity,
				e.event_time AS e_time,
				e.event_type AS e_type,
				%s AS bd
			FROM amplitude.events e
			LEFT JOIN device_user du ON e.device_id = du.device_id
			WHERE
				e.project_id = ?
				AND e.event_time BETWEEN ? AND ?
				AND e.event_type IN (%s)
				%s%s%s
		)
		GROUP BY identity
	`, identityExpr, bdExpr, allTypes, sessionWhere, buildFilters(q.Filters), q.CohortSQL)

	rows, err := conn.Query(ctx, sql, q.ProjectID, q.ProjectID, q.StartDate, q.EndDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	n := len(stepNames)
	reached := make([]int64, n)
	deltas := make([][]int64, n)     // deltas[i] = (time at step i) - (time at step 0)
	trend := map[string]*[2]int64{}  // date -> {starters, completers}
	groups := map[string]*[]int64{}  // breakdown value -> per-step counts

	for rows.Next() {
		var times []int64
		var evs []string
		var bd string
		if rows.Scan(&times, &evs, &bd) != nil {
			continue
		}
		lvl, ts := simulateFunnel(times, evs, stepNames, q.WindowSeconds, q.Mode, exclSet)
		if lvl == 0 {
			continue
		}
		for i := 0; i < lvl; i++ {
			reached[i]++
			if i >= 1 && i < len(ts) {
				deltas[i] = append(deltas[i], ts[i]-ts[0])
			}
		}
		// Trend bucket by entry day.
		day := time.Unix(ts[0], 0).UTC().Format("2006-01-02")
		agg := trend[day]
		if agg == nil {
			agg = &[2]int64{}
			trend[day] = agg
		}
		agg[0]++
		if lvl == n {
			agg[1]++
		}
		// Breakdown.
		if q.Breakdown != "" {
			if bd == "" {
				bd = "(none)"
			}
			g := groups[bd]
			if g == nil {
				s := make([]int64, n)
				g = &s
				groups[bd] = g
			}
			for i := 0; i < lvl; i++ {
				(*g)[i]++
			}
		}
	}

	res := &FunnelResult{Steps: make([]FunnelStepResult, n)}
	for i := range stepNames {
		conv := 1.0
		if reached[0] > 0 {
			conv = float64(reached[i]) / float64(reached[0])
		}
		stepConv := 1.0
		if i > 0 && reached[i-1] > 0 {
			stepConv = float64(reached[i]) / float64(reached[i-1])
		}
		drop := int64(0)
		if i < n-1 {
			drop = reached[i] - reached[i+1]
		}
		res.Steps[i] = FunnelStepResult{
			EventType:          stepNames[i],
			Users:              reached[i],
			ConversionRate:     conv,
			StepConversionRate: stepConv,
			DropOff:            drop,
			MedianSeconds:      median(deltas[i]),
		}
	}
	if reached[0] > 0 {
		res.OverallConversion = float64(reached[n-1]) / float64(reached[0])
	}
	res.MedianConvertSeconds = median(deltas[n-1])
	res.P25Seconds = percentile(deltas[n-1], 0.25)
	res.P90Seconds = percentile(deltas[n-1], 0.90)
	res.TimeHistogram = histogram(deltas[n-1], 10)

	// Trend, sorted by date.
	dates := make([]string, 0, len(trend))
	for d := range trend {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	for _, d := range dates {
		a := trend[d]
		cr := 0.0
		if a[0] > 0 {
			cr = float64(a[1]) / float64(a[0])
		}
		res.Trend = append(res.Trend, FunnelTrendPoint{Date: d, ConversionRate: cr, Starters: a[0], Completers: a[1]})
	}

	// Breakdown, top groups by entrants.
	if q.Breakdown != "" {
		for v, g := range groups {
			cr := 0.0
			if (*g)[0] > 0 {
				cr = float64((*g)[n-1]) / float64((*g)[0])
			}
			res.Breakdown = append(res.Breakdown, FunnelBreakdownGroup{Value: v, Users: *g, ConversionRate: cr})
		}
		sort.Slice(res.Breakdown, func(a, b int) bool { return res.Breakdown[a].Users[0] > res.Breakdown[b].Users[0] })
		if len(res.Breakdown) > 8 {
			res.Breakdown = res.Breakdown[:8]
		}
	}

	return res, nil
}

// simulateFunnel returns the highest step reached and the unix-second timestamp
// at each reached step. Modes: "ordered" (default), "strict" (no other tracked
// step in between), "any" (steps in any order within the window).
func simulateFunnel(times []int64, evs []string, steps []string, window int64, mode string, excl map[string]bool) (int, []int64) {
	n := len(steps)
	stepSet := make(map[string]bool, n)
	for _, s := range steps {
		stepSet[s] = true
	}

	best := 0
	var bestTimes []int64

	for si := range evs {
		if evs[si] != steps[0] {
			continue
		}
		start := times[si]

		if mode == "any" {
			first := map[string]int64{steps[0]: start}
			for j := si + 1; j < len(evs); j++ {
				if times[j]-start > window {
					break
				}
				if excl[evs[j]] {
					break // disqualified by an exclusion event
				}
				if stepSet[evs[j]] {
					if _, ok := first[evs[j]]; !ok {
						first[evs[j]] = times[j]
					}
				}
			}
			ts := make([]int64, 0, len(first))
			for _, t := range first {
				ts = append(ts, t)
			}
			sort.Slice(ts, func(a, b int) bool { return ts[a] < ts[b] })
			if len(ts) > best {
				best, bestTimes = len(ts), ts
			}
			continue
		}

		// ordered / strict
		ts := []int64{start}
		need := 1
		for j := si + 1; j < len(evs) && need < n; j++ {
			if times[j]-start > window {
				break
			}
			if excl[evs[j]] {
				break // disqualified by an exclusion event between steps
			}
			if evs[j] == steps[need] {
				ts = append(ts, times[j])
				need++
			} else if mode == "strict" && stepSet[evs[j]] {
				break // a different tracked step appeared — strict order broken
			}
		}
		if len(ts) > best {
			best, bestTimes = len(ts), ts
		}
	}
	return best, bestTimes
}

func median(xs []int64) float64 {
	return percentile(xs, 0.5)
}

func percentile(xs []int64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := make([]int64, len(xs))
	copy(s, xs)
	sort.Slice(s, func(a, b int) bool { return s[a] < s[b] })
	idx := int(p * float64(len(s)-1))
	if idx < 0 {
		idx = 0
	}
	if idx >= len(s) {
		idx = len(s) - 1
	}
	return float64(s[idx])
}

// histogram buckets the conversion-time deltas (seconds) into `n` equal-width
// bins between the 5th and 95th percentile (to keep outliers from flattening it).
func histogram(xs []int64, n int) []HistBucket {
	if len(xs) == 0 || n < 1 {
		return []HistBucket{}
	}
	lo := percentile(xs, 0.05)
	hi := percentile(xs, 0.95)
	if hi <= lo {
		hi = lo + 1
	}
	width := (hi - lo) / float64(n)
	buckets := make([]HistBucket, n)
	for i := 0; i < n; i++ {
		from := lo + float64(i)*width
		to := from + width
		buckets[i] = HistBucket{From: from, To: to, Label: humanDur(from) + "–" + humanDur(to)}
	}
	for _, x := range xs {
		v := float64(x)
		b := int((v - lo) / width)
		if b < 0 {
			b = 0
		}
		if b >= n {
			b = n - 1
		}
		buckets[b].Count++
	}
	return buckets
}

func humanDur(sec float64) string {
	switch {
	case sec < 60:
		return fmt.Sprintf("%.0fs", sec)
	case sec < 3600:
		return fmt.Sprintf("%.0fm", sec/60)
	case sec < 86400:
		return fmt.Sprintf("%.0fh", sec/3600)
	default:
		return fmt.Sprintf("%.1fd", sec/86400)
	}
}

func quotedEventTypes(steps []FunnelStep) string {
	parts := make([]string, len(steps))
	for i, s := range steps {
		parts[i] = fmt.Sprintf("'%s'", escapeVal(s.EventType))
	}
	return joinComma(parts)
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

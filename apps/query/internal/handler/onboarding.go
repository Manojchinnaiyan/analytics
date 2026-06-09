package handler

import (
	"math"
	"sort"
	"time"

	"github.com/gofiber/fiber/v3"
)

// Onboarding implements vendor-correct new-user activation analysis (Amplitude
// definition): the cohort is NEW users (global first-seen within the window),
// "activated" means they completed the milestone within N days of THEIR signup
// (time-to-value window), and activation rate = activated ÷ new users. Returns
// the activation funnel (relative to the cohort), time-to-value distribution,
// activation-rate by signup week (cohort trend), and a segment breakdown.
//
// POST /v1/query/onboarding
// body: {project_id, steps:[event...], start, end, ttv_days, breakdown}
func (h *QueryHandler) Onboarding(c fiber.Ctx) error {
	var body struct {
		ProjectID string   `json:"project_id"`
		Steps     []string `json:"steps"`
		Start     string   `json:"start"`
		End       string   `json:"end"`
		TTVDays   int      `json:"ttv_days"`
		Breakdown string   `json:"breakdown"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	steps := make([]string, 0, len(body.Steps))
	for _, s := range body.Steps {
		if s != "" {
			steps = append(steps, s)
		}
	}
	if len(steps) < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "at least one step is required"})
	}
	if body.TTVDays <= 0 {
		body.TTVDays = 7
	}
	ttvSeconds := int64(body.TTVDays) * 86400

	start, err1 := time.Parse("2006-01-02", body.Start)
	end, err2 := time.Parse("2006-01-02", body.End)
	if err1 != nil || err2 != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "start/end must be YYYY-MM-DD"})
	}
	startUnix := start.Unix()
	endUnix := end.AddDate(0, 0, 1).Unix() // inclusive of the end day

	bdExpr := onboardingBreakdownCol(body.Breakdown)

	rows, err := h.ch.Query(c.Context(), `
		SELECT uid, signup,
		       arrayMap(x -> x.1, arr) AS times,
		       arrayMap(x -> x.2, arr) AS evs,
		       bdval
		FROM (
			SELECT uid, signup,
			       arraySort(x -> x.1, groupArrayIf((t, et), t <= signup + ?)) AS arr,
			       argMin(bd, t) AS bdval
			FROM (
				SELECT `+identityExpr+` AS uid,
				       toInt64(toUnixTimestamp(event_time)) AS t,
				       event_type AS et,
				       `+bdExpr+` AS bd,
				       min(toInt64(toUnixTimestamp(event_time))) OVER (PARTITION BY `+identityExpr+`) AS signup
				FROM amplitude.events
				WHERE project_id = ?
			)
			GROUP BY uid, signup
			HAVING signup >= ? AND signup < ?
		)`,
		ttvSeconds, body.ProjectID, startUnix, endUnix)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	n := len(steps)
	stepUsers := make([]int64, n)      // users reaching each step within TTV
	perStepTimes := make([][]int64, n) // (reach time − signup) per step, for medians
	var newUsers int64
	var ttvToFinal []int64            // activation times (signup→final) for activated users
	cohorts := map[string]*obCohort{} // signup week → counts
	breakdown := map[string]*obSeg{}  // segment value → counts

	for rows.Next() {
		var uid, bdval string
		var signup int64
		var times []int64
		var evs []string
		if rows.Scan(&uid, &signup, &times, &evs, &bdval) != nil {
			continue
		}
		newUsers++

		// Ordered funnel anchored at signup: events are time-sorted, so a single
		// pass advances through the steps, each completed at/after the previous.
		cursor := signup
		si := 0
		var lastTime int64
		for ei := 0; ei < len(evs) && si < n; ei++ {
			if evs[ei] == steps[si] && times[ei] >= cursor {
				stepUsers[si]++
				perStepTimes[si] = append(perStepTimes[si], times[ei]-signup)
				cursor = times[ei]
				lastTime = times[ei]
				si++
			}
		}
		activated := si == n
		if activated {
			ttvToFinal = append(ttvToFinal, lastTime-signup)
		}

		// Cohort by signup week (Monday).
		wk := weekKey(signup)
		ch := cohorts[wk]
		if ch == nil {
			ch = &obCohort{Week: wk}
			cohorts[wk] = ch
		}
		ch.NewUsers++
		if activated {
			ch.Activated++
		}

		// Segment breakdown.
		if bdExpr != "''" {
			if bdval == "" {
				bdval = "(unknown)"
			}
			sg := breakdown[bdval]
			if sg == nil {
				sg = &obSeg{Value: bdval}
				breakdown[bdval] = sg
			}
			sg.NewUsers++
			if activated {
				sg.Activated++
			}
		}
	}

	return c.JSON(buildOnboardingResponse(steps, body.TTVDays, newUsers, stepUsers, perStepTimes, ttvToFinal, cohorts, breakdown))
}

type obCohort struct {
	Week      string `json:"week"`
	NewUsers  int64  `json:"new_users"`
	Activated int64  `json:"activated"`
}
type obSeg struct {
	Value     string `json:"value"`
	NewUsers  int64  `json:"new_users"`
	Activated int64  `json:"activated"`
}

func buildOnboardingResponse(steps []string, ttvDays int, newUsers int64, stepUsers []int64, perStepTimes [][]int64, ttvToFinal []int64, cohorts map[string]*obCohort, breakdown map[string]*obSeg) fiber.Map {
	type stepOut struct {
		EventType          string  `json:"event_type"`
		Users              int64   `json:"users"`
		ConversionRate     float64 `json:"conversion_rate"`      // vs cohort (new users)
		StepConversionRate float64 `json:"step_conversion_rate"` // vs previous step
		DropOff            int64   `json:"drop_off"`
		MedianSeconds      float64 `json:"median_seconds"`
	}
	stepsOut := make([]stepOut, len(steps))
	for i, ev := range steps {
		s := stepOut{EventType: ev, Users: stepUsers[i], MedianSeconds: medianInt(perStepTimes[i])}
		if newUsers > 0 {
			s.ConversionRate = float64(stepUsers[i]) / float64(newUsers)
		}
		if i == 0 {
			s.StepConversionRate = s.ConversionRate
		} else if stepUsers[i-1] > 0 {
			s.StepConversionRate = float64(stepUsers[i]) / float64(stepUsers[i-1])
			s.DropOff = stepUsers[i-1] - stepUsers[i]
		}
		stepsOut[i] = s
	}

	var activated int64
	if len(stepUsers) > 0 {
		activated = stepUsers[len(stepUsers)-1]
	}
	rate := 0.0
	if newUsers > 0 {
		rate = float64(activated) / float64(newUsers)
	}

	cohortList := make([]*obCohort, 0, len(cohorts))
	for _, v := range cohorts {
		cohortList = append(cohortList, v)
	}
	sort.Slice(cohortList, func(i, j int) bool { return cohortList[i].Week < cohortList[j].Week })

	segList := make([]*obSeg, 0, len(breakdown))
	for _, v := range breakdown {
		segList = append(segList, v)
	}
	sort.Slice(segList, func(i, j int) bool { return segList[i].NewUsers > segList[j].NewUsers })
	if len(segList) > 12 {
		segList = segList[:12]
	}

	return fiber.Map{
		"new_users":       newUsers,
		"activated":       activated,
		"activation_rate": rate,
		"ttv_days":        ttvDays,
		"steps":           stepsOut,
		"ttv":             ttvStats(ttvToFinal, ttvDays),
		"cohorts":         cohortList,
		"breakdown":       segList,
	}
}

// ttvStats summarizes time-to-value across activated users.
func ttvStats(xs []int64, ttvDays int) fiber.Map {
	type bucket struct {
		Label string `json:"label"`
		Count int    `json:"count"`
	}
	edges := []struct {
		label string
		max   int64
	}{
		{"< 1h", 3600},
		{"1h–1d", 86400},
		{"1–3d", 3 * 86400},
		{"3d+", int64(ttvDays) * 86400},
	}
	buckets := make([]bucket, len(edges))
	for i, e := range edges {
		buckets[i].Label = e.label
	}
	for _, v := range xs {
		for i, e := range edges {
			if v < e.max || i == len(edges)-1 {
				buckets[i].Count++
				break
			}
		}
	}
	return fiber.Map{
		"median_seconds": medianInt(xs),
		"p25_seconds":    percentileInt(xs, 0.25),
		"p90_seconds":    percentileInt(xs, 0.90),
		"histogram":      buckets,
		"count":          len(xs),
	}
}

func weekKey(unix int64) string {
	t := time.Unix(unix, 0).UTC()
	// back up to Monday
	wd := int(t.Weekday())
	if wd == 0 {
		wd = 7
	}
	monday := t.AddDate(0, 0, -(wd - 1))
	return monday.Format("2006-01-02")
}

func medianInt(xs []int64) float64 { return percentileInt(xs, 0.5) }

func percentileInt(xs []int64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	c := append([]int64(nil), xs...)
	sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
	if len(c) == 1 {
		return float64(c[0])
	}
	// Linear interpolation between closest ranks — matches ClickHouse quantile()
	// and the standard percentile definition (was nearest-rank, which disagreed).
	pos := p * float64(len(c)-1)
	lo := int(math.Floor(pos))
	hi := int(math.Ceil(pos))
	if lo == hi {
		return float64(c[lo])
	}
	frac := pos - float64(lo)
	return float64(c[lo])*(1-frac) + float64(c[hi])*frac
}

// onboardingBreakdownCol maps a breakdown key to a safe native column, or '' if
// none/invalid (breakdown is then skipped).
func onboardingBreakdownCol(key string) string {
	allow := map[string]bool{
		"country": true, "region": true, "city": true, "platform": true,
		"os_name": true, "device_type": true, "browser": true,
		"utm_source": true, "utm_medium": true, "utm_campaign": true, "referrer": true,
	}
	if allow[key] {
		return key
	}
	return "''"
}

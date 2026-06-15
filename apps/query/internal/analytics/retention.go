package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type RetentionQuery struct {
	ProjectID   string
	StartEvent  string
	ReturnEvent string
	StartDate   time.Time
	EndDate     time.Time
	Granularity string // day, week
	Periods     int
	Mode        string // nday (exact day N) | unbounded (day N or later)
	Filters     []Filter
	CohortSQL   string
}

type RetentionRow struct {
	CohortDate string    `json:"cohort_date"`
	Periods    []float64 `json:"periods"`
	CohortSize int64     `json:"cohort_size"`
}

// elapsedPeriods returns how many whole periods (in the given unit) have passed
// between a cohort's start date and now. Period p is "complete enough to show"
// when p <= elapsed; later periods are still in the future.
func elapsedPeriods(cohortDate, unit string, now time.Time) int {
	t, err := time.Parse("2006-01-02", cohortDate)
	if err != nil {
		return 1 << 30 // unparseable → don't mask anything
	}
	switch unit {
	case "week":
		return int(now.Sub(t).Hours() / (24 * 7))
	case "month":
		return (now.Year()-t.Year())*12 + int(now.Month()) - int(t.Month())
	default: // day
		return int(now.Sub(t).Hours() / 24)
	}
}

func Retention(ctx context.Context, conn clickhouse.Conn, q RetentionQuery) ([]RetentionRow, error) {
	// N-day retention. Two flat queries, pivoted into the period grid in Go —
	// avoids ClickHouse array-lambda + aggregate scoping pitfalls.

	flt := buildFilters(q.Filters) + q.CohortSQL

	// Granularity: bucket cohorts + return activity by day / week / month. Tokens
	// are from a strict allowlist, so safe to interpolate. Weeks start Monday.
	unit := q.Granularity
	if unit != "week" && unit != "month" {
		unit = "day"
	}
	startOf := map[string]string{"day": "toStartOfDay", "week": "toStartOfWeek", "month": "toStartOfMonth"}[unit]
	weekArg := ""
	if unit == "week" {
		weekArg = ", 1" // Monday
	}
	cohortExpr := fmt.Sprintf("%s(min(event_time)%s)", startOf, weekArg) // first-seen bucket
	activeExpr := fmt.Sprintf("%s(event_time%s)", startOf, weekArg)      // active bucket

	// 1) Cohort sizes: users grouped by the period they first did StartEvent.
	sizeSQL := fmt.Sprintf(`
		SELECT formatDateTime(cohort_day, '%%Y-%%m-%%d') AS cohort_date,
		       toInt64(count(DISTINCT user_id))        AS cohort_size
		FROM (
			SELECT if(user_id != '', user_id, device_id) AS user_id, %[1]s AS cohort_day
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = ? AND event_time BETWEEN ? AND ? %[2]s
			GROUP BY user_id
		)
		GROUP BY cohort_date
		ORDER BY cohort_date ASC
	`, cohortExpr, flt)
	sizeRows, err := conn.Query(ctx, sizeSQL, q.ProjectID, q.StartEvent, q.StartDate, q.EndDate)
	if err != nil {
		return nil, err
	}
	defer sizeRows.Close()

	type rowAcc struct {
		size    int64
		periods []float64
	}
	order := []string{}
	acc := map[string]*rowAcc{}
	for sizeRows.Next() {
		var date string
		var size int64
		if err := sizeRows.Scan(&date, &size); err != nil {
			return nil, err
		}
		p := make([]float64, q.Periods)
		acc[date] = &rowAcc{size: size, periods: p}
		order = append(order, date)
	}

	// 2) Per-user active periods so we can compute either N-day (active exactly on
	// day N) or unbounded (active on day N or any later day) retention in Go.
	gridSQL := fmt.Sprintf(`
		SELECT
			formatDateTime(c.cohort_day, '%%Y-%%m-%%d') AS cohort_date,
			c.user_id AS uid,
			groupUniqArray(toInt64(dateDiff('%[3]s', c.cohort_day, a.active_day))) AS periods
		FROM (
			SELECT if(user_id != '', user_id, device_id) AS user_id, %[1]s AS cohort_day
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = ? AND event_time BETWEEN ? AND ? %[2]s
			GROUP BY user_id
		) c
		INNER JOIN (
			SELECT DISTINCT if(user_id != '', user_id, device_id) AS user_id, %[4]s AS active_day
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = ? AND event_time BETWEEN ? AND dateAdd(%[5]s, ?, ?)
		) a ON c.user_id = a.user_id
		WHERE a.active_day >= c.cohort_day
		  AND dateDiff('%[3]s', c.cohort_day, a.active_day) < ?
		GROUP BY cohort_date, uid
	`, cohortExpr, flt, unit, activeExpr, unit)
	gridRows, err := conn.Query(ctx, gridSQL,
		q.ProjectID, q.StartEvent, q.StartDate, q.EndDate,
		q.ProjectID, q.ReturnEvent, q.StartDate, q.Periods, q.EndDate,
		q.Periods,
	)
	if err != nil {
		return nil, err
	}
	defer gridRows.Close()

	// retainedCount[cohort][period] = number of users counted as retained.
	retained := map[string][]int64{}
	for d := range acc {
		retained[d] = make([]int64, q.Periods)
	}
	for gridRows.Next() {
		var date, uid string
		var periods []int64
		if err := gridRows.Scan(&date, &uid, &periods); err != nil {
			return nil, err
		}
		r, ok := retained[date]
		if !ok {
			continue
		}
		if q.Mode == "unbounded" {
			// Active on day N or later → counted for every period up to their max.
			maxP := int64(-1)
			for _, p := range periods {
				if p > maxP {
					maxP = p
				}
			}
			for p := int64(0); p <= maxP && int(p) < q.Periods; p++ {
				r[p]++
			}
		} else {
			// N-day: counted only on the exact periods they were active.
			for _, p := range periods {
				if p >= 0 && int(p) < q.Periods {
					r[p]++
				}
			}
		}
	}
	// Periods that haven't elapsed yet for a cohort are NOT zero retention —
	// they have no data. Mark them -1 so the UI renders them blank instead of
	// "0%" (which made recent cohorts look like they cratered).
	now := time.Now().UTC()
	for date, a := range acc {
		if a.size == 0 {
			continue
		}
		elapsed := elapsedPeriods(date, unit, now)
		for p := 0; p < q.Periods; p++ {
			if p > elapsed {
				a.periods[p] = -1 // future period — no data yet
				continue
			}
			a.periods[p] = float64(retained[date][p]) / float64(a.size)
		}
	}

	results := []RetentionRow{}
	for _, date := range order {
		a := acc[date]
		results = append(results, RetentionRow{
			CohortDate: date,
			CohortSize: a.size,
			Periods:    a.periods,
		})
	}
	return results, nil
}

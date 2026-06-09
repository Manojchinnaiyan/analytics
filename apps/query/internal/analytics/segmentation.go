package analytics

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type SegmentationQuery struct {
	ProjectID   string
	EventType   string
	StartDate   time.Time
	EndDate     time.Time
	Granularity string // day, week, month
	GroupBy     string // event property to break down by
	Filters     []Filter
	Metric      string // totals, uniques, sum, average
	Property    string // numeric event property for sum/average metrics
	CohortSQL   string // optional raw SQL fragment restricting to a cohort's members
}

type Filter struct {
	Property string
	Operator string // is, is_not, contains, greater_than, less_than
	Value    interface{}
	Type     string // event | user | system | derived
	RawExpr  string // pre-compiled SQL expression (derived properties)
}

// DerivedExpr compiles a derived property (a transform over a source property)
// into a ClickHouse expression — Amplitude-style computed properties.
func DerivedExpr(sourceProp, sourceType, transform, config string) string {
	base := resolveCol(sourceProp, sourceType)
	cfg := escapeProp(config)
	switch transform {
	case "lowercase":
		return fmt.Sprintf("lower(%s)", base)
	case "uppercase":
		return fmt.Sprintf("upper(%s)", base)
	case "email_domain":
		return fmt.Sprintf("arrayElement(splitByChar('@', %s), -1)", base)
	case "url_domain":
		return fmt.Sprintf("domain(%s)", base)
	case "url_path":
		return fmt.Sprintf("path(%s)", base)
	case "regex": // first capture group of the configured pattern
		return fmt.Sprintf("extract(%s, '%s')", base, cfg)
	case "before": // text before a separator
		return fmt.Sprintf("arrayElement(splitByString('%s', %s), 1)", cfg, base)
	case "after": // text after a separator
		return fmt.Sprintf("arrayElement(splitByString('%s', %s), -1)", cfg, base)
	default:
		return base
	}
}

// resolveCol returns the SQL string expression for a property given its type:
// event → properties JSON, user → user_properties JSON, system → native column.
func resolveCol(field, typ string) string {
	field = escapeProp(field)
	switch typ {
	case "user":
		return fmt.Sprintf("JSONExtractString(user_properties, '%s')", field)
	case "event":
		return fmt.Sprintf("JSONExtractString(properties, '%s')", field)
	default: // system / legacy: native column if it exists, else event property
		if nativeColumns[field] {
			return field
		}
		return fmt.Sprintf("JSONExtractString(properties, '%s')", field)
	}
}

func resolveColFloat(field, typ string) string {
	field = escapeProp(field)
	switch typ {
	case "user":
		return fmt.Sprintf("JSONExtractFloat(user_properties, '%s')", field)
	case "event":
		return fmt.Sprintf("JSONExtractFloat(properties, '%s')", field)
	default:
		if nativeColumns[field] {
			return fmt.Sprintf("toFloat64OrZero(%s)", field)
		}
		return fmt.Sprintf("JSONExtractFloat(properties, '%s')", field)
	}
}

type DataPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
	Group string  `json:"group,omitempty"`
}

func Segmentation(ctx context.Context, conn clickhouse.Conn, q SegmentationQuery) ([]DataPoint, error) {
	dateFormat := dateFormatFor(q.Granularity)
	metricExpr := metricExpression(q.Metric, q.Property)
	// Guard NaN/Inf (e.g. avg/quantile over a property with no numeric values, or
	// a zero divisor in frequency) — Go's JSON encoder rejects non-finite floats,
	// which would otherwise 500 the whole response.
	safeMetric := fmt.Sprintf("if(isNaN(%[1]s) OR isInfinite(%[1]s), 0, %[1]s)", metricExpr)

	sql := fmt.Sprintf(`
		SELECT
			formatDateTime(toStartOf%s(event_time), '%s') AS date,
			%s AS value
			%s
		FROM inspectuser.events
		WHERE
			project_id = ?
			AND event_type = ?
			AND event_time BETWEEN ? AND ?
			%s%s
		GROUP BY date %s
		ORDER BY date ASC
	`,
		granularityFunc(q.Granularity),
		dateFormat,
		safeMetric,
		groupBySelect(q.GroupBy),
		buildFilters(q.Filters),
		q.CohortSQL,
		groupByClause(q.GroupBy),
	)

	rows, err := conn.Query(ctx, sql,
		q.ProjectID,
		q.EventType,
		q.StartDate,
		q.EndDate,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []DataPoint
	for rows.Next() {
		var dp DataPoint
		if q.GroupBy != "" {
			if err := rows.Scan(&dp.Date, &dp.Value, &dp.Group); err != nil {
				return nil, err
			}
		} else {
			if err := rows.Scan(&dp.Date, &dp.Value); err != nil {
				return nil, err
			}
		}
		results = append(results, dp)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Zero-fill: GROUP BY date only emits buckets that had events, so empty
	// days/weeks/months vanish and the trend looks compressed. Rebuild the full
	// period grid (every other trend in the product zero-fills the same way).
	periods := periodStarts(q.StartDate, q.EndDate, q.Granularity)
	if q.GroupBy == "" {
		have := make(map[string]float64, len(results))
		for _, dp := range results {
			have[dp.Date] = dp.Value
		}
		out := make([]DataPoint, 0, len(periods))
		for _, p := range periods {
			out = append(out, DataPoint{Date: p, Value: have[p]})
		}
		return out, nil
	}

	// Grouped: fill every (period, group) cell for the groups that appeared.
	groupsSeen := []string{}
	seen := map[string]bool{}
	have := map[string]map[string]float64{}
	for _, dp := range results {
		if !seen[dp.Group] {
			seen[dp.Group] = true
			groupsSeen = append(groupsSeen, dp.Group)
		}
		if have[dp.Date] == nil {
			have[dp.Date] = map[string]float64{}
		}
		have[dp.Date][dp.Group] = dp.Value
	}
	sort.Strings(groupsSeen)
	out := make([]DataPoint, 0, len(periods)*len(groupsSeen))
	for _, p := range periods {
		for _, g := range groupsSeen {
			v := 0.0
			if m := have[p]; m != nil {
				v = m[g]
			}
			out = append(out, DataPoint{Date: p, Value: v, Group: g})
		}
	}
	return out, nil
}

// periodStarts lists every bucket-start date (formatted YYYY-MM-DD) in [start,end)
// for the granularity, aligned to ClickHouse's toStartOf{Day,Week,Month}. `end` is
// an EXCLUSIVE upper bound (the handler passes end-of-range + 24h), so the loop is
// strictly-before. Weeks use Sunday start to match toStartOfWeek's default (mode 0).
func periodStarts(start, end time.Time, granularity string) []string {
	const f = "2006-01-02"
	start, end = start.UTC(), end.UTC()
	d := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	var cur time.Time
	switch granularity {
	case "week":
		cur = d.AddDate(0, 0, -int(d.Weekday()))
	case "month":
		cur = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	default:
		cur = d
	}
	out := []string{}
	for cur.Before(end) {
		out = append(out, cur.Format(f))
		switch granularity {
		case "week":
			cur = cur.AddDate(0, 0, 7)
		case "month":
			cur = cur.AddDate(0, 1, 0)
		default:
			cur = cur.AddDate(0, 0, 1)
		}
	}
	return out
}

func granularityFunc(g string) string {
	switch g {
	case "week":
		return "Week"
	case "month":
		return "Month"
	default:
		return "Day"
	}
}

func dateFormatFor(g string) string {
	switch g {
	case "week", "month":
		return "%Y-%m-%d"
	default:
		return "%Y-%m-%d"
	}
}

func metricExpression(metric, property string) string {
	switch metric {
	case "uniques":
		return "toFloat64(uniq(if(user_id != '', user_id, device_id)))"
	case "sum":
		if property == "" {
			return "toFloat64(count())"
		}
		return fmt.Sprintf("toFloat64(sum(JSONExtractFloat(properties, '%s')))", escapeProp(property))
	case "average":
		if property == "" {
			return "toFloat64(count())"
		}
		return fmt.Sprintf("toFloat64(avg(JSONExtractFloat(properties, '%s')))", escapeProp(property))
	case "frequency":
		// Avg events per active user (engagement depth) — Amplitude "frequency".
		return "toFloat64(count()) / toFloat64(uniq(if(user_id != '', user_id, device_id)))"
	case "median", "p50", "p90", "p95", "p99":
		// Percentile of a numeric event property over time (distribution insight).
		if property == "" {
			return "toFloat64(count())"
		}
		q := map[string]string{"median": "0.5", "p50": "0.5", "p90": "0.9", "p95": "0.95", "p99": "0.99"}[metric]
		return fmt.Sprintf("toFloat64(quantile(%s)(JSONExtractFloat(properties, '%s')))", q, escapeProp(property))
	default:
		return "toFloat64(count())"
	}
}

// escapeProp strips single quotes to keep the interpolated property name safe.
func escapeProp(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r != '\'' {
			out = append(out, r)
		}
	}
	return string(out)
}

// nativeColumns are first-class event columns; anything else is treated as an
// event property stored in the `properties` JSON.
var nativeColumns = map[string]bool{
	"user_id": true, "device_id": true, "session_id": true, "event_type": true,
	"platform": true, "os_name": true, "os_version": true, "device_type": true,
	"browser": true, "browser_version": true, "country": true, "region": true, "city": true,
	"utm_source": true, "utm_medium": true, "utm_campaign": true, "utm_term": true,
	"utm_content": true, "referrer": true, "sdk_version": true,
}

// colStr resolves a field to a String SQL expression (native column or JSON extract).
func colStr(field string) string {
	field = escapeProp(field)
	if nativeColumns[field] {
		return field
	}
	return fmt.Sprintf("JSONExtractString(properties, '%s')", field)
}

// colFloat resolves a field to a Float64 SQL expression for numeric comparisons.
func colFloat(field string) string {
	field = escapeProp(field)
	if nativeColumns[field] {
		return fmt.Sprintf("toFloat64OrZero(%s)", field)
	}
	return fmt.Sprintf("JSONExtractFloat(properties, '%s')", field)
}

func escapeVal(v interface{}) string {
	s := fmt.Sprintf("%v", v)
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r != '\'' {
			out = append(out, r)
		}
	}
	return string(out)
}

func groupBySelect(gb string) string {
	if gb == "" {
		return ""
	}
	return fmt.Sprintf(`, %s AS grp`, colStr(gb))
}

func groupByClause(gb string) string {
	if gb == "" {
		return ""
	}
	return ", grp"
}

// buildFilters turns filters into AND-ed SQL conditions. Supports both event
// properties and native columns, with single-quote escaping.
// FilterSQL exposes the segment-filter compiler to other packages (e.g. the
// feature-engagement handler) so they apply property filters identically to
// segmentation. Returns a string of " AND ..." clauses (empty if no filters).
func FilterSQL(filters []Filter) string { return buildFilters(filters) }

func buildFilters(filters []Filter) string {
	result := ""
	for _, f := range filters {
		if f.Property == "" {
			continue
		}
		val := escapeVal(f.Value)
		col := f.RawExpr
		if col == "" {
			col = resolveCol(f.Property, f.Type)
		}
		colF := col
		if f.RawExpr == "" {
			colF = resolveColFloat(f.Property, f.Type)
		}
		switch f.Operator {
		case "is":
			result += fmt.Sprintf(" AND %s = '%s'", col, val)
		case "is_not":
			result += fmt.Sprintf(" AND %s != '%s'", col, val)
		case "contains":
			result += fmt.Sprintf(" AND %s ILIKE '%%%s%%'", col, val)
		case "greater_than":
			result += fmt.Sprintf(" AND %s > %s", colF, val)
		case "less_than":
			result += fmt.Sprintf(" AND %s < %s", colF, val)
		}
	}
	return result
}

package analytics

import (
	"strings"
	"testing"
)

func TestEscapeVal(t *testing.T) {
	cases := map[string]string{
		"abc":   "abc",
		"a'b":   "ab",
		"'; --": "; --",
	}
	for in, want := range cases {
		if got := escapeVal(in); got != want {
			t.Errorf("escapeVal(%q) = %q, want %q", in, got, want)
		}
	}
	if got := escapeVal(5); got != "5" {
		t.Errorf("escapeVal(5) = %q, want \"5\"", got)
	}
}

func TestColStr(t *testing.T) {
	// Native column resolves to itself.
	if got := colStr("country"); got != "country" {
		t.Errorf("colStr(country) = %q, want country", got)
	}
	// Non-native field becomes a JSON extract.
	if got := colStr("plan"); got != "JSONExtractString(properties, 'plan')" {
		t.Errorf("colStr(plan) = %q", got)
	}
	// Quotes are stripped from the field name.
	if got := colStr("pl'an"); strings.Contains(got, "'an'") && strings.Count(got, "'") != 2 {
		t.Errorf("colStr did not sanitize quotes: %q", got)
	}
}

func TestMetricExpression(t *testing.T) {
	if got := metricExpression("uniques", ""); !strings.Contains(got, "uniq(if(user_id") {
		t.Errorf("uniques metric wrong: %q", got)
	}
	if got := metricExpression("totals", ""); got != "toFloat64(count())" {
		t.Errorf("totals metric = %q", got)
	}
	if got := metricExpression("sum", ""); got != "toFloat64(count())" {
		t.Errorf("sum without property should fall back to count: %q", got)
	}
	if got := metricExpression("sum", "revenue"); !strings.Contains(got, "sum(JSONExtractFloat(properties, 'revenue'))") {
		t.Errorf("sum metric = %q", got)
	}
}

func TestBuildFilters(t *testing.T) {
	got := buildFilters([]Filter{{Property: "plan", Operator: "is", Value: "pro"}})
	want := " AND JSONExtractString(properties, 'plan') = 'pro'"
	if got != want {
		t.Errorf("buildFilters = %q, want %q", got, want)
	}
	// Empty property is skipped.
	if got := buildFilters([]Filter{{Property: "", Operator: "is", Value: "x"}}); got != "" {
		t.Errorf("buildFilters skipped-empty = %q, want empty", got)
	}
}

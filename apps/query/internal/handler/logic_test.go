package handler

import "testing"

func TestClassifyChannel(t *testing.T) {
	cases := []struct {
		source, medium, referrer string
		want                     string
	}{
		{"", "cpc", "", "Paid Search"},
		{"", "paid_search", "", "Paid Search"},
		{"", "email", "", "Email"},
		{"facebook", "", "", "Social"},
		{"", "social", "", "Social"},
		{"", "referral", "", "Referral"},
		{"", "organic", "", "Organic Search"},
		{"", "display", "", "Display"},
		{"producthunt", "", "", "Campaign"},
		{"", "", "https://blog.example.com/post", "Referral"},
		{"", "", "", "Direct"},
	}
	for _, c := range cases {
		if got := classifyChannel(c.source, c.medium, c.referrer); got != c.want {
			t.Errorf("classifyChannel(%q,%q,%q) = %q, want %q", c.source, c.medium, c.referrer, got, c.want)
		}
	}
}

func TestSanitizeLimit(t *testing.T) {
	cases := map[string]string{
		"50":  "50",
		"":    "50",
		"abc": "50",
		"0":   "50",
		"-5":  "50",
		"100": "100",
		"999": "500", // clamped at max
		"501": "500",
		"500": "500",
	}
	for in, want := range cases {
		if got := sanitizeLimit(in); got != want {
			t.Errorf("sanitizeLimit(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAlertBodyNormalize(t *testing.T) {
	cases := []struct {
		in   alertBody
		want alertBody
	}{
		{alertBody{Metric: "bogus", Operator: "x", WindowMin: 0}, alertBody{Metric: "count", Operator: "above", WindowMin: 60}},
		{alertBody{Metric: "unique_users", Operator: "below", WindowMin: 30}, alertBody{Metric: "unique_users", Operator: "below", WindowMin: 30}},
		{alertBody{Metric: "count", Operator: "above", WindowMin: 99999}, alertBody{Metric: "count", Operator: "above", WindowMin: 60}},
	}
	for _, c := range cases {
		b := c.in
		b.normalize()
		if b.Metric != c.want.Metric || b.Operator != c.want.Operator || b.WindowMin != c.want.WindowMin {
			t.Errorf("normalize(%+v) = {%s,%s,%d}, want {%s,%s,%d}",
				c.in, b.Metric, b.Operator, b.WindowMin, c.want.Metric, c.want.Operator, c.want.WindowMin)
		}
	}
}

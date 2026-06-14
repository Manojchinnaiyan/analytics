package handler

import (
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
)

// EcommerceHandler powers the dedicated Ecommerce section: store KPIs, the
// shopping funnel, and product-level rankings — built on the Shopify pixel events
// (Product Viewed / Added to Cart / Checkout Started / Order Completed /
// Product Purchased). Revenue is captured as a string, so we toFloat64OrZero it.
type EcommerceHandler struct {
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewEcommerceHandler(ch clickhouse.Conn, log *zap.Logger) *EcommerceHandler {
	return &EcommerceHandler{ch: ch, log: log}
}

func ecomSince(c fiber.Ctx) time.Time {
	d, _ := strconv.Atoi(c.Query("days", "30"))
	if d <= 0 || d > 365 {
		d = 30
	}
	return time.Now().AddDate(0, 0, -d)
}

const revExpr = "toFloat64OrZero(JSONExtractString(properties,'revenue'))"

// GET /projects/:id/ecommerce/overview — KPI cards + funnel.
func (h *EcommerceHandler) Overview(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()
	since := ecomSince(c)

	// Three independent queries (headline KPIs, funnel, daily trend) — run concurrently.
	var revenue, units float64
	var orders, sessions, converting uint64
	var viewed, carted, checkout, purchased uint64
	trend := []fiber.Map{}
	parallel(
		func() {
			_ = h.ch.QueryRow(ctx, `
		SELECT
			sumIf(`+revExpr+`, event_type='Order Completed'),
			countIf(event_type='Order Completed'),
			countIf(event_type='Product Purchased'),
			uniqExactIf(session_id, session_id != ''),
			uniqExactIf(session_id, event_type='Order Completed')
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= ?`,
				projectID, since,
			).Scan(&revenue, &orders, &units, &sessions, &converting)
		},
		func() {
			_ = h.ch.QueryRow(ctx, `
		SELECT
			uniqExactIf(session_id, event_type='Product Viewed'),
			uniqExactIf(session_id, event_type='Product Added to Cart'),
			uniqExactIf(session_id, event_type='Checkout Started'),
			uniqExactIf(session_id, event_type='Order Completed')
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= ?`,
				projectID, since,
			).Scan(&viewed, &carted, &checkout, &purchased)
		},
		func() {
			// Daily trend for the chart.
			if rows, err := h.ch.Query(ctx, `
		SELECT toString(toDate(event_time)) AS d,
			sumIf(`+revExpr+`, event_type='Order Completed') AS rev,
			countIf(event_type='Order Completed') AS ord,
			countIf(event_type='Product Viewed') AS vw
		FROM inspectuser.events
		WHERE project_id = ? AND event_time >= ?
		GROUP BY d ORDER BY d`, projectID, since); err == nil {
				defer rows.Close()
				for rows.Next() {
					var d string
					var rev float64
					var ord, vw uint64
					if rows.Scan(&d, &rev, &ord, &vw) == nil {
						trend = append(trend, fiber.Map{"date": d, "revenue": rev, "orders": ord, "views": vw})
					}
				}
			}
		},
	)

	aov := 0.0
	if orders > 0 {
		aov = revenue / float64(orders)
	}
	conv := 0.0
	if sessions > 0 {
		conv = float64(converting) / float64(sessions) * 100
	}

	return c.JSON(fiber.Map{
		"revenue": revenue, "orders": orders, "units": uint64(units),
		"aov": aov, "sessions": sessions, "conversion": conv,
		"funnel": fiber.Map{"viewed": viewed, "carted": carted, "checkout": checkout, "purchased": purchased},
		"trend":  trend,
	})
}

// GET /projects/:id/ecommerce/products — ranked product performance.
func (h *EcommerceHandler) Products(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx := c.Context()
	since := ecomSince(c)

	rows, err := h.ch.Query(ctx, `
		SELECT product, views, carts, units, revenue FROM (
			SELECT
				JSONExtractString(properties,'product') AS product,
				countIf(event_type='Product Viewed') AS views,
				countIf(event_type='Product Added to Cart') AS carts,
				countIf(event_type='Product Purchased') AS units,
				sumIf(`+revExpr+`, event_type='Product Purchased') AS revenue
			FROM inspectuser.events
			WHERE project_id = ? AND event_time >= ?
				AND event_type IN ('Product Viewed','Product Added to Cart','Product Purchased')
				AND JSONExtractString(properties,'product') != ''
			GROUP BY product
		) ORDER BY views DESC, revenue DESC LIMIT 50`,
		projectID, since,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "query failed"})
	}
	defer rows.Close()
	type prod struct {
		Product string  `json:"product"`
		Views   uint64  `json:"views"`
		Carts   uint64  `json:"carts"`
		Units   uint64  `json:"units"`
		Revenue float64 `json:"revenue"`
	}
	out := []prod{}
	for rows.Next() {
		var p prod
		if rows.Scan(&p.Product, &p.Views, &p.Carts, &p.Units, &p.Revenue) == nil {
			out = append(out, p)
		}
	}
	return c.JSON(fiber.Map{"products": out})
}

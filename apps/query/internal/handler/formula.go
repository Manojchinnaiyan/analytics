package handler

import (
	"time"

	"github.com/inspectuser/query/internal/analytics"
	"github.com/gofiber/fiber/v3"
	"go.uber.org/zap"
)

// POST /v1/query/formula
// Computes several named metric series (A, B, C…) so the client can evaluate a
// formula across them — e.g. conversion = A/B*100. Each metric is a normal
// segmentation query; the formula is applied per-date on the client.
func (h *QueryHandler) Formula(c fiber.Ctx) error {
	var body struct {
		ProjectID   string `json:"project_id"`
		Start       string `json:"start"`
		End         string `json:"end"`
		Granularity string `json:"granularity"`
		Metrics     []struct {
			Key       string             `json:"key"`
			EventType string             `json:"event_type"`
			Metric    string             `json:"metric"`
			Property  string             `json:"property"`
			Filters   []analytics.Filter `json:"filters"`
		} `json:"metrics"`
		CohortID string `json:"cohort_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}

	start, _ := time.Parse(dateFmt, body.Start)
	end, _ := time.Parse(dateFmt, body.End)
	gran := body.Granularity
	if gran == "" {
		gran = "day"
	}
	cohortSQL := h.cohortFilter(body.ProjectID, body.CohortID)

	series := fiber.Map{}
	for _, m := range body.Metrics {
		if m.EventType == "" {
			series[m.Key] = []analytics.DataPoint{}
			continue
		}
		data, err := analytics.Segmentation(c.Context(), h.ch, analytics.SegmentationQuery{
			ProjectID:   body.ProjectID,
			EventType:   m.EventType,
			StartDate:   start,
			EndDate:     end.Add(24 * time.Hour),
			Granularity: gran,
			Metric:      m.Metric,
			Property:    m.Property,
			Filters:     m.Filters,
			CohortSQL:   cohortSQL,
		})
		if err != nil {
			h.log.Error("formula metric failed", zap.Error(err), zap.String("key", m.Key))
			series[m.Key] = []analytics.DataPoint{}
			continue
		}
		series[m.Key] = data
	}

	return c.JSON(fiber.Map{"series": series})
}

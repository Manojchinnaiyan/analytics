package handler

import (
	"context"
	"encoding/json"
	"time"

	"github.com/amplitude-clone/query/internal/replay"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type ReplayHandler struct {
	store replay.Store
	rdb   *redis.Client
	log   *zap.Logger
}

func NewReplayHandler(store replay.Store, rdb *redis.Client, log *zap.Logger) *ReplayHandler {
	return &ReplayHandler{store: store, rdb: rdb, log: log}
}

// POST /replay — api-key authenticated chunk upload from the recording SDK.
// body: {api_key, session_id, distinct_id, events: [rrweb events]}
func (h *ReplayHandler) Ingest(c fiber.Ctx) error {
	apiKey := c.Get("X-API-Key")
	var body struct {
		APIKey     string            `json:"api_key"`
		SessionID  string            `json:"session_id"`
		DistinctID string            `json:"distinct_id"`
		Events     []json.RawMessage `json:"events"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if apiKey == "" {
		apiKey = body.APIKey
	}
	if apiKey == "" || body.SessionID == "" || len(body.Events) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "api_key, session_id and events required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	projectID, err := h.rdb.Get(ctx, "apikey:"+apiKey).Result()
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid api_key"})
	}

	eventsJSON, _ := sonic.Marshal(body.Events)
	if err := h.store.Put(c.Context(), projectID, body.SessionID, body.DistinctID, eventsJSON, len(body.Events)); err != nil {
		h.log.Error("replay store failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to store replay"})
	}
	return c.JSON(fiber.Map{"ok": true, "events": len(body.Events), "store": h.store.Backend()})
}

// GET /v1/projects/:id/replays — list recorded sessions.
func (h *ReplayHandler) List(c fiber.Ctx) error {
	sessions, err := h.store.List(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	out := []fiber.Map{}
	for _, s := range sessions {
		out = append(out, fiber.Map{
			"session_id": s.SessionID, "distinct_id": s.DistinctID,
			"started_at": s.Started, "duration_ms": s.Ended.Sub(s.Started).Milliseconds(), "chunks": s.Chunks,
		})
	}
	return c.JSON(fiber.Map{"replays": out, "store": h.store.Backend()})
}

// GET /v1/projects/:id/replays/:sessionId — concatenated rrweb events for playback.
func (h *ReplayHandler) Get(c fiber.Ctx) error {
	events, err := h.store.Events(c.Context(), c.Params("id"), c.Params("sessionId"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"events": events})
}

// DELETE /v1/projects/:id/replays/:sessionId — delete a recording.
func (h *ReplayHandler) Delete(c fiber.Ctx) error {
	if err := h.store.Delete(c.Context(), c.Params("id"), c.Params("sessionId")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": true})
}

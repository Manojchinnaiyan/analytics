package handler

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// GDPRHandler implements data-subject rights (GDPR Art. 15 access / Art. 17
// erasure) for a single end user within a project: export everything we hold
// about them, or delete it irreversibly. Owner/admin only.
type GDPRHandler struct {
	ch  clickhouse.Conn
	rdb *redis.Client
	log *zap.Logger
}

func NewGDPRHandler(ch clickhouse.Conn, rdb *redis.Client, log *zap.Logger) *GDPRHandler {
	return &GDPRHandler{ch: ch, rdb: rdb, log: log}
}

type subjectRequest struct {
	UserID   string `json:"user_id"`
	DeviceID string `json:"device_id"`
}

// matchClause builds "(user_id = ? [OR device_id = ?])" plus its args, scoped to
// a project. At least one identifier must be present.
func matchClause(projectID string, r subjectRequest) (string, []any, bool) {
	where := "project_id = ?"
	args := []any{projectID}
	switch {
	case r.UserID != "" && r.DeviceID != "":
		where += " AND (user_id = ? OR device_id = ?)"
		args = append(args, r.UserID, r.DeviceID)
	case r.UserID != "":
		where += " AND user_id = ?"
		args = append(args, r.UserID)
	case r.DeviceID != "":
		where += " AND device_id = ?"
		args = append(args, r.DeviceID)
	default:
		return "", nil, false
	}
	return where, args, true
}

// POST /v1/projects/:id/gdpr/export — return all events + profile for a subject.
func (h *GDPRHandler) Export(c fiber.Ctx) error {
	projectID := c.Params("id")
	var r subjectRequest
	if err := c.Bind().JSON(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	where, args, ok := matchClause(projectID, r)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id or device_id is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := h.ch.Query(ctx, `
		SELECT event_type, event_time, device_id, user_id, session_id,
		       properties, user_properties, platform, os_name, device_type,
		       browser, country, region, city, referrer, ip
		FROM amplitude.events
		WHERE `+where+`
		ORDER BY event_time
		LIMIT 100000`, args...)
	if err != nil {
		h.log.Error("gdpr export query failed", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "export failed"})
	}
	defer rows.Close()

	events := []map[string]any{}
	for rows.Next() {
		var (
			et, did, uid, sid, props, uprops string
			plat, osn, dt, br, ctry, reg, cty, ref, ip string
			ts                                          time.Time
		)
		if rows.Scan(&et, &ts, &did, &uid, &sid, &props, &uprops, &plat, &osn, &dt, &br, &ctry, &reg, &cty, &ref, &ip) != nil {
			continue
		}
		events = append(events, map[string]any{
			"event_type": et, "event_time": ts, "device_id": did, "user_id": uid,
			"session_id": sid, "properties": props, "user_properties": uprops,
			"platform": plat, "os_name": osn, "device_type": dt, "browser": br,
			"country": ctry, "region": reg, "city": cty, "referrer": ref, "ip": ip,
		})
	}

	return c.JSON(fiber.Map{
		"project_id":   projectID,
		"subject":      r,
		"exported_at":  time.Now().UTC(),
		"event_count":  len(events),
		"events":       events,
	})
}

// POST /v1/projects/:id/gdpr/delete — irreversibly erase a subject's data from
// events, profiles, sessions, replays and the Redis identity map.
func (h *GDPRHandler) Delete(c fiber.Ctx) error {
	projectID := c.Params("id")
	var r subjectRequest
	if err := c.Bind().JSON(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	where, args, ok := matchClause(projectID, r)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id or device_id is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// ClickHouse mutations run asynchronously in the background. The events
	// table carries both user_id and device_id; user_profiles and sessions are
	// keyed only by user_id, so they only apply when a user_id is supplied.
	if err := h.ch.Exec(ctx, "ALTER TABLE amplitude.events DELETE WHERE "+where, args...); err != nil {
		h.log.Error("gdpr delete failed", zap.String("table", "events"), zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "delete failed on events"})
	}
	if r.UserID != "" {
		for _, tbl := range []string{"user_profiles", "sessions"} {
			if err := h.ch.Exec(ctx, "ALTER TABLE amplitude."+tbl+" DELETE WHERE project_id = ? AND user_id = ?", projectID, r.UserID); err != nil {
				h.log.Error("gdpr delete failed", zap.String("table", tbl), zap.Error(err))
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "delete failed on " + tbl})
			}
		}
	}
	// Session replays are keyed by distinct_id (the user or device identifier).
	for _, id := range []string{r.UserID, r.DeviceID} {
		if id == "" {
			continue
		}
		_ = h.ch.Exec(ctx, `ALTER TABLE amplitude.session_replays DELETE WHERE project_id = ? AND distinct_id = ?`, projectID, id)
	}

	// Purge the Redis identity map entries that resolve to this subject so
	// future anonymous events aren't re-stitched back to the deleted user.
	purged := h.purgeIdentityMap(ctx, projectID, r)

	return c.JSON(fiber.Map{
		"project_id":      projectID,
		"subject":         r,
		"deleted_at":      time.Now().UTC(),
		"identity_purged": purged,
		"status":          "scheduled", // ClickHouse mutations complete asynchronously
	})
}

// purgeIdentityMap deletes idmap:<project>:<device> keys whose value is the
// deleted user, plus the direct device key. Returns how many were removed.
func (h *GDPRHandler) purgeIdentityMap(ctx context.Context, projectID string, r subjectRequest) int {
	purged := 0
	if r.DeviceID != "" {
		if n, _ := h.rdb.Del(ctx, "idmap:"+projectID+":"+r.DeviceID).Result(); n > 0 {
			purged += int(n)
		}
	}
	if r.UserID == "" {
		return purged
	}
	var cursor uint64
	prefix := "idmap:" + projectID + ":"
	for {
		keys, next, err := h.rdb.Scan(ctx, cursor, prefix+"*", 200).Result()
		if err != nil {
			break
		}
		for _, k := range keys {
			if v, _ := h.rdb.Get(ctx, k).Result(); v == r.UserID {
				if n, _ := h.rdb.Del(ctx, k).Result(); n > 0 {
					purged += int(n)
				}
			}
		}
		if next == 0 {
			break
		}
		cursor = next
	}
	return purged
}

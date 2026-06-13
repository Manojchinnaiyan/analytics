package handler

import (
	"context"
	"strings"
	"time"

	"github.com/inspectuser/ingestion/internal/geo"
	"github.com/inspectuser/ingestion/internal/kafka"
	"github.com/inspectuser/ingestion/internal/validator"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// resolveLinkCode expands a branded short-link code (?il=<code>) into utm_* by
// reading its config from Redis (link:<code>), so the link can live on the
// customer's own domain and the backend owns the code→source mapping. Only fills
// utm fields that weren't already set explicitly.
func (h *EventHandler) resolveLinkCode(ctx context.Context, e *validator.Event) {
	raw, err := h.rdb.Get(ctx, "link:"+e.LinkCode).Result()
	if err != nil {
		return
	}
	var cfg struct {
		UTMSource   string `json:"utm_source"`
		UTMMedium   string `json:"utm_medium"`
		UTMCampaign string `json:"utm_campaign"`
	}
	if sonic.Unmarshal([]byte(raw), &cfg) != nil {
		return
	}
	if e.UTMSource == "" {
		e.UTMSource = cfg.UTMSource
	}
	if e.UTMMedium == "" {
		e.UTMMedium = cfg.UTMMedium
	}
	if e.UTMCampaign == "" {
		e.UTMCampaign = cfg.UTMCampaign
	}

	// Count the click once per visitor session — a single landing fires several
	// events that all carry the same link code, so dedupe before incrementing the
	// counter the Smart Links page reads (linkclicks:<code>).
	dedup := e.SessionID
	if dedup == "" {
		dedup = e.DeviceID
	}
	if dedup == "" {
		dedup = e.InsertID
	}
	if ok, serr := h.rdb.SetNX(ctx, "linkseen:"+e.LinkCode+":"+dedup, 1, 24*time.Hour).Result(); serr == nil && ok {
		h.rdb.Incr(ctx, "linkclicks:"+e.LinkCode)
	}
}

type EventHandler struct {
	producer *kafka.Producer
	rdb      *redis.Client
	geo      *geo.Resolver
	log      *zap.Logger
}

func NewEventHandler(producer *kafka.Producer, rdb *redis.Client, geoR *geo.Resolver, log *zap.Logger) *EventHandler {
	return &EventHandler{producer: producer, rdb: rdb, geo: geoR, log: log}
}

// botUA matches common crawler / headless / monitor user agents.
var botUA = []string{
	"bot", "crawler", "spider", "crawling", "headless", "phantomjs", "puppeteer",
	"playwright", "slurp", "bingpreview", "facebookexternalhit", "facebot",
	"ahrefs", "semrush", "googlebot", "bingbot", "yandex", "baidu", "duckduckbot",
	"pingdom", "uptimerobot", "lighthouse", "gtmetrix", "curl/", "wget", "python-requests",
}

func isBot(ua string) bool {
	if ua == "" {
		return true // no UA → almost always a script/bot
	}
	l := strings.ToLower(ua)
	for _, b := range botUA {
		if strings.Contains(l, b) {
			return true
		}
	}
	return false
}

// blockedSet returns the event names governance has blocked for a project.
func (h *EventHandler) blockedSet(ctx context.Context, projectID string) map[string]bool {
	if h.rdb == nil {
		return nil
	}
	names, err := h.rdb.SMembers(ctx, "blocked:"+projectID).Result()
	if err != nil || len(names) == 0 {
		return nil
	}
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	return set
}

// POST /v2/httpapi — batch event ingestion (Amplitude-compatible endpoint)
func (h *EventHandler) BatchIngest(c fiber.Ctx) error {
	var req validator.BatchRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	if err := req.Validate(); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Bot / headless filtering — silently accept but drop, like real vendors, so
	// crawlers and synthetic monitors never pollute user counts.
	if isBot(c.Get("User-Agent")) {
		return c.JSON(fiber.Map{"code": 200, "events_ingested": 0, "events_dropped": len(req.Events), "reason": "bot"})
	}

	projectID, ok := c.Locals("project_id").(string)
	if !ok || projectID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	now := time.Now().UnixMilli()

	// Server-side identity anchor: a first-party, HTTP-only cookie that survives
	// client-side storage wipes (Brave/Safari ITP). It keeps the SAME device id
	// across visits even when localStorage is cleared, so users aren't recounted.
	anchor := c.Cookies("_amp_did")
	if anchor == "" {
		for _, e := range req.Events {
			if e.DeviceID != "" {
				anchor = e.DeviceID
				break
			}
		}
	}
	if anchor != "" {
		c.Cookie(&fiber.Cookie{
			Name: "_amp_did", Value: anchor, Path: "/",
			MaxAge: 2 * 365 * 24 * 3600, HTTPOnly: true, SameSite: "Lax",
		})
	}

	// Drop events whose type governance has blocked for this project.
	blocked := h.blockedSet(c.Context(), projectID)

	dctx, dcancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer dcancel()

	// Usage quota: reject the batch once this project's monthly event volume has
	// hit its cap (0 = unlimited). Like vendors, we 429 over-quota traffic.
	ym := time.Now().UTC().Format("200601")
	if limit, err := h.rdb.Get(dctx, "usage:limit:"+projectID).Int64(); err == nil && limit > 0 {
		if used, _ := h.rdb.Get(dctx, "usage:ev:"+projectID+":"+ym).Int64(); used >= limit {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"code": 429, "error": "monthly event quota exceeded", "limit": limit, "used": used,
			})
		}
	}

	// Persistent identity merge: any event carrying BOTH a user_id and device_id
	// records device→user; later anonymous events from that device are stamped
	// with the user_id, so the whole journey unifies under one identity (like
	// Amplitude's identity resolution / the "Amplitude ID").
	idmap := map[string]string{}
	for _, e := range req.Events {
		if e.UserID != "" && e.DeviceID != "" {
			idmap[e.DeviceID] = e.UserID
			h.rdb.Set(dctx, "idmap:"+projectID+":"+e.DeviceID, e.UserID, 2*365*24*time.Hour)
		}
	}
	resolveUser := func(deviceID string) string {
		if u, ok := idmap[deviceID]; ok {
			return u
		}
		u, err := h.rdb.Get(dctx, "idmap:"+projectID+":"+deviceID).Result()
		if err == nil && u != "" {
			idmap[deviceID] = u
			return u
		}
		return ""
	}

	events := make([]interface{}, 0, len(req.Events))
	identities := map[string]struct{}{} // distinct user/device for MTU metering
	dropped := 0
	for _, e := range req.Events {
		if blocked[e.EventType] {
			dropped++
			continue
		}
		// Exactly-once: drop a replayed event whose insert_id we've already seen
		// in the last 7 days (retries, double-fires). SETNX returns false on dup.
		if e.InsertID != "" {
			// Namespace the dedup key by project — otherwise one tenant could
			// pre-claim another tenant's insert_ids and silently suppress their
			// events (cross-tenant data denial).
			if ok, err := h.rdb.SetNX(dctx, "iid:"+projectID+":"+e.InsertID, 1, 7*24*time.Hour).Result(); err == nil && !ok {
				dropped++
				continue
			}
		}
		// Revenue integrity: dedup on $transactionId (30d) so a retried/double
		// purchase never double-counts money — even across separate batches with
		// different insert_ids. The SDK sends $transactionId for exactly this.
		if e.EventType == "Revenue" {
			if tx, ok := e.Properties["$transactionId"].(string); ok && tx != "" {
				if ok2, err := h.rdb.SetNX(dctx, "rev:"+projectID+":"+tx, 1, 30*24*time.Hour).Result(); err == nil && !ok2 {
					dropped++
					continue
				}
			}
		}
		if e.EventTime == nil {
			e.EventTime = &now
		}
		// Anchor anonymous events to the durable server-side device id...
		if anchor != "" && e.UserID == "" {
			e.DeviceID = anchor
		}
		// ...then merge: resolve that device to a known user if one exists.
		if e.UserID == "" && e.DeviceID != "" {
			if u := resolveUser(e.DeviceID); u != "" {
				e.UserID = u
			}
		}
		// Real visitor IP: behind Cloudflare (tunnel/proxy) it's in CF-Connecting-IP;
		// otherwise fall back to the connection IP (trusted X-Forwarded-For).
		clientIP := c.Get("CF-Connecting-IP")
		if clientIP == "" {
			clientIP = c.IP()
		}
		e.IP = clientIP
		// Server-side IP geolocation (authoritative, like Amplitude/PostHog) —
		// overrides the SDK's browser-locale/timezone guess when the DB resolves it.
		if h.geo.Enabled() {
			if country, region, city := h.geo.Lookup(clientIP); country != "" {
				e.Country, e.Region, e.City = country, region, city
			}
		}
		// Branded short-link: ?il=<code> on a customer-domain link → resolve to
		// utm_* server-side (the backend owns the code→source mapping).
		if e.LinkCode != "" {
			h.resolveLinkCode(dctx, &e)
		}
		if id := e.UserID; id != "" {
			identities[id] = struct{}{}
		} else if e.DeviceID != "" {
			identities[e.DeviceID] = struct{}{}
		}
		events = append(events, e)
	}

	if len(events) > 0 {
		if err := h.producer.SendBatch(c.Context(), projectID, events); err != nil {
			h.log.Error("failed to send batch to kafka", zap.Error(err))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ingestion failed"})
		}
		// Meter accepted volume + MTU. Event count is an INCR counter; MTU uses a
		// HyperLogLog (PFADD) so distinct-user counting stays O(1) memory. Both
		// keys expire after ~40 days so old months self-clean.
		evKey := "usage:ev:" + projectID + ":" + ym
		h.rdb.IncrBy(dctx, evKey, int64(len(events)))
		h.rdb.Expire(dctx, evKey, 40*24*time.Hour)
		if len(identities) > 0 {
			ids := make([]interface{}, 0, len(identities))
			for id := range identities {
				ids = append(ids, id)
			}
			mtuKey := "usage:mtu:" + projectID + ":" + ym
			h.rdb.PFAdd(dctx, mtuKey, ids...)
			h.rdb.Expire(dctx, mtuKey, 40*24*time.Hour)
		}
	}

	return c.JSON(fiber.Map{"code": 200, "events_ingested": len(events), "events_dropped": dropped})
}

// POST /identify — user property updates
func (h *EventHandler) Identify(c fiber.Ctx) error {
	var req validator.BatchRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	if err := req.ValidateIdentify(); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	projectID, ok := c.Locals("project_id").(string)
	if !ok || projectID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	now := time.Now().UnixMilli()

	events := make([]interface{}, len(req.Events))
	for i, e := range req.Events {
		e.EventType = "$identify"
		e.EventTime = &now
		events[i] = e
	}

	if err := h.producer.SendBatch(c.Context(), projectID, events); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ingestion failed"})
	}

	return c.JSON(fiber.Map{"code": 200})
}

func Health(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

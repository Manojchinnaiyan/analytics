package handler

import (
	"context"
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
	"time"

	"github.com/amplitude-clone/ingestion/internal/kafka"
	"github.com/amplitude-clone/ingestion/internal/validator"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type FlagEvalHandler struct {
	rdb      *redis.Client
	producer *kafka.Producer
	log      *zap.Logger
}

func NewFlagEvalHandler(rdb *redis.Client, producer *kafka.Producer, log *zap.Logger) *FlagEvalHandler {
	return &FlagEvalHandler{rdb: rdb, producer: producer, log: log}
}

type flagVariant struct {
	Key    string `json:"key"`
	Weight int    `json:"weight"`
}
type targetRule struct {
	Property string `json:"property"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
	Variant  string `json:"variant"`
}
type flagDef struct {
	Key            string        `json:"key"`
	Enabled        bool          `json:"enabled"`
	Rollout        int           `json:"rollout"`
	Holdout        int           `json:"holdout"`
	Variants       []flagVariant `json:"variants"`
	Targeting      []targetRule  `json:"targeting"`
	ExclusionGroup string        `json:"exclusion_group"`
	PrereqFlag     string        `json:"prereq_flag"`
	PrereqVariant  string        `json:"prereq_variant"`
}

// indexFlags builds a key→flag map and exclusion-group→sorted-keys map so the
// evaluator can resolve prerequisites and pick one flag per mutual-exclusion group.
func indexFlags(defs []flagDef) (map[string]flagDef, map[string][]string) {
	byKey := make(map[string]flagDef, len(defs))
	groups := map[string][]string{}
	for _, f := range defs {
		byKey[f.Key] = f
		if f.Enabled && f.ExclusionGroup != "" {
			groups[f.ExclusionGroup] = append(groups[f.ExclusionGroup], f.Key)
		}
	}
	for g := range groups {
		sort.Strings(groups[g])
	}
	return byKey, groups
}

func hash32(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

// bucket maps a string to a stable 0–99 bucket (deterministic per user+flag).
func bucket(s string) int {
	return int(hash32(s) % 100)
}

func matchRule(r targetRule, props map[string]interface{}) bool {
	v, ok := props[r.Property]
	if !ok {
		return false
	}
	s := fmt.Sprintf("%v", v)
	switch r.Operator {
	case "is":
		return s == r.Value
	case "is_not":
		return s != r.Value
	case "contains":
		return strings.Contains(s, r.Value)
	}
	return false
}

// evalVariant resolves a flag to a variant for a user, applying prerequisites,
// mutual exclusion, targeting rules, holdout and rollout. Returns ("", false)
// when the flag is off for the user.
func evalVariant(f flagDef, id string, props map[string]interface{}, byKey map[string]flagDef, groups map[string][]string, depth int) (string, bool) {
	if !f.Enabled || depth > 5 {
		return "", false
	}
	// Prerequisite: the dependency flag must resolve to the required variant.
	if f.PrereqFlag != "" {
		pf, ok := byKey[f.PrereqFlag]
		if !ok {
			return "", false
		}
		pv, on := evalVariant(pf, id, props, byKey, groups, depth+1)
		if !on || (f.PrereqVariant != "" && pv != f.PrereqVariant) {
			return "", false
		}
	}
	// Mutual exclusion: at most one flag per group is active for a given user.
	if f.ExclusionGroup != "" {
		members := groups[f.ExclusionGroup]
		if len(members) > 0 {
			chosen := members[int(hash32(f.ExclusionGroup+"."+id))%len(members)]
			if chosen != f.Key {
				return "", false
			}
		}
	}
	// Targeting rules override bucketing — a matched user always gets the variant.
	for _, r := range f.Targeting {
		if matchRule(r, props) {
			return r.Variant, true
		}
	}
	if f.Holdout > 0 && bucket(f.Key+".holdout."+id) < f.Holdout {
		return "", false
	}
	if bucket(f.Key+"."+id) >= f.Rollout {
		return "", false
	}
	return pickVariant(f.Variants, bucket(f.Key+".variant."+id)), true
}

// pickVariant selects a variant by weighted bucket.
func pickVariant(variants []flagVariant, b int) string {
	total := 0
	for _, v := range variants {
		total += v.Weight
	}
	if total <= 0 {
		return "control"
	}
	scaled := b * total / 100
	acc := 0
	for _, v := range variants {
		acc += v.Weight
		if scaled < acc {
			return v.Key
		}
	}
	return variants[len(variants)-1].Key
}

// POST /v1/flags  body: {api_key, distinct_id}
// Evaluates all of the project's flags for a user, records an exposure event
// per assignment (so experiments can be analyzed), and returns the assignments.
func (h *FlagEvalHandler) Evaluate(c fiber.Ctx) error {
	projectID, _ := c.Locals("project_id").(string)

	var body struct {
		DistinctID     string                 `json:"distinct_id"`
		UserID         string                 `json:"user_id"`
		DeviceID       string                 `json:"device_id"`
		UserProperties map[string]interface{} `json:"user_properties"`
	}
	_ = c.Bind().JSON(&body)
	id := body.DistinctID
	if id == "" {
		id = body.UserID
	}
	if id == "" {
		id = body.DeviceID
	}
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "distinct_id (or user_id/device_id) required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	raw, err := h.rdb.Get(ctx, "flags:"+projectID).Result()
	if err != nil {
		return c.JSON(fiber.Map{"flags": fiber.Map{}})
	}
	var defs []flagDef
	if sonic.Unmarshal([]byte(raw), &defs) != nil {
		return c.JSON(fiber.Map{"flags": fiber.Map{}})
	}

	byKey, groups := indexFlags(defs)

	out := fiber.Map{}
	exposures := []interface{}{}
	for _, f := range defs {
		variant, on := evalVariant(f, id, body.UserProperties, byKey, groups, 0)
		if !on {
			continue
		}
		out[f.Key] = fiber.Map{"enabled": true, "variant": variant}
		exposures = append(exposures, validator.Event{
			EventType:  "$flag_exposure",
			UserID:     body.UserID,
			DeviceID:   firstNonEmpty(body.DeviceID, id),
			Properties: map[string]interface{}{"flag": f.Key, "variant": variant},
		})
	}

	if len(exposures) > 0 && h.producer != nil {
		// Independent context: exposure delivery must not be cut off when the
		// HTTP response is sent.
		pctx, pcancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer pcancel()
		_ = h.producer.SendBatch(pctx, projectID, exposures)
	}

	return c.JSON(fiber.Map{"flags": out})
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// GET /v1/flags/config — returns the project's flag definitions so SDKs can
// evaluate flags LOCALLY (no round-trip per call), using the same deterministic
// bucketing. api-key authenticated.
func (h *FlagEvalHandler) Config(c fiber.Ctx) error {
	projectID, _ := c.Locals("project_id").(string)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	raw, err := h.rdb.Get(ctx, "flags:"+projectID).Result()
	if err != nil || raw == "" {
		return c.JSON(fiber.Map{"flags": []any{}})
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(`{"flags":` + raw + `}`)
}

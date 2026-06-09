package handler

import (
	"context"
	"math"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/inspectuser/query/internal/stats"
	"github.com/bytedance/sonic"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type FlagHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	ch  clickhouse.Conn
	log *zap.Logger
}

func NewFlagHandler(db *pgxpool.Pool, rdb *redis.Client, ch clickhouse.Conn, log *zap.Logger) *FlagHandler {
	return &FlagHandler{db: db, rdb: rdb, ch: ch, log: log}
}

type flagVariant struct {
	Key    string `json:"key"`
	Weight int    `json:"weight"`
}

type targetRule struct {
	Property string `json:"property"`
	Operator string `json:"operator"` // is | is_not | contains
	Value    string `json:"value"`
	Variant  string `json:"variant"`
}

// flagDef is the compact shape cached in Redis for the ingestion evaluator.
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

// seedFlags rewrites the project's full flag set into Redis so the ingestion
// service can evaluate them without touching Postgres.
func (h *FlagHandler) seedFlags(ctx context.Context, projectID string) {
	rows, err := h.db.Query(ctx, `SELECT key, enabled, rollout, COALESCE(holdout,0), variants,
		COALESCE(targeting,'[]'), COALESCE(exclusion_group,''), COALESCE(prereq_flag,''), COALESCE(prereq_variant,'')
		FROM feature_flags WHERE project_id = $1`, projectID)
	if err != nil {
		return
	}
	defer rows.Close()
	defs := []flagDef{}
	for rows.Next() {
		var d flagDef
		var variantsJSON, targetingJSON string
		if rows.Scan(&d.Key, &d.Enabled, &d.Rollout, &d.Holdout, &variantsJSON,
			&targetingJSON, &d.ExclusionGroup, &d.PrereqFlag, &d.PrereqVariant) != nil {
			continue
		}
		_ = sonic.Unmarshal([]byte(variantsJSON), &d.Variants)
		_ = sonic.Unmarshal([]byte(targetingJSON), &d.Targeting)
		defs = append(defs, d)
	}
	data, _ := sonic.Marshal(defs)
	h.rdb.Set(ctx, "flags:"+projectID, string(data), 0)
}

// GET /v1/projects/:id/flags
func (h *FlagHandler) List(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, key, name, COALESCE(description,''), enabled, rollout, COALESCE(holdout,0), variants, COALESCE(goal_event,''),
			COALESCE(targeting,'[]'), COALESCE(exclusion_group,''), COALESCE(prereq_flag,''), COALESCE(prereq_variant,''), created_at
		FROM feature_flags WHERE project_id = $1 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, key, name, desc, variantsJSON, goal, targetingJSON, exclGroup, prereqFlag, prereqVariant string
		var enabled bool
		var rollout, holdout int
		var createdAt time.Time
		if rows.Scan(&id, &key, &name, &desc, &enabled, &rollout, &holdout, &variantsJSON, &goal,
			&targetingJSON, &exclGroup, &prereqFlag, &prereqVariant, &createdAt) != nil {
			continue
		}
		var variants []flagVariant
		var targeting []targetRule
		_ = sonic.Unmarshal([]byte(variantsJSON), &variants)
		_ = sonic.Unmarshal([]byte(targetingJSON), &targeting)
		out = append(out, fiber.Map{
			"id": id, "key": key, "name": name, "description": desc, "enabled": enabled,
			"rollout": rollout, "holdout": holdout, "variants": variants, "goal_event": goal,
			"targeting": targeting, "exclusion_group": exclGroup, "prereq_flag": prereqFlag, "prereq_variant": prereqVariant,
			"created_at": createdAt,
		})
	}
	return c.JSON(fiber.Map{"flags": out})
}

type flagBody struct {
	Key            string        `json:"key"`
	Name           string        `json:"name"`
	Desc           string        `json:"description"`
	Enabled        *bool         `json:"enabled"`
	Rollout        int           `json:"rollout"`
	Holdout        int           `json:"holdout"`
	Variants       []flagVariant `json:"variants"`
	GoalEvent      string        `json:"goal_event"`
	Targeting      []targetRule  `json:"targeting"`
	ExclusionGroup string        `json:"exclusion_group"`
	PrereqFlag     string        `json:"prereq_flag"`
	PrereqVariant  string        `json:"prereq_variant"`
}

func (b *flagBody) normalize() {
	if b.Rollout < 0 || b.Rollout > 100 {
		b.Rollout = 100
	}
	if b.Holdout < 0 || b.Holdout > 100 {
		b.Holdout = 0
	}
	if len(b.Variants) == 0 {
		b.Variants = []flagVariant{{Key: "control", Weight: 50}, {Key: "treatment", Weight: 50}}
	}
}

// POST /v1/projects/:id/flags
func (h *FlagHandler) Create(c fiber.Ctx) error {
	projectID := c.Params("id")
	var b flagBody
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	if b.Key == "" || b.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key and name are required"})
	}
	b.normalize()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	variantsJSON, _ := sonic.Marshal(b.Variants)
	targetingJSON, _ := sonic.Marshal(b.Targeting)
	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO feature_flags (project_id, key, name, description, rollout, holdout, variants, goal_event, targeting, exclusion_group, prereq_flag, prereq_variant)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id
	`, projectID, b.Key, b.Name, b.Desc, b.Rollout, b.Holdout, string(variantsJSON), b.GoalEvent,
		string(targetingJSON), b.ExclusionGroup, b.PrereqFlag, b.PrereqVariant).Scan(&id)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "a flag with that key already exists"})
	}
	h.seedFlags(ctx, projectID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// PUT /v1/projects/:id/flags/:flagId
func (h *FlagHandler) Update(c fiber.Ctx) error {
	projectID := c.Params("id")
	flagID := c.Params("flagId")
	var b flagBody
	if err := c.Bind().JSON(&b); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": errInvalidJSON})
	}
	b.normalize()
	enabled := true
	if b.Enabled != nil {
		enabled = *b.Enabled
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	variantsJSON, _ := sonic.Marshal(b.Variants)
	targetingJSON, _ := sonic.Marshal(b.Targeting)
	tag, err := h.db.Exec(ctx, `
		UPDATE feature_flags SET name=$1, description=$2, enabled=$3, rollout=$4, holdout=$5, variants=$6, goal_event=$7,
			targeting=$8, exclusion_group=$9, prereq_flag=$10, prereq_variant=$11, updated_at=NOW()
		WHERE id=$12 AND project_id=$13
	`, b.Name, b.Desc, enabled, b.Rollout, b.Holdout, string(variantsJSON), b.GoalEvent,
		string(targetingJSON), b.ExclusionGroup, b.PrereqFlag, b.PrereqVariant, flagID, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "flag not found"})
	}
	h.seedFlags(ctx, projectID)
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /v1/projects/:id/flags/:flagId
func (h *FlagHandler) Delete(c fiber.Ctx) error {
	projectID := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := h.db.Exec(ctx, `DELETE FROM feature_flags WHERE id=$1 AND project_id=$2`, c.Params("flagId"), projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	h.seedFlags(ctx, projectID)
	return c.JSON(fiber.Map{"deleted": true})
}

// GET /v1/projects/:id/flags/:flagId/results?goal=<event>
// Experiment analysis: per-variant exposure, conversion to the goal event, rate,
// lift vs control, and a two-proportion z-test significance flag.
func (h *FlagHandler) Results(c fiber.Ctx) error {
	projectID := c.Params("id")
	flagID := c.Params("flagId")
	ctx := c.Context()

	// Resolve the flag's key + default goal.
	var flagKey, goalDefault string
	pctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if h.db.QueryRow(pctx, `SELECT key, COALESCE(goal_event,'') FROM feature_flags WHERE id=$1 AND project_id=$2`, flagID, projectID).
		Scan(&flagKey, &goalDefault) != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "flag not found"})
	}
	goal := c.Query("goal", goalDefault)

	// Each exposed user → the variant they were first assigned.
	expo := map[string]string{} // identity -> variant
	rows, err := h.ch.Query(ctx, `
		SELECT id, argMin(v, t) FROM (
			SELECT `+identityExpr+` AS id, JSONExtractString(properties,'variant') AS v, event_time AS t
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = '$flag_exposure' AND JSONExtractString(properties,'flag') = ?
		) GROUP BY id
	`, projectID, flagKey)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, v string
			if rows.Scan(&id, &v) == nil {
				expo[id] = v
			}
		}
	}

	// Goal-event doers.
	goalSet := map[string]bool{}
	if goal != "" {
		grows, gerr := h.ch.Query(ctx, `
			SELECT DISTINCT `+identityExpr+` AS id FROM inspectuser.events WHERE project_id = ? AND event_type = ?
		`, projectID, goal)
		if gerr == nil {
			defer grows.Close()
			for grows.Next() {
				var id string
				if grows.Scan(&id) == nil {
					goalSet[id] = true
				}
			}
		}
	}

	// Guardrail metric — a second event that should NOT regress in treatment
	// (e.g. "Error", "Unsubscribe"). Optional ?guardrail=<event>.
	guardrail := c.Query("guardrail", "")
	// Minimum detectable effect (relative) for the A-PRIORI sample-size target —
	// "how many users to reliably detect an X% lift on the control rate". Default 5%.
	mde := 0.05
	if m, err := strconv.ParseFloat(c.Query("mde", ""), 64); err == nil && m > 0 && m < 10 {
		mde = m
	}
	guardSet := map[string]bool{}
	if guardrail != "" {
		if grows, gerr := h.ch.Query(ctx, `SELECT DISTINCT `+identityExpr+` AS id FROM inspectuser.events WHERE project_id = ? AND event_type = ?`, projectID, guardrail); gerr == nil {
			for grows.Next() {
				var id string
				if grows.Scan(&id) == nil {
					guardSet[id] = true
				}
			}
			grows.Close()
		}
	}

	// Tally per variant.
	type agg struct{ exposed, converted, guard int }
	tally := map[string]*agg{}
	for id, v := range expo {
		a := tally[v]
		if a == nil {
			a = &agg{}
			tally[v] = a
		}
		a.exposed++
		if goalSet[id] {
			a.converted++
		}
		if guardSet[id] {
			a.guard++
		}
	}

	// Control = "control" variant if present, else the largest-exposure variant.
	control := "control"
	if _, ok := tally[control]; !ok {
		best := 0
		for v, a := range tally {
			if a.exposed > best {
				best, control = a.exposed, v
			}
		}
	}
	ctrlRate, ctrlA := 0.0, tally[control]
	if ctrlA != nil && ctrlA.exposed > 0 {
		ctrlRate = float64(ctrlA.converted) / float64(ctrlA.exposed)
	}

	// ── CUPED variance reduction ────────────────────────────────────────────
	// Covariate X = each user's event count strictly BEFORE *their own* first
	// exposure to this flag. Using each user's personal exposure time (not a
	// single global cutoff) is essential: a global cutoff would count a
	// late-exposed user's in-experiment activity as "pre-experiment", leaking the
	// treatment effect into the covariate. Adjust Y' = Y − θ(X − X̄).
	cov := map[string]float64{}
	if crows, err := h.ch.Query(ctx, `
		SELECT e.id AS id, toFloat64(count()) AS x
		FROM (
			SELECT `+identityExpr+` AS id, event_time AS t
			FROM inspectuser.events WHERE project_id = ?
		) e
		INNER JOIN (
			SELECT `+identityExpr+` AS id, min(event_time) AS first_exp
			FROM inspectuser.events
			WHERE project_id = ? AND event_type = '$flag_exposure' AND JSONExtractString(properties,'flag') = ?
			GROUP BY id
		) fx ON e.id = fx.id
		WHERE e.t < fx.first_exp
		GROUP BY e.id
	`, projectID, projectID, flagKey); err == nil {
		for crows.Next() {
			var id string
			var x float64
			if crows.Scan(&id, &x) == nil {
				cov[id] = x
			}
		}
		crows.Close()
	}
	cupedRate := map[string]float64{}
	cupedVR := map[string]float64{} // per-arm variance reduction
	varianceReduction := 0.0
	{
		type yx struct {
			y, x    float64
			variant string
		}
		data := make([]yx, 0, len(expo))
		var sumX, sumY, n float64
		for id, variant := range expo {
			y := 0.0
			if goalSet[id] {
				y = 1
			}
			data = append(data, yx{y, cov[id], variant})
			sumX += cov[id]
			sumY += y
			n++
		}
		if n > 1 {
			mX := sumX / n
			mYall := sumY / n
			// θ is estimated on the pooled covariate (a single θ is standard CUPED).
			var sxy, sxx float64
			for _, d := range data {
				sxy += (d.x - mX) * (d.y - mYall)
				sxx += (d.x - mX) * (d.x - mX)
			}
			theta := 0.0
			if sxx > 0 {
				theta = sxy / sxx
			}
			// Variance reduction is computed PER ARM, removing each arm's own mean
			// — pooling arms that differ in mean inflates the variance and
			// over-states the reduction.
			type acc struct {
				ys, adjs []float64
				sumY     float64
			}
			byArm := map[string]*acc{}
			for _, d := range data {
				adj := d.y - theta*(d.x-mX)
				a := byArm[d.variant]
				if a == nil {
					a = &acc{}
					byArm[d.variant] = a
				}
				a.ys = append(a.ys, d.y)
				a.adjs = append(a.adjs, adj)
				a.sumY += d.y
			}
			var totVR, totN float64
			for v, a := range byArm {
				m := float64(len(a.ys))
				if m < 2 {
					continue
				}
				mY := a.sumY / m
				var sumAdj float64
				for _, x := range a.adjs {
					sumAdj += x
				}
				mAdj := sumAdj / m
				cupedRate[v] = mAdj // CUPED-adjusted conversion rate
				var vy, vadj float64
				for i := range a.ys {
					vy += (a.ys[i] - mY) * (a.ys[i] - mY)
					vadj += (a.adjs[i] - mAdj) * (a.adjs[i] - mAdj)
				}
				if vy > 0 {
					cupedVR[v] = 1 - vadj/vy
					totVR += cupedVR[v] * m
					totN += m
				}
			}
			if totN > 0 {
				varianceReduction = totVR / totN // exposure-weighted overall
			}
		}
	}

	variants := []fiber.Map{}
	for v, a := range tally {
		rate := 0.0
		if a.exposed > 0 {
			rate = float64(a.converted) / float64(a.exposed)
		}
		lift := 0.0
		if ctrlRate > 0 {
			lift = (rate - ctrlRate) / ctrlRate
		}
		z := 0.0
		probBeat := 0.0
		if ctrlA != nil && a != ctrlA {
			z = zTest(ctrlA.exposed, ctrlA.converted, a.exposed, a.converted)
			probBeat = probBeatControl(ctrlA.exposed, ctrlA.converted, a.exposed, a.converted)
		}
		ciLow, ciHigh := credibleInterval(a.exposed, a.converted)
		// Sequential decision: the Bayesian posterior is valid under continuous
		// monitoring (unlike the fixed-horizon z-test), so use it as the
		// peeking-safe "ship it" call.
		seqSig := v != control && (probBeat >= 0.95 || probBeat <= 0.05)
		// A-priori sample size: users-per-arm to detect a `mde` relative lift on the
		// control rate at 95%/80% — independent of the observed effect, so
		// sample_reached is a real "are we powered yet?" check.
		sampleN := requiredSampleSize(ctrlRate, ctrlRate*(1+mde))
		// Guardrail regression: treatment's guardrail rate significantly ABOVE control.
		guardRate := 0.0
		if a.exposed > 0 {
			guardRate = float64(a.guard) / float64(a.exposed)
		}
		guardReg := false
		if guardrail != "" && v != control && ctrlA != nil {
			gz := zTest(ctrlA.exposed, ctrlA.guard, a.exposed, a.guard)
			guardReg = gz >= 1.96 // treatment guardrail event significantly higher = bad
		}
		variants = append(variants, fiber.Map{
			"variant": v, "exposed": a.exposed, "converted": a.converted, "rate": rate,
			"is_control": v == control, "lift": lift, "z": z, "significant": math.Abs(z) >= 1.96,
			"prob_beat_control": probBeat, "ci_low": ciLow, "ci_high": ciHigh,
			"cuped_rate":              cupedRate[v],
			"cuped_variance_reduction": cupedVR[v],
			"sequential_significant":  seqSig,
			"sample_size":             sampleN,
			"sample_reached":         sampleN > 0 && a.exposed >= sampleN,
			"guardrail_rate":         guardRate,
			"guardrail_regression":   guardReg,
		})
	}

	return c.JSON(fiber.Map{
		"flag_key": flagKey, "goal": goal, "guardrail": guardrail, "control": control, "variants": variants,
		"variance_reduction": varianceReduction,
	})
}

// requiredSampleSize is the per-variant n to detect p2 vs p1 at 95% confidence /
// 80% power (two-proportion). Returns 0 if there's no detectable effect.
func requiredSampleSize(p1, p2 float64) int {
	if p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1 || p1 == p2 {
		return 0
	}
	const zA, zB = 1.96, 0.84
	num := (zA + zB) * (zA + zB) * (p1*(1-p1) + p2*(1-p2))
	den := (p2 - p1) * (p2 - p1)
	return int(math.Ceil(num / den))
}

// probBeatControl returns the EXACT P(variant rate > control rate) under
// Beta(conv+1, nonconv+1) posteriors (uniform prior) via Evan Miller's closed
// form — peeking-safe and accurate even at small n / extreme rates, unlike the
// old normal approximation.
func probBeatControl(cExp, cConv, vExp, vConv int) float64 {
	aC, bC := float64(cConv+1), float64(cExp-cConv+1)
	aV, bV := float64(vConv+1), float64(vExp-vConv+1)
	return stats.ProbBGreaterA(aC, bC, aV, bV)
}

// credibleInterval returns the EXACT 95% Bayesian credible interval (Beta
// quantiles, not a normal approximation).
func credibleInterval(exp, conv int) (low, high float64) {
	a, b := float64(conv+1), float64(exp-conv+1)
	return stats.BetaQuantile(0.025, a, b), stats.BetaQuantile(0.975, a, b)
}

// zTest computes a two-proportion z statistic between control and a variant.
func zTest(cExp, cConv, vExp, vConv int) float64 {
	if cExp == 0 || vExp == 0 {
		return 0
	}
	p1 := float64(cConv) / float64(cExp)
	p2 := float64(vConv) / float64(vExp)
	p := float64(cConv+vConv) / float64(cExp+vExp)
	se := math.Sqrt(p * (1 - p) * (1/float64(cExp) + 1/float64(vExp)))
	if se == 0 {
		return 0
	}
	return (p2 - p1) / se
}

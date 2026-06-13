package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ShopifyHandler implements the Shopify App: OAuth install, auto-provisioning of
// an InspectUser project per store, and activation of the Web Pixel that streams
// storefront/checkout events into our ingestion API. No theme edits required.
//
// Flow:
//
//	GET /shopify/install?shop=acme.myshopify.com   → redirect to Shopify consent
//	GET /shopify/callback?code=&shop=&hmac=&state=  → verify, exchange, provision,
//	                                                  activate pixel, → dashboard
//	POST /shopify/webhooks/...                       → uninstall + mandatory GDPR
type ShopifyHandler struct {
	db        *pgxpool.Pool
	rdb       *redis.Client
	jwtSecret string
	apiKey    string // Shopify app API key (client_id)
	apiSecret string // Shopify app secret (client_secret + HMAC key)
	scopes    string // e.g. "read_orders,write_pixels,read_customer_events"
	appURL    string // dashboard origin (final redirect)
	apiURL    string // this service's public origin (OAuth redirect_uri base)
	ingestURL string // ingestion API origin the pixel posts events to
	log       *zap.Logger
	http      *http.Client
}

func NewShopifyHandler(db *pgxpool.Pool, rdb *redis.Client, jwtSecret, apiKey, apiSecret, scopes, appURL, apiURL, ingestURL string, log *zap.Logger) *ShopifyHandler {
	return &ShopifyHandler{
		db: db, rdb: rdb, jwtSecret: jwtSecret,
		apiKey: apiKey, apiSecret: apiSecret, scopes: scopes,
		appURL: appURL, apiURL: apiURL, ingestURL: ingestURL, log: log,
		http: &http.Client{Timeout: 15 * time.Second},
	}
}

// Configured reports whether the Shopify app credentials are present.
func (h *ShopifyHandler) Configured() bool { return h.apiKey != "" && h.apiSecret != "" }

const shopifyAPIVersion = "2024-10"

var shopRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`)

func validShop(shop string) bool { return shopRe.MatchString(shop) }

// ---- OAuth ------------------------------------------------------------------

// Install starts the OAuth grant: GET /shopify/install?shop=acme.myshopify.com
func (h *ShopifyHandler) Install(c fiber.Ctx) error {
	shop := strings.ToLower(c.Query("shop"))
	if !validShop(shop) {
		return c.Status(fiber.StatusBadRequest).SendString("invalid ?shop")
	}
	state := genKey(16)
	h.rdb.Set(c.Context(), "shopify_state:"+state, shop, 10*time.Minute)
	authURL := fmt.Sprintf(
		"https://%s/admin/oauth/authorize?client_id=%s&scope=%s&redirect_uri=%s&state=%s",
		shop, url.QueryEscape(h.apiKey), url.QueryEscape(h.scopes),
		url.QueryEscape(h.apiURL+"/shopify/callback"), url.QueryEscape(state),
	)
	return c.Redirect().To(authURL)
}

// Callback completes the grant: verify HMAC + state, exchange the code for an
// access token, provision the project, activate the pixel, and land the merchant
// on the dashboard.
func (h *ShopifyHandler) Callback(c fiber.Ctx) error {
	ctx := c.Context()
	shop := strings.ToLower(c.Query("shop"))
	code := c.Query("code")
	state := c.Query("state")
	if !validShop(shop) || code == "" {
		return c.Status(fiber.StatusBadRequest).SendString("invalid request")
	}
	stateVal, _ := h.rdb.Get(ctx, "shopify_state:"+state).Result()
	parts := strings.Split(stateVal, "|")
	if state == "" || parts[0] != shop {
		return c.Status(fiber.StatusForbidden).SendString("bad state")
	}
	h.rdb.Del(ctx, "shopify_state:"+state)
	if !h.verifyQueryHMAC(c) {
		return c.Status(fiber.StatusForbidden).SendString("bad hmac")
	}

	token, err := h.exchangeToken(ctx, shop, code)
	if err != nil {
		h.log.Error("shopify token exchange failed", zap.String("shop", shop), zap.Error(err))
		return c.Status(fiber.StatusBadGateway).SendString("token exchange failed")
	}

	// A dashboard "Connect" carries org|project in the state → link to it.
	var linkOrg, linkProject string
	if len(parts) >= 3 {
		linkOrg, linkProject = parts[1], parts[2]
	}
	apiKey, err := h.provision(ctx, shop, token, linkOrg, linkProject)
	if err != nil {
		h.log.Error("shopify provision failed", zap.String("shop", shop), zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).SendString("provisioning failed")
	}

	// Best-effort: activate the Web Pixel with this project's ingest key.
	if err := h.activatePixel(ctx, shop, token, apiKey); err != nil {
		h.log.Warn("shopify pixel activation failed", zap.String("shop", shop), zap.Error(err))
	}

	return c.Redirect().To(h.appURL + "/overview?shopify=connected")
}

func (h *ShopifyHandler) exchangeToken(ctx context.Context, shop, code string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"client_id":     h.apiKey,
		"client_secret": h.apiSecret,
		"code":          code,
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+shop+"/admin/oauth/access_token", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("empty access token")
	}
	return out.AccessToken, nil
}

// ---- Provisioning -----------------------------------------------------------

// provision returns the project's publishable api key for the store. When
// linkProject is set (the dashboard "Connect" flow) the store is attached to that
// existing project; otherwise (App Store install) an org + owner + project are
// created, reusing them on re-install. Idempotent on `shop`.
func (h *ShopifyHandler) provision(ctx context.Context, shop, token, linkOrg, linkProject string) (string, error) {
	// Dashboard "Connect" flow: attach the store to the user's existing project.
	if linkProject != "" {
		var apiKey string
		if err := h.db.QueryRow(ctx, `SELECT api_key FROM projects WHERE id = $1`, linkProject).Scan(&apiKey); err != nil {
			return "", fmt.Errorf("link project: %w", err)
		}
		h.rdb.Set(ctx, "apikey:"+apiKey, linkProject, 0)
		_, err := h.db.Exec(ctx,
			`INSERT INTO shopify_installs (shop, org_id, project_id, access_token) VALUES ($1,$2,$3,$4)
			 ON CONFLICT (shop) DO UPDATE SET org_id=EXCLUDED.org_id, project_id=EXCLUDED.project_id, access_token=EXCLUDED.access_token, installed_at=now(), uninstalled_at=NULL`,
			shop, linkOrg, linkProject, token)
		return apiKey, err
	}

	// Re-install: reuse the existing project, refresh the token, re-seed Redis.
	var apiKey, projectID string
	err := h.db.QueryRow(ctx,
		`SELECT p.id::text, p.api_key FROM shopify_installs s JOIN projects p ON p.id = s.project_id WHERE s.shop = $1`,
		shop,
	).Scan(&projectID, &apiKey)
	if err == nil && apiKey != "" {
		h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0)
		_, _ = h.db.Exec(ctx, `UPDATE shopify_installs SET access_token=$2, installed_at=now(), uninstalled_at=NULL WHERE shop=$1`, shop, token)
		return apiKey, nil
	}

	name := strings.TrimSuffix(shop, ".myshopify.com")
	slug := fmt.Sprintf("shopify-%s-%s", name, genKey(3))

	var orgID string
	if err := h.db.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ($1,$2) RETURNING id::text`, name, slug).Scan(&orgID); err != nil {
		return "", fmt.Errorf("create org: %w", err)
	}
	// The myshopify domain is globally unique → safe as the owner's email.
	var userID string
	if err := h.db.QueryRow(ctx,
		`INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,'','owner') RETURNING id::text`,
		orgID, shop, name,
	).Scan(&userID); err != nil {
		return "", fmt.Errorf("create user: %w", err)
	}

	apiKey = "amp_" + genKey(32)
	secretKey := "amp_secret_" + genKey(32)
	if err := h.db.QueryRow(ctx,
		`INSERT INTO projects (org_id, name, api_key, secret_key) VALUES ($1,$2,$3,$4) RETURNING id::text`,
		orgID, name+" (Shopify)", apiKey, secretKey,
	).Scan(&projectID); err != nil {
		return "", fmt.Errorf("create project: %w", err)
	}

	// Seed ingestion auth exactly like Signup does.
	h.rdb.Set(ctx, "apikey:"+apiKey, projectID, 0)
	h.rdb.Set(ctx, "projorg:"+projectID, orgID, time.Hour)
	h.rdb.Set(ctx, "usage:limit:"+projectID, 0, 0)

	_, err = h.db.Exec(ctx,
		`INSERT INTO shopify_installs (shop, org_id, project_id, access_token)
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT (shop) DO UPDATE SET access_token=EXCLUDED.access_token, installed_at=now(), uninstalled_at=NULL`,
		shop, orgID, projectID, token,
	)
	return apiKey, err
}

// ---- Web Pixel --------------------------------------------------------------

// activatePixel creates or updates the app's Web Pixel on the store, handing it
// this project's ingest key + URL via the pixel `settings`. Idempotent —
// re-connecting re-points the existing pixel (e.g. to a new ingest URL).
func (h *ShopifyHandler) activatePixel(ctx context.Context, shop, token, projectAPIKey string) error {
	settings, _ := json.Marshal(map[string]string{"apiKey": projectAPIKey, "ingestUrl": h.ingestURL})

	// An app has at most one web pixel per shop — look it up first.
	probeReq, _ := json.Marshal(map[string]any{"query": `{ webPixel { id } }`})
	body, err := h.adminGraphQL(ctx, shop, token, probeReq)
	if err != nil {
		return err
	}
	var probe struct {
		Data struct {
			WebPixel *struct {
				ID string `json:"id"`
			} `json:"webPixel"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &probe)

	var payload []byte
	if probe.Data.WebPixel != nil && probe.Data.WebPixel.ID != "" {
		payload, _ = json.Marshal(map[string]any{
			"query":     `mutation($id: ID!, $s: JSON!){ webPixelUpdate(id:$id, webPixel:{settings:$s}){ userErrors{ field message } webPixel{ id } } }`,
			"variables": map[string]any{"id": probe.Data.WebPixel.ID, "s": string(settings)},
		})
	} else {
		payload, _ = json.Marshal(map[string]any{
			"query":     `mutation($s: JSON!){ webPixelCreate(webPixel:{settings:$s}){ userErrors{ field message } webPixel{ id } } }`,
			"variables": map[string]any{"s": string(settings)},
		})
	}
	_, err = h.adminGraphQL(ctx, shop, token, payload)
	return err
}

// ---- Theme app embed auto-config -------------------------------------------

// Config (GET /shopify/config?shop=acme.myshopify.com) returns the store's
// ingest key + ingest/replay URLs so the theme app embed needs zero manual key
// entry — inspectuser.js fetches this on load and inits itself. Public + CORS-
// open: the api_key is a publishable (write-only) ingest key, already visible in
// the storefront once the embed runs, so serving it by shop domain is the same
// exposure as any client-side analytics token. App-owned shop metafields can't
// be used for this since Shopify made them private to the app in May 2025.
func (h *ShopifyHandler) Config(c fiber.Ctx) error {
	c.Set("Access-Control-Allow-Origin", "*")
	shop := strings.ToLower(c.Query("shop"))
	if !validShop(shop) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid shop"})
	}
	var apiKey string
	err := h.db.QueryRow(c.Context(),
		`SELECT p.api_key FROM shopify_installs s JOIN projects p ON p.id = s.project_id
		 WHERE s.shop=$1 AND s.uninstalled_at IS NULL`, shop,
	).Scan(&apiKey)
	if err != nil || apiKey == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not installed"})
	}
	return c.JSON(fiber.Map{
		"api_key":    apiKey,
		"ingest_url": h.ingestURL,
		"replay_url": h.apiURL,
	})
}

func (h *ShopifyHandler) adminGraphQL(ctx context.Context, shop, token string, payload []byte) ([]byte, error) {
	endpoint := fmt.Sprintf("https://%s/admin/api/%s/graphql.json", shop, shopifyAPIVersion)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Shopify-Access-Token", token)
	resp, err := h.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return b, fmt.Errorf("graphql status %d: %s", resp.StatusCode, string(b))
	}
	// Surface non-empty mutation userErrors.
	if bytes.Contains(b, []byte(`"userErrors"`)) && !bytes.Contains(b, []byte(`"userErrors":[]`)) {
		return b, fmt.Errorf("graphql userErrors: %s", string(b))
	}
	return b, nil
}

// ---- Webhooks (mandatory compliance + uninstall) ----------------------------

// WebhookUninstalled — app/uninstalled: revoke ingest + mark the row.
func (h *ShopifyHandler) WebhookUninstalled(c fiber.Ctx) error {
	if !h.verifyWebhook(c) {
		return c.SendStatus(fiber.StatusUnauthorized)
	}
	shop := c.Get("X-Shopify-Shop-Domain")
	var apiKey string
	_ = h.db.QueryRow(c.Context(),
		`SELECT p.api_key FROM shopify_installs s JOIN projects p ON p.id = s.project_id WHERE s.shop=$1`, shop,
	).Scan(&apiKey)
	_, _ = h.db.Exec(c.Context(), `UPDATE shopify_installs SET uninstalled_at=now(), access_token='' WHERE shop=$1`, shop)
	if apiKey != "" {
		h.rdb.Del(c.Context(), "apikey:"+apiKey) // stop accepting events
	}
	return c.SendStatus(fiber.StatusOK)
}

// WebhookGDPR — customers/data_request, customers/redact, shop/redact. We hold no
// customer PII beyond events keyed by Shopify ids, so we acknowledge (and could
// enqueue a redaction job here). Required to pass App Store review.
func (h *ShopifyHandler) WebhookGDPR(c fiber.Ctx) error {
	if !h.verifyWebhook(c) {
		return c.SendStatus(fiber.StatusUnauthorized)
	}
	h.log.Info("shopify gdpr webhook", zap.String("topic", c.Get("X-Shopify-Topic")), zap.String("shop", c.Get("X-Shopify-Shop-Domain")))
	return c.SendStatus(fiber.StatusOK)
}

// ---- Signature verification -------------------------------------------------

// verifyQueryHMAC validates the `hmac` on the OAuth callback query string.
func (h *ShopifyHandler) verifyQueryHMAC(c fiber.Ctx) bool {
	got := c.Query("hmac")
	if got == "" {
		return false
	}
	pairs := make([]string, 0, 8)
	for k, v := range c.Queries() {
		if k == "hmac" || k == "signature" {
			continue
		}
		pairs = append(pairs, k+"="+v)
	}
	sort.Strings(pairs)
	mac := hmac.New(sha256.New, []byte(h.apiSecret))
	mac.Write([]byte(strings.Join(pairs, "&")))
	want := hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// verifyWebhook validates the X-Shopify-Hmac-Sha256 header against the raw body.
func (h *ShopifyHandler) verifyWebhook(c fiber.Ctx) bool {
	got := c.Get("X-Shopify-Hmac-Sha256")
	if got == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(h.apiSecret))
	mac.Write(c.Body())
	want := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(got), []byte(want))
}

// ---- Dashboard "Connect Shopify" (JWT) --------------------------------------

// ConnectURL (POST /v1/shopify/connect) returns the OAuth URL to attach a store
// to the caller's current project. The state carries org|project so the callback
// links the store to it instead of creating a fresh project.
func (h *ShopifyHandler) ConnectURL(c fiber.Ctx) error {
	if !h.Configured() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Shopify integration is not configured on the server"})
	}
	orgID, _ := c.Locals("org_id").(string)
	var body struct {
		Shop      string `json:"shop"`
		ProjectID string `json:"project_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	shop := strings.ToLower(strings.TrimSpace(body.Shop))
	if shop != "" && !strings.Contains(shop, ".") {
		shop += ".myshopify.com" // allow entering just the store handle
	}
	if !validShop(shop) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "enter a valid myshopify.com domain"})
	}
	var ok bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND org_id=$2)`, body.ProjectID, orgID).Scan(&ok); err != nil || !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "unknown project"})
	}
	state := genKey(16)
	h.rdb.Set(c.Context(), "shopify_state:"+state, shop+"|"+orgID+"|"+body.ProjectID, 10*time.Minute)
	authURL := fmt.Sprintf(
		"https://%s/admin/oauth/authorize?client_id=%s&scope=%s&redirect_uri=%s&state=%s",
		shop, url.QueryEscape(h.apiKey), url.QueryEscape(h.scopes),
		url.QueryEscape(h.apiURL+"/shopify/callback"), url.QueryEscape(state),
	)
	return c.JSON(fiber.Map{"url": authURL})
}

// Connections (GET /v1/shopify/connections) lists the stores linked to the
// caller's org.
func (h *ShopifyHandler) Connections(c fiber.Ctx) error {
	orgID, _ := c.Locals("org_id").(string)
	rows, err := h.db.Query(c.Context(),
		`SELECT s.shop, p.id::text, p.name, s.installed_at, s.uninstalled_at
		   FROM shopify_installs s JOIN projects p ON p.id = s.project_id
		  WHERE s.org_id = $1 ORDER BY s.installed_at DESC`, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "query failed"})
	}
	defer rows.Close()
	type conn struct {
		Shop          string     `json:"shop"`
		ProjectID     string     `json:"project_id"`
		ProjectName   string     `json:"project_name"`
		InstalledAt   time.Time  `json:"installed_at"`
		UninstalledAt *time.Time `json:"uninstalled_at"`
		Connected     bool       `json:"connected"`
	}
	out := []conn{}
	for rows.Next() {
		var x conn
		if err := rows.Scan(&x.Shop, &x.ProjectID, &x.ProjectName, &x.InstalledAt, &x.UninstalledAt); err != nil {
			continue
		}
		x.Connected = x.UninstalledAt == nil
		out = append(out, x)
	}
	return c.JSON(fiber.Map{"connections": out, "configured": h.Configured()})
}

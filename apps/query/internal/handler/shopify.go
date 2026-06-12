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
	if want, _ := h.rdb.Get(ctx, "shopify_state:"+state).Result(); state == "" || want != shop {
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

	apiKey, err := h.provision(ctx, shop, token)
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

// provision creates (or, on re-install, reuses) an org + owner + project for the
// store and returns the project's publishable api key. Idempotent on `shop`.
func (h *ShopifyHandler) provision(ctx context.Context, shop, token string) (string, error) {
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

// activatePixel creates the app's Web Pixel on the store, handing it this
// project's ingest key + URL via the pixel `settings`.
func (h *ShopifyHandler) activatePixel(ctx context.Context, shop, token, projectAPIKey string) error {
	settings, _ := json.Marshal(map[string]string{"apiKey": projectAPIKey, "ingestUrl": h.ingestURL})
	payload, _ := json.Marshal(map[string]any{
		"query":     `mutation($s: JSON!){ webPixelCreate(webPixel:{settings:$s}){ userErrors{ field message } webPixel{ id } } }`,
		"variables": map[string]any{"s": string(settings)},
	})
	return h.adminGraphQL(ctx, shop, token, payload)
}

func (h *ShopifyHandler) adminGraphQL(ctx context.Context, shop, token string, payload []byte) error {
	endpoint := fmt.Sprintf("https://%s/admin/api/%s/graphql.json", shop, shopifyAPIVersion)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Shopify-Access-Token", token)
	resp, err := h.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("graphql status %d: %s", resp.StatusCode, string(b))
	}
	if bytes.Contains(b, []byte(`"message"`)) && bytes.Contains(b, []byte(`"userErrors"`)) && !bytes.Contains(b, []byte(`"userErrors":[]`)) {
		return fmt.Errorf("graphql userErrors: %s", string(b))
	}
	return nil
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

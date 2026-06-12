# InspectUser — Shopify App

One-click install that auto-provisions an InspectUser project for a store and
streams its storefront/checkout events (funnel + revenue) with **no theme edits**,
via a Shopify **Web Pixel**.

```
Merchant clicks Install
  → GET  api.inspectuser.com/shopify/install   (OAuth consent)
  → GET  api.inspectuser.com/shopify/callback   (verify HMAC + state, exchange code)
       → provision org + project + api key   (apps/query · ShopifyHandler.provision)
       → webPixelCreate{ settings:{ apiKey, ingestUrl } }   (activate the pixel)
  → redirect to the dashboard
Web Pixel (this dir) subscribes to events → POST ingest.inspectuser.com/v2/httpapi
```

The backend lives in **`apps/query/internal/handler/shopify.go`**; this folder is
just the Shopify CLI app + the Web Pixel extension.

## Backend env (infra/.env)

```
SHOPIFY_API_KEY=...          # Partner Dashboard → app → Client ID
SHOPIFY_API_SECRET=...       # Partner Dashboard → app → Client secret
SHOPIFY_SCOPES=read_orders,write_pixels,read_customer_events
INGEST_URL=https://ingest.inspectuser.com
API_URL=https://api.inspectuser.com
APP_URL=https://inspectuser.com
```

When `SHOPIFY_API_KEY` is empty the `/shopify/*` routes are simply not mounted.

## Develop the extension

```bash
npm i -g @shopify/cli @shopify/app
cd shopify
shopify app config link      # creates/links the app, fills client_id
shopify app dev              # runs the Web Pixel against a dev store
```

## Distribute

- **Unlisted (now):** `shopify app deploy`, then install via the generated link.
  No App Store review — good for the MVP / first merchants.
- **Public listing (later):** submit in the Partner Dashboard (perf budget, billing
  via the Billing API, and the privacy webhooks above are all required).

## What's MVP vs later

| | Status |
|---|---|
| OAuth install + auto-provision | ✅ scaffolded (`shopify.go`) |
| Web Pixel → funnel + revenue   | ✅ scaffolded (`extensions/web-pixel`) |
| Mandatory GDPR + uninstall webhooks | ✅ scaffolded (acknowledge/revoke) |
| Session replay (Theme App Extension) | ⏳ v2 — pixel sandbox can't run rrweb |
| Shopify Billing API | ⏳ v2 |
| Embedded admin UI | ⏳ v2 (v1 deep-links to the dashboard) |

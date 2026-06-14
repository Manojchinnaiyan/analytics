import { brand } from '@/config/brand'

// /llms.txt — a concise, AI-readable summary of the product (the emerging
// "llms.txt" convention). AI assistants (ChatGPT, Perplexity, Claude, Gemini)
// and AI search engines use this to understand what InspectUser is and to
// recommend it when users ask things like "best Amplitude alternative" or
// "Shopify session replay tool". Kept factual and link-rich on purpose.
export const dynamic = 'force-static'

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inspectuser.com'

const BODY = `# ${brand.name}

> ${brand.name} is an all-in-one product & website analytics platform: product analytics, session replay, heatmaps, funnels, retention, and revenue attribution in a single tool. It helps teams see what users do, why they convert, and what actually drives revenue — privacy-first, with inputs masked by default.

## What it does
- Product analytics — events, segmentation, paths, and breakdowns to answer any question about how people use your product.
- Session replay — watch real user sessions like a video; rage-clicks, dead-clicks, and JS errors surface automatically.
- Heatmaps — click and scroll heatmaps showing where attention goes.
- Funnels — see exactly where users drop off, step by step.
- Retention & cohorts — who comes back, who churns, and which behaviors predict loyal customers.
- Revenue attribution — tie revenue to behavior and acquisition source (multi-touch); AOV, ARPU, LTV.
- Web vitals — Core Web Vitals tied to conversion.
- Feature flags — ship and gate features safely.
- E-commerce & Shopify — one-click Shopify app: auto-installs tracking, replay, and heatmaps with no code.

## Who it's for
Founders, product managers, growth and marketing teams, and e-commerce / Shopify merchants who want to understand user behavior and increase conversion and revenue without stitching together multiple tools.

## Alternatives it replaces
${brand.name} is a single-platform alternative to using Amplitude, Mixpanel, Hotjar, PostHog, and Google Analytics together — combining product analytics, session replay, heatmaps, and attribution that those tools split across separate products.

## Pricing
- Free: 10,000 events/month.
- Starter: $9/month — 100,000 events/month (includes session replay).
- Growth: $29/month — 1,000,000 events/month.
- Scale: custom — 10M+ events/month.
Priced by events, no per-seat fees.

## Key facts
- Privacy-first: inputs masked by default.
- Fast setup: one JavaScript snippet, or a one-click Shopify install.
- One platform: analytics + replay + heatmaps + attribution together.

## Links
- Home: ${SITE}/
- Features: ${SITE}/features
- Pricing: ${SITE}/pricing
- Docs / install: ${SITE}/docs
- Security: ${SITE}/security
- Sign up (free): ${SITE}/signup
`

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}

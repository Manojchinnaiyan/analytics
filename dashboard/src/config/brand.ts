/**
 * Global brand configuration — single source of truth.
 *
 * Change the name/tagline here, or override at deploy time without touching code
 * via env vars:
 *   NEXT_PUBLIC_BRAND_NAME="Klyra"
 *   NEXT_PUBLIC_BRAND_TAGLINE="Clarity for every product decision."
 *   NEXT_PUBLIC_BRAND_SCOPE="@klyra"          # npm scope for SDK packages
 *
 * Everything in the UI (sidebar, login, signup, onboarding, page title,
 * account menu) AND the SDK install snippets read from this config.
 */
const name = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Klyra'
const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')

export const brand = {
  /** Product name shown everywhere in the UI. */
  name,

  /** Lowercase, URL/identifier-safe form. e.g. "klyra" */
  slug,

  /** Short tagline shown on auth screens. */
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'Clarity for every product decision.',

  /** One-line description used in the HTML <title> / meta. */
  description:
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION ?? 'Self-hosted product analytics platform',

  /** SDK naming — used in onboarding + settings install snippets. */
  sdk: {
    /** JS object used in code, e.g. `Klyra.track(...)`. */
    object: name,
    /** npm scope, e.g. "@klyra". */
    scope: process.env.NEXT_PUBLIC_BRAND_SCOPE ?? `@${slug}`,
    /** Full package names. */
    get browserPkg() { return `${this.scope}/browser` },
    get nodePkg()    { return `${this.scope}/node` },
  },
} as const

export type Brand = typeof brand

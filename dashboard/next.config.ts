import type { NextConfig } from 'next'

// Public marketing routes — safe to cache in shared/edge caches (Cloudflare),
// since they're identical for everyone. The authenticated dashboard is NOT
// listed and stays uncached. `s-maxage` targets the CDN; `stale-while-
// revalidate` serves a cached copy instantly while refreshing in the
// background. Pair with a Cloudflare Cache Rule to actually cache HTML at edge.
const PUBLIC_MARKETING_PATHS = [
  '/',
  '/about',
  '/blog',
  '/contact',
  '/docs',
  '/features',
  '/pricing',
  '/privacy',
  '/security',
  '/terms',
]

const MARKETING_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return PUBLIC_MARKETING_PATHS.map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: MARKETING_CACHE }],
    }))
  },
}

export default config

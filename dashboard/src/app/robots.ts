import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inspectuser.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep authenticated app sections out of the index.
      disallow: ['/overview', '/charts', '/funnels', '/retention', '/settings', '/users', '/sql', '/replay', '/onboarding', '/welcome'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}

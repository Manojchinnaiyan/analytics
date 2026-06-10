import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inspectuser.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ]
}

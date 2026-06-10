import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inspectuser.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const pages: [string, number][] = [
    ['', 1], ['/features', 0.9], ['/pricing', 0.9], ['/about', 0.6],
    ['/blog', 0.6], ['/contact', 0.5], ['/security', 0.5],
    ['/privacy', 0.3], ['/terms', 0.3], ['/signup', 0.6], ['/login', 0.4],
  ]
  return pages.map(([p, priority]) => ({
    url: `${SITE}${p}`, lastModified: now,
    changeFrequency: p === '' ? 'weekly' : 'monthly', priority,
  }))
}

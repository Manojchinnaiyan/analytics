'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Monitor, Smartphone, Tablet, Globe, FileText, Download, ExternalLink, Zap } from 'lucide-react'
import { countryFlag } from './Avatar'

// Simple Icons CDN slugs for the browsers / OSes we see in analytics.
const BROWSER_SLUG: Record<string, string> = {
  chrome: 'googlechrome', 'chrome mobile': 'googlechrome', 'chrome webview': 'googlechrome',
  firefox: 'firefoxbrowser', 'mobile firefox': 'firefoxbrowser',
  safari: 'safari', 'mobile safari': 'safari',
  edge: 'microsoftedge',
  opera: 'opera', 'opera mobile': 'opera',
  brave: 'brave',
  samsung: 'samsunginternet', 'samsung internet': 'samsunginternet',
  vivaldi: 'vivaldi', yandex: 'yandex', duckduckgo: 'duckduckgo',
}
const OS_SLUG: Record<string, string> = {
  android: 'android',
  ios: 'apple', mac: 'apple', macos: 'apple', 'mac os': 'apple', 'mac os x': 'apple', 'os x': 'apple', ipados: 'apple',
  linux: 'linux', ubuntu: 'ubuntu', fedora: 'fedora', debian: 'debian',
  'chrome os': 'googlechrome', chromeos: 'googlechrome',
}

// Channel names we store as bare words → the domain whose favicon we want.
const CHANNEL_DOMAIN: Record<string, string> = {
  instagram: 'instagram.com', whatsapp: 'whatsapp.com', google: 'google.com',
  facebook: 'facebook.com', 'fb': 'facebook.com', twitter: 'twitter.com', x: 'x.com',
  youtube: 'youtube.com', linkedin: 'linkedin.com', reddit: 'reddit.com',
  bing: 'bing.com', duckduckgo: 'duckduckgo.com', tiktok: 'tiktok.com',
  pinterest: 'pinterest.com', telegram: 'telegram.org', snapchat: 'snapchat.com',
  yahoo: 'yahoo.com', github: 'github.com', producthunt: 'producthunt.com',
  'google ads': 'google.com', newsletter: 'gmail.com', email: 'gmail.com',
}

// Resolve a source row's value to a domain for favicon lookup.
function sourceDomain(v: string): string {
  const host = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (host.includes('.')) return host                       // already a hostname
  return CHANNEL_DOMAIN[host] ?? `${host}.com`              // bare channel name
}

function pickSlug(v: string, map: Record<string, string>): string | undefined {
  if (map[v]) return map[v]
  const key = Object.keys(map).find(k => v.includes(k))
  return key ? map[key] : undefined
}

// <img> from a CDN logo, swapping to a fallback icon if it 404s.
function CdnIcon({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [err, setErr] = useState(false)
  if (err) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={16} height={16} loading="lazy" onError={() => setErr(true)} className="h-4 w-4 object-contain flex-shrink-0" />
}

// Microsoft Windows isn't on Simple Icons (trademark) — inline its four-pane logo.
function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <path fill="#00A4EF" d="M0 3.449 9.75 2.1v9.451H0zm10.949-1.5L24 0v11.4H10.949zM0 12.6h9.75v9.451L0 20.699zm10.949 0H24V24l-13.051-1.801z" />
    </svg>
  )
}

const sub = 'h-4 w-4 flex-shrink-0 text-[var(--color-text-subtle)]'

// A small icon for one breakdown row, chosen by the dimension type + value.
export function BreakdownIcon({ type, value }: { type?: string; value: string }): ReactNode {
  const v = (value || '').toLowerCase()
  switch (type) {
    case 'country':
      return <span className="w-4 text-center text-[15px] leading-none flex-shrink-0">{countryFlag(value)}</span>
    case 'device': {
      const Icon = /mobile|phone/.test(v) ? Smartphone : /tablet|ipad/.test(v) ? Tablet : Monitor
      return <Icon className={sub} />
    }
    case 'os': {
      if (v.includes('windows')) return <WindowsIcon />
      const slug = pickSlug(v, OS_SLUG)
      return slug
        ? <CdnIcon src={`https://cdn.simpleicons.org/${slug}`} fallback={<Monitor className={sub} />} />
        : <Monitor className={sub} />
    }
    case 'browser': {
      const slug = pickSlug(v, BROWSER_SLUG)
      return slug
        ? <CdnIcon src={`https://cdn.simpleicons.org/${slug}`} fallback={<Globe className={sub} />} />
        : <Globe className={sub} />
    }
    case 'source': {
      if (!v || v.includes('direct') || v.includes('none')) return <Globe className={sub} />
      const domain = sourceDomain(v)
      return <CdnIcon src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} fallback={<Globe className={sub} />} />
    }
    case 'path':
      return <FileText className={sub} />
    case 'download':
      return <Download className={sub} />
    case 'outbound':
      return <ExternalLink className={sub} />
    case 'event':
      return <Zap className={sub} />
    default:
      return null
  }
}

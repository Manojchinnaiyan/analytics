export interface BrowserInfo {
  browser: string
  browserVersion: string
  osName: string
  osVersion: string
  deviceType: string
  platform: string
}

export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent

  let browser = 'Unknown'
  let browserVersion = ''
  let osName = 'Unknown'
  let osVersion = ''
  let deviceType = 'desktop'

  // Browser detection
  if (/Edg\//.test(ua)) {
    browser = 'Edge'
    browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    browser = 'Chrome'
    browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''
  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox'
    browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari'
    browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] ?? ''
  }

  // OS detection
  if (/Windows/.test(ua)) {
    osName = 'Windows'
    osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] ?? ''
  } else if (/Mac OS X/.test(ua)) {
    osName = 'macOS'
    osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''
  } else if (/Android/.test(ua)) {
    osName = 'Android'
    osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? ''
    deviceType = 'mobile'
  } else if (/iPhone|iPad/.test(ua)) {
    osName = 'iOS'
    osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''
    deviceType = /iPad/.test(ua) ? 'tablet' : 'mobile'
  } else if (/Linux/.test(ua)) {
    osName = 'Linux'
  }

  return {
    browser,
    browserVersion,
    osName,
    osVersion,
    deviceType,
    platform: navigator.platform ?? osName,
  }
}

export function getUTMParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const val = params.get(key)
    if (val) utm[key] = val
  }
  return utm
}

// Ad-network click identifiers — captured like UTMs for paid-attribution
// (Google gclid, Meta fbclid, Microsoft msclkid, TikTok ttclid).
export function getClickIds(): Record<string, string> {
  const params = new URLSearchParams(window.location.search)
  const out: Record<string, string> = {}
  for (const key of ['gclid', 'fbclid', 'msclkid', 'ttclid']) {
    const val = params.get(key)
    if (val) out[key] = val
  }
  return out
}

export interface DeviceContext {
  screen_width?: number
  screen_height?: number
  viewport_width?: number
  viewport_height?: number
  device_pixel_ratio?: number
  connection_type?: string
  language?: string
  page_title?: string
}

// getDeviceContext returns the standard device/page context vendors attach to
// every event (screen, viewport, DPR, connection, locale, page title).
export function getDeviceContext(): DeviceContext {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  const ctx: DeviceContext = {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio || 1,
    language: navigator.language || undefined,
    page_title: document.title || undefined,
  }
  if (typeof screen !== 'undefined') {
    ctx.screen_width = screen.width
    ctx.screen_height = screen.height
  }
  if (nav.connection?.effectiveType) ctx.connection_type = nav.connection.effectiveType
  return ctx
}

// Common IANA timezone → ISO country-code fallback (covers most real traffic).
const TZ_COUNTRY: Record<string, string> = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
  'Europe/Amsterdam': 'NL', 'Europe/Moscow': 'RU', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
  'Australia/Sydney': 'AU', 'America/Sao_Paulo': 'BR', 'America/Toronto': 'CA',
}

/**
 * Best-effort country detection from the browser — no IP/GeoIP DB needed.
 * Prefers the region in navigator.language (e.g. en-US → US), falls back to a
 * timezone→country map. Returns an ISO country code or ''.
 */
export function detectCountry(): string {
  try {
    const lang = navigator.language || ''
    const parts = lang.split('-')
    if (parts.length > 1 && parts[1].length === 2) return parts[1].toUpperCase()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return TZ_COUNTRY[tz] ?? ''
  } catch {
    return ''
  }
}

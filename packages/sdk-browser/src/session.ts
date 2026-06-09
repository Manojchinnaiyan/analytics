const SESSION_KEY = '_amp_session'
const DEVICE_KEY = '_amp_device'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const DEVICE_MAX_AGE = 2 * 365 * 24 * 60 * 60 // ~2 years (seconds)

interface SessionData {
  sessionId: string
  lastSeen: number
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ── First-party cookie helpers ──────────────────────────────────────────────
// Cookies survive some storage-clearing that localStorage doesn't, so we anchor
// the anonymous device id in BOTH and restore from whichever survives.
function setCookie(name: string, value: string, maxAgeSec: number): void {
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSec}; SameSite=Lax`
  } catch {
    // ignore
  }
}

function getCookie(name: string): string {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : ''
  } catch {
    return ''
  }
}

// getDeviceId returns a STABLE anonymous id. It is generated once and persisted
// to both localStorage and a long-lived first-party cookie; a wipe of one is
// transparently restored from the other. It is never reset on navigation —
// campaign attribution (utm_*) is recorded as event properties, not by changing
// identity (which is how real vendors avoid inflating user counts on refresh).
export function getDeviceId(): string {
  let id = ''
  try {
    id = localStorage.getItem(DEVICE_KEY) || ''
  } catch {
    // ignore
  }
  if (!id) id = getCookie(DEVICE_KEY)
  if (!id) id = generateId()

  // Re-persist to both stores so each backs up the other.
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    // ignore
  }
  setCookie(DEVICE_KEY, id, DEVICE_MAX_AGE)
  return id
}

const LINK_PARAM = '_amp'

// adoptLinkedDevice: if the landing URL carries a cross-domain linker param
// (?_amp=<deviceId>), adopt that id so a visitor crossing domains (site.com →
// checkout.com) continues as ONE device, then strip the param from the URL so it
// isn't bookmarked/shared. Call before getDeviceId().
export function adoptLinkedDevice(): void {
  try {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const linked = url.searchParams.get(LINK_PARAM)
    if (linked && /^[A-Za-z0-9_-]{8,64}$/.test(linked)) {
      try { localStorage.setItem(DEVICE_KEY, linked) } catch { /* ignore */ }
      setCookie(DEVICE_KEY, linked, DEVICE_MAX_AGE)
      url.searchParams.delete(LINK_PARAM)
      window.history.replaceState({}, '', url.toString())
    }
  } catch { /* ignore */ }
}

// decorateCrossDomain appends the linker param to an outbound href whose host is
// in the configured cross-domain list (exact or subdomain match); else returns
// href unchanged.
export function decorateCrossDomain(href: string, deviceId: string, domains: string[]): string {
  try {
    const u = new URL(href, window.location.href)
    if (u.host !== window.location.host && domains.some(d => u.host === d || u.host.endsWith('.' + d))) {
      u.searchParams.set(LINK_PARAM, deviceId)
      return u.toString()
    }
  } catch { /* ignore */ }
  return href
}

// getSession returns the current session (30-min inactivity window) and whether
// it was just started — so the caller can emit a session_start boundary event,
// the way Amplitude/Mixpanel do. Durable in localStorage (survives refresh+tabs).
export function getSession(): { sessionId: string; isNew: boolean } {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const data: SessionData = JSON.parse(raw)
      if (Date.now() - data.lastSeen < SESSION_TIMEOUT_MS) {
        data.lastSeen = Date.now()
        localStorage.setItem(SESSION_KEY, JSON.stringify(data))
        return { sessionId: data.sessionId, isNew: false }
      }
    }
  } catch {
    // ignore
  }

  const sessionId = generateId()
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, lastSeen: Date.now() }))
  } catch {
    // ignore
  }
  return { sessionId, isNew: true }
}

export function getSessionId(): string {
  return getSession().sessionId
}

// nextSequence returns a per-device monotonic counter used for strict event
// ordering even when client clocks are skewed.
const SEQ_KEY = '_amp_seq'
export function nextSequence(): number {
  try {
    const n = parseInt(localStorage.getItem(SEQ_KEY) || '0', 10) + 1
    localStorage.setItem(SEQ_KEY, String(n))
    return n
  } catch {
    return Date.now()
  }
}

export function refreshSession(): void {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const data: SessionData = JSON.parse(raw)
      data.lastSeen = Date.now()
      localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    }
  } catch {
    // ignore
  }
}

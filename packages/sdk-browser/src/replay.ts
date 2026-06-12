// Session replay: records the session with rrweb (bundled first-party into this
// SDK — no third-party CDN) and uploads batched rrweb events to the replay
// endpoint. Folded into the SDK so one init() does analytics + replay, the way
// PostHog/Amplitude ship it.
//
// NOTE on idle: we never stop/restart rrweb (that corrupts the event stream —
// incremental events depend on a continuous mirror). Instead, while the tab is
// hidden we keep rrweb running but DROP its output so idle background mutations
// don't inflate the session; on return we force one full snapshot to re-sync the
// player. Storage is further controlled by sampleRate + throttled signals.

import { record } from 'rrweb'

const FLUSH_INTERVAL_MS = 8000
const IDLE_MS = 60000 // pause recording after 60s of no user interaction

let started = false

interface ReplayConfig {
  apiKey: string
  serverUrl: string          // base URL; events POST to `${serverUrl}/replay`
  sessionId: string
  getDistinctId: () => string
  sampleRate?: number        // 0..1 (default 1)
  maskAllInputs?: boolean    // default true
  maskTextSelector?: string  // default '.mask'
  blockSelector?: string     // default '.no-record'
}

export function startSessionReplay(cfg: ReplayConfig): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return

  // Decide once per session whether to record, stable across navigations.
  const rate = cfg.sampleRate ?? 1
  const key = '_iu_replay_' + cfg.sessionId
  let decision: string | null
  try {
    decision = sessionStorage.getItem(key)
    if (decision === null) {
      decision = Math.random() < rate ? '1' : '0'
      sessionStorage.setItem(key, decision)
    }
  } catch {
    decision = Math.random() < rate ? '1' : '0'
  }
  if (decision !== '1') return
  started = true

  const endpoint = cfg.serverUrl.replace(/\/+$/, '') + '/replay'

  const begin = () => {
    let buf: unknown[] = []
    let paused = false // true while the tab is hidden — stops idle time inflating the session

    // flush() is defined BEFORE record() because rrweb emits the initial full
    // snapshot synchronously during record(), and emit() flushes it right away.
    const flush = (useBeacon: boolean) => {
      if (!buf.length) return
      const body = JSON.stringify({
        api_key: cfg.apiKey,
        session_id: cfg.sessionId,
        distinct_id: cfg.getDistinctId(),
        events: buf,
      })
      buf = []
      try {
        if (useBeacon && navigator.sendBeacon) {
          // Page is unloading: best-effort beacon (≤64KB). The full snapshot was
          // already uploaded on capture, so this only carries small tails.
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
        } else {
          // NORMAL fetch (no keepalive) — keepalive caps the body at ~64KB, which
          // silently drops large full snapshots. Without it there's no cap.
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }).catch(() => {})
        }
      } catch {
        /* never let replay upload break the host page */
      }
    }

    record({
      emit(event) {
        if (paused) return // tab hidden: don't record idle background mutations
        buf.push(event)
        // Full snapshot (type 2) is large AND critical — upload it immediately so
        // a quick navigation can't drop it before the periodic flush.
        if ((event as { type?: number }).type === 2) flush(false)
      },
      maskAllInputs: cfg.maskAllInputs ?? true,
      maskTextSelector: cfg.maskTextSelector ?? '.mask',
      blockSelector: cfg.blockSelector ?? '.no-record',
      // Throttle high-frequency signals so payloads stay small.
      sampling: { mousemove: 50, scroll: 150, input: 'last' },
    })

    setInterval(() => { if (!paused) flush(false) }, FLUSH_INTERVAL_MS)

    // PAUSE recording when the user is inactive — the tab is hidden OR there's
    // been no interaction for IDLE_MS. Otherwise a left-open / idle tab keeps
    // recording the page's background DOM mutations (carousels, timers, ads) and
    // the duration grows with dead air. On the next activity we resume and force
    // one full snapshot to re-sync the player (we never stop/restart rrweb — that
    // corrupts the stream — we only gate its output).
    const snapshot = () => {
      try { (record as unknown as { takeFullSnapshot?: (c?: boolean) => void }).takeFullSnapshot?.(true) } catch { /* noop */ }
    }
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const goIdle = () => { flush(false); paused = true }
    const bump = () => {
      if (paused) { paused = false; snapshot() } // resume on activity
      clearTimeout(idleTimer)
      idleTimer = setTimeout(goIdle, IDLE_MS)
    }
    ;(['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const).forEach(ev =>
      window.addEventListener(ev, bump, { passive: true, capture: true }),
    )
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { flush(true); paused = true; clearTimeout(idleTimer) }
      else bump()
    })
    bump() // arm the idle timer
  }

  // Skip replay entirely on data-saver mode or very slow (2g) connections — the
  // recorder's CPU/network cost isn't worth it for those users.
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return

  // Start only AFTER the page has loaded and the browser is idle, so the heavy
  // initial DOM serialization never competes with first paint / LCP.
  const schedule = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(begin, { timeout: 3000 })
    else setTimeout(begin, 1200)
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
}

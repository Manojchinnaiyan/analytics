// Session replay: records the session with rrweb (bundled first-party into this
// SDK — no third-party CDN) and uploads batched rrweb events to the replay
// endpoint. Folded into the SDK so one init() does analytics + replay, the way
// PostHog/Amplitude ship it.
//
// NOTE on idle: pausing/restarting rrweb mid-session corrupts the event stream
// (incremental events depend on a continuous mirror), so we record continuously.
// Storage is instead controlled by sampleRate, throttled high-frequency signals,
// and server-side retention — none of which break playback.

import { record } from 'rrweb'

const FLUSH_INTERVAL_MS = 8000

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

    setInterval(() => flush(false), FLUSH_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush(true)
    })
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

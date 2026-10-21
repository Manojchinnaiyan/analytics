// Session replay: records the session with rrweb (bundled first-party into this
// SDK — no third-party CDN) and uploads batched rrweb events to the replay
// endpoint. Folded into the SDK so one init() does analytics + replay, the way
// PostHog/Amplitude ship it.
//
// NOTE on idle: we record CONTINUOUSLY and never drop emitted events. An earlier
// version paused on idle by dropping rrweb's output and re-syncing with a fresh
// full snapshot on resume — but dropping emitted events while rrweb's mirror keeps
// mutating desyncs the stream, and the extra mid-stream snapshot chunks reorder
// against the periodic chunks (the store concatenates by server insert-time), so
// the player received incrementals before their full snapshot and froze on the
// first frame. Idle *viewing* time is trimmed at playback by the Replayer's
// skipInactive; payload size is controlled by sampleRate + throttled sampling.

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

    // On tab-hide, beacon out whatever is buffered so a close/nav doesn't drop the
    // tail. We keep recording continuously otherwise — idle *viewing* time is
    // trimmed at playback by the Replayer's skipInactive, so we never need to drop
    // emitted events here (doing so desyncs rrweb's mirror and breaks the replay).
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

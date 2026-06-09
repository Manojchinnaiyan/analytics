// Session replay: records the session with rrweb (bundled first-party into this
// SDK — no third-party CDN) and uploads batched rrweb events to the replay
// endpoint. Folded into the SDK so one init() does analytics + replay, the way
// PostHog/Amplitude ship it.

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

  // Decide once per session whether to record, and remember it so the choice is
  // stable across page navigations within the same session.
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
    record({
      emit(event) {
        buf.push(event)
      },
      maskAllInputs: cfg.maskAllInputs ?? true,
      maskTextSelector: cfg.maskTextSelector ?? '.mask',
      blockSelector: cfg.blockSelector ?? '.no-record',
      // Throttle high-frequency signals so payloads stay small.
      sampling: { mousemove: 50, scroll: 150, input: 'last' },
    })

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
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
        } else {
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => {})
        }
      } catch {
        /* never let replay upload break the host page */
      }
    }

    setInterval(() => flush(false), FLUSH_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush(true)
    })
  }

  // Defer to idle so capturing never competes with initial page render.
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (ric) ric(begin)
  else setTimeout(begin, 1)
}

import { getBrowserInfo, getUTMParams, getClickIds, getDeviceContext, detectCountry, getLinkCode } from './enricher'
import { getDeviceId, getSession, refreshSession, nextSequence, adoptLinkedDevice, decorateCrossDomain } from './session'
import { startSessionReplay } from './replay'
import type { Event, EventOptions, IdentifyOperation, RevenueOptions, SDKConfig } from './types'

const SDK_VERSION = '0.2.0'
const DEFAULT_SERVER_URL = 'http://localhost:4000'
const DEFAULT_FLUSH_INTERVAL = 10_000
const DEFAULT_FLUSH_SIZE = 30
const QUEUE_KEY = '_amp_queue' // unsent events persisted across reloads/crashes
const MAX_PERSISTED = 1000

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  }
}

// fnv1a32 mirrors Go's hash/fnv New32a so client-side bucketing matches the
// server EXACTLY — a user gets the same flag variant whether evaluated locally
// or on the server.
interface FlagConfig {
  key: string
  enabled: boolean
  rollout: number
  holdout?: number
  variants: { key: string; weight: number }[]
  targeting?: { property: string; operator: string; value: string; variant: string }[]
  exclusion_group?: string
  prereq_flag?: string
  prereq_variant?: string
}

function fnv1a32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
function flagBucket(s: string): number {
  return fnv1a32(s) % 100
}
function pickVariant(variants: { key: string; weight: number }[], b: number): string {
  const total = variants.reduce((acc, v) => acc + v.weight, 0)
  if (total <= 0) return 'control'
  const scaled = Math.floor((b * total) / 100)
  let acc = 0
  for (const v of variants) {
    acc += v.weight
    if (scaled < acc) return v.key
  }
  return variants[variants.length - 1].key
}

// Persist the unsent queue so events survive a reload/crash and are retried —
// exactly what Amplitude/Segment do to avoid losing (or having to re-fire) events.
function persistQueue(queue: Event[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_PERSISTED)))
  } catch {
    // ignore (storage full / unavailable)
  }
}

function loadQueue(): Event[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
    }
  } catch {
    // ignore
  }
  return []
}

const OPTOUT_KEY = '_amp_optout'
function saveOptOut(v: boolean): void {
  try { localStorage.setItem(OPTOUT_KEY, v ? '1' : '0') } catch { /* ignore */ }
}
function loadOptOut(): boolean {
  try { return localStorage.getItem(OPTOUT_KEY) === '1' } catch { return false }
}
function hasOptOutChoice(): boolean {
  try { return localStorage.getItem(OPTOUT_KEY) !== null } catch { return false }
}

// Persist the merged user profile so $add/$append/$setOnce accumulate across
// reloads & sessions — the client maintains the profile, the server reads
// latest-wins (the PostHog-on-ClickHouse pattern). No mutable server row needed.
const USERPROPS_KEY = '_amp_userprops'
function saveUserProps(props: Record<string, unknown>): void {
  try { localStorage.setItem(USERPROPS_KEY, JSON.stringify(props)) } catch { /* ignore */ }
}
function loadUserProps(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(USERPROPS_KEY)
    if (raw) return JSON.parse(raw) || {}
  } catch { /* ignore */ }
  return {}
}

// safeText returns trimmed, length-capped element text — but NOT for inputs or
// elements opted out via .mask / [data-private] (avoid leaking PII in click text).
function safeText(el: HTMLElement): string | undefined {
  if (/^(INPUT|TEXTAREA|SELECT|SCRIPT|STYLE|SVG|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return undefined
  if (el.closest('.mask, [data-private], .ph-no-capture')) return '***'
  // Visible text only: clone and drop script/style/template/svg so we never slurp
  // up JSON-LD, inline scripts, or markup the way raw textContent does.
  let t = ''
  try {
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('script,style,template,noscript,svg').forEach(n => n.remove())
    t = (clone.textContent || '').replace(/\s+/g, ' ').trim()
  } catch {
    t = (el.textContent || '').replace(/\s+/g, ' ').trim()
  }
  // Icon/image links have no text — fall back to a real label.
  if (!t) {
    const img = el.querySelector('img')
    t = (el.getAttribute('aria-label') || el.getAttribute('title') || img?.getAttribute('alt') || '').trim()
  }
  if (!t) return undefined
  // Defensive: if it still looks like markup/code, drop it (better empty than garbage).
  if (/[<>{}]/.test(t)) return undefined
  return t.slice(0, 60) // short, clean label
}

// describeElement captures the rich, PII-safe context autocapture vendors record:
// the clicked element PLUS its ancestor chain (so events can later be defined by
// any parent), each with tag/id/classes/text/attrs — like PostHog's $elements.
function describeElement(el: HTMLElement): Record<string, unknown> {
  const chain: Record<string, unknown>[] = []
  let node: HTMLElement | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 6) {
    chain.push({
      tag: node.tagName.toLowerCase(),
      id: node.id || undefined,
      class: (typeof node.className === 'string' && node.className) || undefined,
      text: safeText(node),
      href: (node as HTMLAnchorElement).href || undefined,
      name: (node as HTMLInputElement).name || undefined,
      aria: node.getAttribute?.('aria-label') || undefined,
    })
    node = node.parentElement
    depth++
  }
  return {
    tag: el.tagName.toLowerCase(),
    text: safeText(el),
    id: el.id || undefined,
    class: (typeof el.className === 'string' && el.className) || undefined,
    href: ((el as HTMLAnchorElement).href || '').slice(0, 128) || undefined, // truncated like Amplitude
    selector: cssPath(el),
    elements: chain, // full ancestor chain (PostHog $elements style)
  }
}

const DOWNLOAD_EXT = new Set(['pdf', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'rar', 'gz', 'tar', 'dmg', 'exe', 'pkg', 'mp3', 'mp4', 'mov', 'avi', 'wav', 'txt', 'json', 'xml', 'apk', 'deb'])

// parentLabel returns the trimmed text of the clicked element's parent (Amplitude
// "Element Parent Label").
function parentLabel(el: HTMLElement): string | undefined {
  const p = el.parentElement
  if (!p) return undefined
  if (p.closest('.mask, [data-private], .ph-no-capture')) return '***'
  const t = (p.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
  return t || undefined
}

// dataAttrs collects an element's data-* attributes (Amplitude "Element Attributes").
function dataAttrs(el: HTMLElement): Record<string, string> | undefined {
  const ds = (el as HTMLElement).dataset
  if (!ds) return undefined
  const out: Record<string, string> = {}
  for (const k of Object.keys(ds)) {
    const v = ds[k]
    if (v !== undefined) out[k] = String(v).slice(0, 255)
  }
  return Object.keys(out).length ? out : undefined
}

// cssPath builds a short, stable-ish selector up to 4 levels (stops at an id).
function cssPath(el: HTMLElement): string {
  const parts: string[] = []
  let node: HTMLElement | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 4) {
    let part = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(part + '#' + node.id)
      break
    }
    const cls = (typeof node.className === 'string' ? node.className : '')
      .trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
    if (cls) part += '.' + cls
    parts.unshift(part)
    node = node.parentElement
    depth++
  }
  return parts.join(' > ')
}

export class InspectUserClient {
  private config: Required<SDKConfig>
  private queue: Event[] = []
  private userId: string | undefined
  private userProperties: Record<string, unknown> = {}
  private groups: Record<string, string | string[]> = {}
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private deviceId: string
  private sessionId: string
  private optedOut = false
  private backoffMs = 0

  constructor(config: SDKConfig) {
    // Full autocapture is ON by default — like Heap/PostHog/Amplitude Autocapture,
    // you get interactions without hand-writing track() calls. Deep-merge so a
    // partial autoCapture override doesn't wipe the other defaults.
    const defaultAutoCapture = {
      pageViews: true, clicks: true, formSubmissions: true,
      changes: true, scrollDepth: true, rageClicks: true, deadClicks: true, webVitals: true, errors: true,
    }
    this.config = {
      serverUrl: DEFAULT_SERVER_URL,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL,
      flushQueueSize: DEFAULT_FLUSH_SIZE,
      defaultTracking: true,
      requireConsent: false,
      crossDomain: [],
      ...config,
      autoCapture: { ...defaultAutoCapture, ...(config.autoCapture ?? {}) },
      sessionReplay: {
        enabled: false, sampleRate: 1, serverUrl: '',
        maskAllInputs: true, maskTextSelector: '.mask', blockSelector: '.no-record',
        ...(config.sessionReplay ?? {}),
      },
    }
    adoptLinkedDevice() // continue as one device if arriving via a cross-domain link
    this.deviceId = getDeviceId()

    // Respect a prior opt-out choice and the browser Do-Not-Track signal. With
    // requireConsent, start opted-out until setConsent(true) (GDPR opt-in) unless
    // the user already made an explicit choice previously.
    const priorChoice = hasOptOutChoice()
    this.optedOut = loadOptOut() || (typeof navigator !== 'undefined' && navigator.doNotTrack === '1')
    if (this.config.requireConsent && !priorChoice) this.optedOut = true

    // Restore the accumulated user profile. Attribution is only captured/persisted
    // once tracking is allowed (no localStorage writes before GDPR opt-in).
    this.userProperties = loadUserProps()
    if (!this.optedOut) this.captureAttribution()

    // Restore any events that didn't make it out before a previous reload/crash.
    this.queue = loadQueue()

    // Resolve the session and emit a session_start boundary if it's new — but
    // never enqueue anything while opted out / awaiting consent.
    const sess = getSession()
    this.sessionId = sess.sessionId
    if (sess.isNew && this.config.defaultTracking && !this.optedOut) {
      this.enqueue(this.buildEvent('session_start', {}))
    }

    this.startFlushTimer()
    this.setupAutoCapture()
    this.setupPageUnload()
    // Try to drain anything restored from storage right away.
    if (this.queue.length > 0) this.flush()

    // Session replay (rrweb) — one init() does analytics + replay. Lazy-loads,
    // respects opt-out/consent, and uploads batched rrweb events to /replay.
    if (this.config.sessionReplay.enabled && !this.optedOut) {
      startSessionReplay({
        apiKey: this.config.apiKey,
        serverUrl: this.config.sessionReplay.serverUrl || this.config.serverUrl,
        sessionId: this.sessionId,
        getDistinctId: () => this.userId || this.deviceId,
        sampleRate: this.config.sessionReplay.sampleRate,
        maskAllInputs: this.config.sessionReplay.maskAllInputs,
        maskTextSelector: this.config.sessionReplay.maskTextSelector,
        blockSelector: this.config.sessionReplay.blockSelector,
      })
    }
  }

  identify(userId: string, properties?: Record<string, unknown>): void {
    this.userId = userId
    if (properties) {
      this.userProperties = { ...this.userProperties, ...properties }
      saveUserProps(this.userProperties)
    }
    // Carry the device→user link so the server can merge the anonymous history.
    this.track('$identify', { $set: properties ?? {} }, { userId })
    this.flush() // get the identity link to the server promptly
  }

  // setUserProperties applies the operations locally (so later events carry them)
  // AND forwards the full op set so the server can maintain the user profile —
  // $set / $setOnce / $add / $append / $unset, like Amplitude's Identify API.
  setUserProperties(ops: IdentifyOperation): void {
    if (ops.$set) this.userProperties = { ...this.userProperties, ...ops.$set }
    if (ops.$setOnce) {
      for (const [k, v] of Object.entries(ops.$setOnce)) {
        if (!(k in this.userProperties)) this.userProperties[k] = v
      }
    }
    if (ops.$add) {
      for (const [k, v] of Object.entries(ops.$add)) {
        this.userProperties[k] = (Number(this.userProperties[k]) || 0) + Number(v)
      }
    }
    if (ops.$append) {
      for (const [k, v] of Object.entries(ops.$append)) {
        const cur = Array.isArray(this.userProperties[k]) ? (this.userProperties[k] as unknown[]) : []
        this.userProperties[k] = [...cur, v]
      }
    }
    if (ops.$unset) {
      for (const k of ops.$unset) delete this.userProperties[k]
    }
    saveUserProps(this.userProperties)
    this.track('$identify', { $ops: ops })
  }

  track(
    eventType: string,
    properties?: Record<string, unknown>,
    options?: EventOptions,
  ): void {
    if (this.optedOut) return
    this.ensureSession()
    this.enqueue(this.buildEvent(eventType, properties, options))
  }

  // ── Revenue API (Amplitude-style, with currency + dedup) ───────────────────
  revenue(r: RevenueOptions): void {
    const quantity = r.quantity ?? 1
    this.track('Revenue', {
      $price: r.price,
      $quantity: quantity,
      $revenue: r.price * quantity,
      $productId: r.productId,
      $revenueType: r.revenueType ?? 'purchase',
      $currency: r.currency ?? 'USD',
      $transactionId: r.transactionId, // server can dedup repeated revenue
      ...(r.properties ?? {}),
    })
  }

  // ── Feature flags: LOCAL evaluation ────────────────────────────────────────
  // Fetches the flag config once, then evaluates locally (no per-call round-trip)
  // with the SAME logic as the server: prerequisites → mutual exclusion →
  // targeting rules → holdout → rollout → weighted variant. Records an exposure.
  private flagConfig: { flags: FlagConfig[] } | null = null
  async flags(): Promise<Record<string, { enabled: boolean; variant: string }>> {
    if (this.optedOut) return {}
    if (!this.flagConfig) {
      try {
        this.flagConfig = await fetch(`${this.config.serverUrl}/v1/flags/config`, {
          headers: { 'X-API-Key': this.config.apiKey },
        }).then(r => r.json())
      } catch {
        return {}
      }
    }
    const flags = this.flagConfig?.flags ?? []
    const byKey: Record<string, FlagConfig> = {}
    const groups: Record<string, string[]> = {}
    for (const f of flags) {
      byKey[f.key] = f
      if (f.enabled && f.exclusion_group) (groups[f.exclusion_group] ||= []).push(f.key)
    }
    for (const g of Object.keys(groups)) groups[g].sort()

    const id = this.userId || this.deviceId
    const out: Record<string, { enabled: boolean; variant: string }> = {}
    for (const f of flags) {
      const r = this.evalVariant(f, id, byKey, groups, 0)
      if (!r.on) continue
      out[f.key] = { enabled: true, variant: r.variant }
      this.track('$flag_exposure', { flag: f.key, variant: r.variant })
    }
    return out
  }

  private evalVariant(f: FlagConfig, id: string, byKey: Record<string, FlagConfig>, groups: Record<string, string[]>, depth: number): { variant: string; on: boolean } {
    if (!f.enabled || depth > 5) return { variant: '', on: false }
    if (f.prereq_flag) {
      const pf = byKey[f.prereq_flag]
      if (!pf) return { variant: '', on: false }
      const p = this.evalVariant(pf, id, byKey, groups, depth + 1)
      if (!p.on || (f.prereq_variant && p.variant !== f.prereq_variant)) return { variant: '', on: false }
    }
    if (f.exclusion_group) {
      const members = groups[f.exclusion_group] || []
      if (members.length && members[fnv1a32(`${f.exclusion_group}.${id}`) % members.length] !== f.key) {
        return { variant: '', on: false }
      }
    }
    for (const rule of f.targeting ?? []) {
      const v = this.userProperties[rule.property]
      if (v !== undefined) {
        const s = String(v)
        const match = rule.operator === 'is' ? s === rule.value : rule.operator === 'is_not' ? s !== rule.value : rule.operator === 'contains' ? s.includes(rule.value) : false
        if (match) return { variant: rule.variant, on: true }
      }
    }
    if (f.holdout && flagBucket(`${f.key}.holdout.${id}`) < f.holdout) return { variant: '', on: false }
    if (flagBucket(`${f.key}.${id}`) >= f.rollout) return { variant: '', on: false }
    return { variant: pickVariant(f.variants, flagBucket(`${f.key}.variant.${id}`)), on: true }
  }

  // ── Consent / opt-out ──────────────────────────────────────────────────────
  setOptOut(optOut: boolean): void {
    const was = this.optedOut
    this.optedOut = optOut
    saveOptOut(optOut)
    if (optOut) {
      this.queue = []
      persistQueue(this.queue)
    } else if (was) {
      // Consent just granted — now safe to capture touch attribution and start
      // a session boundary that we deliberately withheld pre-consent.
      this.captureAttribution()
      const sess = getSession()
      this.sessionId = sess.sessionId
      if (this.config.defaultTracking) this.enqueue(this.buildEvent('session_start', {}))
      this.flush()
    }
  }

  // setConsent is the opt-IN counterpart for requireConsent (GDPR): granting
  // consent starts tracking; revoking stops it. Records the choice persistently.
  setConsent(granted: boolean): void {
    this.setOptOut(!granted)
  }

  // ── Identity lifecycle ─────────────────────────────────────────────────────
  // logout clears the user and starts a fresh anonymous identity (new device +
  // session) — safe for shared devices, like Amplitude reset() on sign-out.
  logout(): void {
    this.reset()
  }

  // alias links the current (anonymous or known) identity to a canonical user id
  // — used when the post-signup user id differs from the pre-signup one.
  alias(userId: string): void {
    if (this.optedOut) return
    this.track('$identify', { $alias: { from: this.userId || this.deviceId, to: userId } }, { userId })
    this.userId = userId
    this.flush()
  }

  // ── Group analytics (B2B) ──────────────────────────────────────────────────
  setGroup(groupType: string, groupName: string | string[]): void {
    this.groups[groupType] = groupName
    this.userProperties[`group_${groupType}`] = groupName
    this.track('$identify', {})
  }

  // captureAttribution stores first-touch utm once and last-touch every visit,
  // as user properties — exactly how Amplitude/GA4 attribute users.
  private captureAttribution(): void {
    const utm = { ...getUTMParams(), ...getClickIds() } // UTMs + ad click-ids (gclid/fbclid/…)
    if (Object.keys(utm).length === 0) return
    let initial: Record<string, string> | null = null
    try {
      initial = JSON.parse(localStorage.getItem('_amp_initial_utm') || 'null')
    } catch {
      // ignore
    }
    if (!initial) {
      initial = utm
      try { localStorage.setItem('_amp_initial_utm', JSON.stringify(utm)) } catch { /* ignore */ }
    }
    for (const [k, v] of Object.entries(initial)) this.userProperties[`initial_${k}`] = v
    for (const [k, v] of Object.entries(utm)) this.userProperties[`latest_${k}`] = v
    saveUserProps(this.userProperties)
  }

  // buildEvent enriches an event and stamps a unique insert_id (server dedup)
  // and a per-device sequence number (strict ordering) — like the real vendors.
  private buildEvent(
    eventType: string,
    properties?: Record<string, unknown>,
    options?: EventOptions,
  ): Event {
    const browserInfo = getBrowserInfo()
    const utm = getUTMParams()
    return {
      event_type: eventType,
      user_id: options?.userId ?? this.userId,
      device_id: options?.deviceId ?? this.deviceId,
      session_id: options?.sessionId ?? this.sessionId,
      insert_id: uuid(),
      event_id: nextSequence(),
      time: options?.time ?? Date.now(),
      // Device/page context (screen, viewport, DPR, connection, locale, title)
      // is attached to every event like the vendors do; explicit event props win.
      event_properties: { ...getDeviceContext(), ...(properties ?? {}) },
      user_properties: { ...this.userProperties },
      platform: options?.platform ?? browserInfo.platform,
      os_name: options?.osName ?? browserInfo.osName,
      os_version: options?.osVersion ?? browserInfo.osVersion,
      device_type: options?.deviceType ?? browserInfo.deviceType,
      browser: options?.browser ?? browserInfo.browser,
      browser_version: options?.browserVersion ?? browserInfo.browserVersion,
      country: options?.country ?? detectCountry(),
      utm_source: utm['utm_source'],
      utm_medium: utm['utm_medium'],
      utm_campaign: utm['utm_campaign'],
      utm_term: utm['utm_term'],
      utm_content: utm['utm_content'],
      // Branded short-link code (?il=<code>) — resolved to utm_* server-side.
      link_code: getLinkCode() || undefined,
      referrer: document.referrer,
      sdk_version: SDK_VERSION,
    }
  }

  private enqueue(event: Event): void {
    this.queue.push(event)
    persistQueue(this.queue)
    refreshSession()
    if (this.queue.length >= this.config.flushQueueSize) {
      this.flush()
    }
  }

  // ensureSession rolls the session forward and emits session_start when a new
  // session begins (after 30 min of inactivity).
  private ensureSession(): void {
    const { sessionId, isNew } = getSession()
    if (sessionId !== this.sessionId) {
      this.sessionId = sessionId
      if (isNew && this.config.defaultTracking) {
        this.enqueue(this.buildEvent('session_start', {}))
      }
    }
  }

  async flush(useBeacon = false): Promise<void> {
    if (this.optedOut || this.queue.length === 0) return

    const batch = this.queue.splice(0)
    persistQueue(this.queue)
    const url = `${this.config.serverUrl}/v2/httpapi`
    const body = JSON.stringify({ api_key: this.config.apiKey, events: batch })

    // On page-leave, sendBeacon guarantees delivery without blocking unload.
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      if (!ok) this.requeue(batch)
      return
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
      if (res.ok) {
        this.backoffMs = 0
        return
      }
      // Status-aware handling, like the production SDKs:
      if (res.status === 400) return // malformed payload — drop, don't retry forever
      if (res.status === 413 && batch.length > 1) {
        // Payload too large — split and requeue both halves.
        const mid = Math.ceil(batch.length / 2)
        this.requeue(batch.slice(mid))
        this.requeue(batch.slice(0, mid))
        return
      }
      // 429 / 5xx — requeue and back off exponentially.
      this.requeue(batch)
      this.scheduleBackoff()
    } catch {
      this.requeue(batch)
      this.scheduleBackoff()
    }
  }

  private requeue(batch: Event[]): void {
    if (this.queue.length < MAX_PERSISTED) {
      this.queue.unshift(...batch)
      persistQueue(this.queue)
    }
  }

  private scheduleBackoff(): void {
    this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 30_000)
    setTimeout(() => this.flush(), this.backoffMs)
  }

  reset(): void {
    this.userId = undefined
    this.userProperties = {}
    saveUserProps({})
    this.deviceId = getDeviceId()
    this.sessionId = getSession().sessionId
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs)
  }

  private setupAutoCapture(): void {
    const ac = this.config.autoCapture

    // ── Page views: initial load + ALL SPA route changes ───────────────────
    // pushState, replaceState, popstate AND hashchange — deduped so a route
    // change that doesn't actually change the URL doesn't double-fire.
    if (ac?.pageViews) {
      let lastUrl = ''
      const firePageView = () => {
        const url = window.location.href
        if (url === lastUrl) return // dedupe
        lastUrl = url
        this.flushEngagement(window.location.pathname) // close out the page we're leaving
        this.track('Page Viewed', {
          url,
          domain: window.location.hostname,           // Page Domain
          path: window.location.pathname,
          title: document.title,
          referrer: document.referrer,
        })
      }
      this.setupEngagement()
      firePageView()

      const wrap = (fn: History['pushState']): History['pushState'] => {
        const orig = fn.bind(history)
        return (...args) => { orig(...args); firePageView() }
      }
      history.pushState = wrap(history.pushState)
      history.replaceState = wrap(history.replaceState)
      window.addEventListener('popstate', firePageView)
      window.addEventListener('hashchange', firePageView)
    }

    // ── Click auto-capture (any element) + rage / dead clicks ──────────────
    if (ac?.clicks) {
      let recentClicks: number[] = []
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (!target?.closest) return
        // Prefer the nearest meaningful element, else the target itself.
        const el = (target.closest('a,button,[role="button"],input,select,textarea,label,[onclick],[data-track]') as HTMLElement) || target
        const props = {
          ...describeElement(el),
          aria: el.getAttribute?.('aria-label') || undefined,                    // Element Aria Label
          parent_text: parentLabel(el),                                          // Element Parent Label
          data: dataAttrs(el),                                                   // Element Attributes (data-*)
          viewport_width: window.innerWidth,                                     // Viewport Width
          viewport_height: window.innerHeight,                                   // Viewport Height
        }
        const me = e as MouseEvent
        this.track('Element Clicked', { ...props, x: me.clientX, y: me.clientY, path: window.location.pathname })

        // File Downloaded — a link to a downloadable file.
        const a = el.closest('a') as HTMLAnchorElement | null
        if (a?.href) {
          const ext = (a.href.split('?')[0].split('.').pop() || '').toLowerCase()
          if (a.hasAttribute('download') || DOWNLOAD_EXT.has(ext)) {
            this.track('File Downloaded', { href: a.href.slice(0, 1024), file_extension: ext, text: (a.textContent || '').trim().slice(0, 120) || undefined, path: window.location.pathname })
          }
          // Outbound Link Clicked: an http(s) link to a different host.
          try {
            const u = new URL(a.href, window.location.href)
            if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host && u.host !== window.location.host) {
              this.track('Outbound Link Clicked', { href: a.href.slice(0, 1024), domain: u.host, text: (a.textContent || '').trim().slice(0, 120) || undefined, path: window.location.pathname })
              // Cross-domain linker: tag the destination with our device id so the
              // visit continues as one device on the other domain.
              const cd = this.config.crossDomain
              if (cd?.length) a.href = decorateCrossDomain(a.href, this.deviceId, cd)
            }
          } catch { /* malformed href */ }
        }

        // Rage click: 3+ clicks within 1s.
        if (ac.rageClicks) {
          const now = Date.now()
          recentClicks = recentClicks.filter((t) => now - t < 1000)
          recentClicks.push(now)
          if (recentClicks.length >= 3) {
            this.track('$rageclick', { ...props, path: window.location.pathname })
            recentClicks = []
          }
        }

        // Dead click: nothing in the DOM changed and we didn't navigate.
        if (ac.deadClicks) this.detectDeadClick(props)
      }, true)
    }

    // ── Change auto-capture (PII-safe — never the value) ───────────────────
    if (ac?.changes) {
      document.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement
        if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return
        if (el.type === 'password') return
        this.track('Input Changed', {
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          id: el.id || undefined,
          name: el.name || undefined,
          path: window.location.pathname,
        })
      }, true)
    }

    // ── Scroll-depth milestones ────────────────────────────────────────────
    if (ac?.scrollDepth) {
      const seen = new Set<number>()
      let ticking = false
      window.addEventListener('scroll', () => {
        if (ticking) return
        ticking = true
        setTimeout(() => {
          ticking = false
          const doc = document.documentElement
          const max = doc.scrollHeight - window.innerHeight
          if (max <= 0) return
          const pct = Math.round(((doc.scrollTop || window.scrollY) / max) * 100)
          for (const m of [25, 50, 75, 100]) {
            if (pct >= m && !seen.has(m)) {
              seen.add(m)
              this.track('Scroll Depth', { depth: m, path: window.location.pathname })
            }
          }
        }, 400)
      }, { passive: true })
    }

    // ── Form auto-capture: Form Started (first interaction) + Form Submitted ──
    if (ac?.formSubmissions) {
      const started = new WeakSet<HTMLFormElement>()
      const formMeta = (form: HTMLFormElement) => ({
        id: form.id || undefined,
        name: form.getAttribute('name') || undefined,
        action: form.action || undefined,
        fields: form.querySelectorAll('input, select, textarea').length,
        path: window.location.pathname,
      })
      document.addEventListener('focusin', (e) => {
        const el = e.target as HTMLElement
        const form = el?.closest?.('form') as HTMLFormElement | null
        if (form && !started.has(form)) {
          started.add(form)
          this.track('Form Started', formMeta(form))
        }
      }, true)
      document.addEventListener('submit', (e) => {
        const form = e.target as HTMLFormElement
        if (!form || form.tagName !== 'FORM') return
        this.track('Form Submitted', formMeta(form))
      }, true)
    }

    // ── Core Web Vitals (reported on page hide) ────────────────────────────
    if (ac?.webVitals !== false) this.setupWebVitals()

    // ── Uncaught errors + unhandled promise rejections ─────────────────────
    if (ac?.errors !== false) this.setupErrorTracking()
  }

  // setupErrorTracking captures uncaught JS errors and unhandled promise
  // rejections as "$exception" events (message/type/source/stack) — the
  // frustration/quality signal Amplitude/PostHog/Sentry record. Identical
  // messages are throttled to once per 5s to avoid floods.
  private errSeen = new Map<string, number>()
  private shouldSendErr(key: string): boolean {
    const now = Date.now()
    if (now - (this.errSeen.get(key) ?? 0) < 5000) return false
    this.errSeen.set(key, now)
    return true
  }
  private setupErrorTracking(): void {
    window.addEventListener('error', (e: ErrorEvent) => {
      const msg = e.message || 'error'
      if (!this.shouldSendErr('e:' + msg)) return
      const err = e.error as Error | undefined
      this.track('$exception', {
        message: String(msg).slice(0, 500),
        type: err?.name || 'Error',
        source: e.filename || undefined,
        lineno: e.lineno || undefined,
        colno: e.colno || undefined,
        stack: err?.stack ? String(err.stack).slice(0, 2000) : undefined,
        handled: false,
        path: window.location.pathname,
      })
    })
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; name?: string; stack?: string } | undefined
      const msg = reason?.message || String(e.reason ?? 'unhandledrejection')
      if (!this.shouldSendErr('r:' + msg)) return
      this.track('$exception', {
        message: String(msg).slice(0, 500),
        type: reason?.name || 'UnhandledRejection',
        stack: reason?.stack ? String(reason.stack).slice(0, 2000) : undefined,
        handled: false,
        path: window.location.pathname,
      })
    })
  }

  // setupWebVitals observes LCP/CLS and reports them (with FCP + load time) once,
  // on the first page-hide — matching Amplitude's "[Amplitude] Page Performance".
  private vitals: { lcp?: number; cls?: number; inp?: number } = {}
  private vitalsSent = false

  // Engagement time: accumulated FOREGROUND (visible) time on the current page —
  // GA4's "engagement time", far more accurate than first→last event for time on
  // page / session duration (which counts idle + background and undercounts the
  // last page). Emitted as a "Page Engagement" event per page on navigate/hide.
  private engagedMs = 0
  private engageStart = 0 // ms timestamp the current visible segment began; 0 = paused
  private engagePath = ''
  private accrueEngagement(): void {
    if (this.engageStart > 0) {
      this.engagedMs += Date.now() - this.engageStart
      this.engageStart = 0
    }
  }
  private flushEngagement(newPath: string): void {
    this.accrueEngagement()
    if (this.engagePath && this.engagedMs >= 1000) { // ignore sub-second blips
      this.track('Page Engagement', { engaged_ms: this.engagedMs, path: this.engagePath })
    }
    this.engagedMs = 0
    this.engagePath = newPath
    this.engageStart = document.visibilityState === 'visible' ? Date.now() : 0
  }
  private setupEngagement(): void {
    this.engagePath = window.location.pathname
    this.engageStart = document.visibilityState === 'visible' ? Date.now() : 0
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.accrueEngagement()
      else if (this.engageStart === 0) this.engageStart = Date.now()
    })
    window.addEventListener('pagehide', () => this.flushEngagement(window.location.pathname))
  }
  private setupWebVitals(): void {
    if (typeof PerformanceObserver === 'undefined') return
    try {
      new PerformanceObserver((list) => {
        const e = list.getEntries()
        const last = e[e.length - 1] as PerformanceEntry & { startTime: number }
        if (last) this.vitals.lcp = Math.round(last.startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) this.vitals.cls = (this.vitals.cls || 0) + entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
      // INP (Interaction to Next Paint): the worst interaction latency on the
      // page — Google's interactivity Core Web Vital (replaced FID).
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { duration: number; interactionId?: number })[]) {
          if (entry.interactionId && entry.duration > (this.vitals.inp || 0)) {
            this.vitals.inp = Math.round(entry.duration)
          }
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
    } catch { /* unsupported */ }

    const report = () => {
      if (this.vitalsSent) return
      this.vitalsSent = true
      const fcp = performance.getEntriesByName?.('first-contentful-paint')?.[0]?.startTime
      const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined
      this.track('Page Performance', {
        lcp_ms: this.vitals.lcp,
        cls: this.vitals.cls !== undefined ? Number(this.vitals.cls.toFixed(3)) : undefined,
        inp_ms: this.vitals.inp,
        fcp_ms: fcp ? Math.round(fcp) : undefined,
        load_ms: nav ? Math.round(nav.duration) : undefined,
        dom_interactive_ms: nav ? Math.round(nav.domInteractive) : undefined,
        path: window.location.pathname,
      })
    }
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') report() })
    window.addEventListener('pagehide', report)
  }

  // detectDeadClick fires "$dead_click" if, shortly after a click, nothing in the
  // DOM mutated and the URL didn't change — a strong "this looks clickable but
  // does nothing" frustration signal (same idea as PostHog/FullStory).
  private detectDeadClick(props: Record<string, unknown>): void {
    let mutated = false
    const urlBefore = window.location.href
    const obs = new MutationObserver(() => { mutated = true })
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    setTimeout(() => {
      obs.disconnect()
      if (!mutated && window.location.href === urlBefore) {
        this.track('$dead_click', { ...props, path: window.location.pathname })
      }
    }, 700)
  }

  private sessionEnded = false
  private setupPageUnload(): void {
    const leave = () => {
      // Session End boundary (emitted once when the page is actually unloaded).
      if (!this.sessionEnded && this.config.defaultTracking) {
        this.sessionEnded = true
        this.enqueue(this.buildEvent('session_end', {}))
      }
      this.flush(true) // beacon — reliable on tab-hide/close
    }
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(true) })
    window.addEventListener('pagehide', leave)
  }
}

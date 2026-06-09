export interface SDKConfig {
  apiKey: string
  serverUrl?: string
  flushIntervalMs?: number
  flushQueueSize?: number
  autoCapture?: {
    pageViews?: boolean
    clicks?: boolean
    formSubmissions?: boolean
    changes?: boolean      // <input>/<select> change events (no values — PII-safe)
    scrollDepth?: boolean  // 25/50/75/100% scroll milestones
    rageClicks?: boolean   // 3+ rapid clicks = frustration signal
    deadClicks?: boolean   // a click that changes nothing
    webVitals?: boolean    // LCP/CLS/FCP page-performance metrics
    errors?: boolean       // uncaught JS errors + unhandled promise rejections
  }
  defaultTracking?: boolean
  // When true, nothing is sent until setConsent(true) is called (GDPR opt-in).
  requireConsent?: boolean
  // Hostnames to link across (e.g. ['checkout.com']). Outbound links to these get
  // the device id appended so a multi-domain journey counts as one visitor.
  crossDomain?: string[]
  // Session replay (rrweb) — folded into this SDK so one init() does analytics
  // AND replay (like PostHog/Amplitude). rrweb is lazy-loaded from a CDN so it
  // never blocks page render. Off unless enabled.
  sessionReplay?: {
    enabled?: boolean
    sampleRate?: number        // 0..1 fraction of sessions to record (default 1)
    serverUrl?: string         // base for POST /replay; defaults to the SDK serverUrl
    maskAllInputs?: boolean    // default true — input values never recorded (PII-safe)
    maskTextSelector?: string  // CSS selector whose text is redacted (default '.mask')
    blockSelector?: string     // CSS selector skipped entirely (default '.no-record')
  }
}

export interface RevenueOptions {
  price: number
  quantity?: number
  productId?: string
  revenueType?: string   // e.g. purchase | refund | subscription
  currency?: string      // ISO 4217, default USD
  transactionId?: string // for revenue dedup
  properties?: Record<string, unknown>
}

export interface EventOptions {
  userId?: string
  deviceId?: string
  sessionId?: string
  time?: number
  platform?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  browser?: string
  browserVersion?: string
  country?: string
  region?: string
  city?: string
}

export interface Event {
  event_type: string
  user_id?: string
  device_id?: string
  session_id?: string
  insert_id?: string  // unique id for server-side dedup (exactly-once)
  event_id?: number   // per-device monotonic sequence for ordering
  time: number
  event_properties?: Record<string, unknown>
  user_properties?: Record<string, unknown>
  platform?: string
  os_name?: string
  os_version?: string
  device_type?: string
  browser?: string
  browser_version?: string
  country?: string
  region?: string
  city?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  link_code?: string
  referrer?: string
  sdk_version: string
}

export interface IdentifyOperation {
  $set?: Record<string, unknown>
  $setOnce?: Record<string, unknown>
  $append?: Record<string, unknown>
  $unset?: string[]
  $add?: Record<string, number>
}

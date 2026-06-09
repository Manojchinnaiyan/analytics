const SDK_VERSION = '0.1.0'
const DEFAULT_FLUSH_INTERVAL = 10_000
const DEFAULT_FLUSH_SIZE = 100

interface Config {
  apiKey: string
  serverUrl?: string
  flushIntervalMs?: number
  flushQueueSize?: number
}

interface Event {
  event_type: string
  user_id?: string
  device_id?: string
  session_id?: string
  time: number
  event_properties?: Record<string, unknown>
  user_properties?: Record<string, unknown>
  sdk_version: string
  platform: string
}

export class NodeClient {
  private apiKey: string
  private serverUrl: string
  private flushIntervalMs: number
  private flushQueueSize: number
  private queue: Event[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(config: Config) {
    this.apiKey = config.apiKey
    this.serverUrl = config.serverUrl ?? 'http://localhost:4000'
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL
    this.flushQueueSize = config.flushQueueSize ?? DEFAULT_FLUSH_SIZE
    this.startTimer()

    process.once('beforeExit', () => this.flush())
    process.once('SIGINT', () => this.flush())
    process.once('SIGTERM', () => this.flush())
  }

  track(
    eventType: string,
    properties?: Record<string, unknown>,
    opts?: { userId?: string; deviceId?: string; time?: number },
  ): void {
    this.queue.push({
      event_type: eventType,
      user_id: opts?.userId,
      device_id: opts?.deviceId,
      time: opts?.time ?? Date.now(),
      event_properties: properties ?? {},
      sdk_version: SDK_VERSION,
      platform: 'Node.js',
    })
    if (this.queue.length >= this.flushQueueSize) {
      this.flush()
    }
  }

  identify(userId: string, properties?: Record<string, unknown>): void {
    this.track('$identify', {}, { userId })
    if (properties) {
      this.queue[this.queue.length - 1].user_properties = properties
    }
  }

  async flush(): Promise<void> {
    if (!this.queue.length) return
    const batch = this.queue.splice(0)
    try {
      const res = await fetch(`${this.serverUrl}/v2/httpapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey, events: batch }),
      })
      if (!res.ok) {
        console.error(`[amplitude] flush failed: ${res.status}`)
        this.queue.unshift(...batch.slice(0, 500))
      }
    } catch (err) {
      console.error('[amplitude] flush error:', err)
      this.queue.unshift(...batch.slice(0, 500))
    }
  }

  shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    return this.flush()
  }

  private startTimer() {
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs)
    this.timer.unref?.()
  }
}

let _instance: NodeClient | null = null

export function init(config: Config): NodeClient {
  _instance = new NodeClient(config)
  return _instance
}

export function track(eventType: string, properties?: Record<string, unknown>, opts?: { userId?: string }): void {
  _instance?.track(eventType, properties, opts)
}

export function identify(userId: string, properties?: Record<string, unknown>): void {
  _instance?.identify(userId, properties)
}

export function flush(): Promise<void> {
  return _instance?.flush() ?? Promise.resolve()
}

export function shutdown(): Promise<void> {
  return _instance?.shutdown() ?? Promise.resolve()
}

export default { init, track, identify, flush, shutdown }

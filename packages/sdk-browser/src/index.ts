import { InspectUserClient } from './client'
import type { SDKConfig, EventOptions, IdentifyOperation, RevenueOptions } from './types'

export type { SDKConfig, EventOptions, IdentifyOperation, RevenueOptions }
export { InspectUserClient }

let _instance: InspectUserClient | null = null

export function init(config: SDKConfig): InspectUserClient | null {
  // SSR-safe: on the server (Next.js/Remix/etc.) there's no window/localStorage,
  // so do nothing. The exported helpers below are null-safe no-ops, and the app
  // can call init() again on the client without crashing the render.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }
  // Idempotent: re-mounting the analytics component (React route changes) must
  // not spin up a second client / session.
  if (_instance) {
    return _instance
  }
  _instance = new InspectUserClient(config)
  return _instance
}

export function track(eventType: string, properties?: Record<string, unknown>, options?: EventOptions): void {
  _instance?.track(eventType, properties, options)
}

export function identify(userId: string, properties?: Record<string, unknown>): void {
  _instance?.identify(userId, properties)
}

export function setUserProperties(ops: IdentifyOperation): void {
  _instance?.setUserProperties(ops)
}

export function revenue(r: RevenueOptions): void {
  _instance?.revenue(r)
}

export function setGroup(groupType: string, groupName: string | string[]): void {
  _instance?.setGroup(groupType, groupName)
}

export function setOptOut(optOut: boolean): void {
  _instance?.setOptOut(optOut)
}

export function setConsent(granted: boolean): void {
  _instance?.setConsent(granted)
}

export function logout(): void {
  _instance?.logout()
}

export function alias(userId: string): void {
  _instance?.alias(userId)
}

export function flags(): Promise<Record<string, { enabled: boolean; variant: string }>> {
  return _instance?.flags() ?? Promise.resolve({})
}

export function flush(): Promise<void> {
  return _instance?.flush() ?? Promise.resolve()
}

export function reset(): void {
  _instance?.reset()
}

export default { init, track, identify, setUserProperties, revenue, setGroup, setOptOut, setConsent, logout, alias, flags, flush, reset }

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

// Standard, platform-agnostic ecommerce events. ANY store (custom, WooCommerce,
// headless, etc.) calls these and the Ecommerce dashboard populates exactly like
// the Shopify pixel does — the property keys are what the Ecommerce section reads.
type Money = number | string
export const ecommerce = {
  productViewed: (p: { product: string; price?: Money; currency?: string } & Record<string, unknown>) =>
    track('Product Viewed', { ...p }),
  addedToCart: (p: { product: string; price?: Money; quantity?: number; currency?: string } & Record<string, unknown>) =>
    track('Product Added to Cart', { ...p }),
  checkoutStarted: (p: { revenue?: Money; currency?: string; items?: number } & Record<string, unknown>) =>
    track('Checkout Started', { ...p }),
  orderCompleted: (p: {
    revenue?: Money
    currency?: string
    order_id?: string
    products?: { product: string; quantity?: number; price?: Money }[]
  } & Record<string, unknown>) => {
    const { products, ...rest } = p
    track('Order Completed', { ...rest, items: products?.length })
    // One event per line item → product-level sales analytics.
    ;(products ?? []).forEach((li) =>
      track('Product Purchased', {
        product: li.product,
        quantity: li.quantity,
        price: li.price,
        currency: p.currency,
        revenue: Number(li.price ?? 0) * Number(li.quantity ?? 1),
      }),
    )
  },
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

export default { init, track, identify, setUserProperties, revenue, ecommerce, setGroup, setOptOut, setConsent, logout, alias, flags, flush, reset }

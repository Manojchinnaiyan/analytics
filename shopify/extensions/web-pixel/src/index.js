import { register } from '@shopify/web-pixels-extension'

// InspectUser Web Pixel — runs in Shopify's sandbox on the storefront + checkout,
// subscribes to the standard customer events, and forwards them to the
// InspectUser ingestion API. Settings (apiKey + ingestUrl) are injected by the
// app at install time via the webPixelCreate mutation.
register(({ analytics, settings }) => {
  const apiKey = settings.apiKey
  const ingestUrl = settings.ingestUrl
  if (!apiKey || !ingestUrl) return

  const endpoint = ingestUrl.replace(/\/$/, '') + '/v2/httpapi'

  function send(event, eventType, properties) {
    const body = JSON.stringify({
      api_key: apiKey,
      events: [
        {
          event_type: eventType,
          device_id: event.clientId, // Shopify's stable per-visitor id
          insert_id: event.id, // dedupe key
          time: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
          properties: {
            ...properties,
            url: event.context?.document?.location?.href,
            referrer: event.context?.document?.referrer,
            source: 'shopify',
          },
        },
      ],
    })
    // fetch with keepalive survives the page unload that follows a purchase.
    try {
      fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch (_e) {
      /* never break the storefront */
    }
  }

  analytics.subscribe('page_viewed', (e) => send(e, 'Page Viewed', {}))

  analytics.subscribe('product_viewed', (e) =>
    send(e, 'Product Viewed', {
      product: e.data?.productVariant?.product?.title,
      variant: e.data?.productVariant?.title,
      price: e.data?.productVariant?.price?.amount,
      currency: e.data?.productVariant?.price?.currencyCode,
    }),
  )

  analytics.subscribe('product_added_to_cart', (e) =>
    send(e, 'Product Added to Cart', {
      product: e.data?.cartLine?.merchandise?.product?.title,
      price: e.data?.cartLine?.merchandise?.price?.amount,
      quantity: e.data?.cartLine?.quantity,
      currency: e.data?.cartLine?.merchandise?.price?.currencyCode,
    }),
  )

  analytics.subscribe('search_submitted', (e) =>
    send(e, 'Search Submitted', { query: e.data?.searchResult?.query }),
  )

  analytics.subscribe('checkout_started', (e) =>
    send(e, 'Checkout Started', {
      revenue: e.data?.checkout?.totalPrice?.amount,
      currency: e.data?.checkout?.currencyCode,
      items: e.data?.checkout?.lineItems?.length,
    }),
  )

  analytics.subscribe('checkout_completed', (e) =>
    send(e, 'Order Completed', {
      // Revenue lands on the event so InspectUser's revenue/attribution works.
      revenue: e.data?.checkout?.totalPrice?.amount,
      currency: e.data?.checkout?.currencyCode,
      order_id: e.data?.checkout?.order?.id,
      items: e.data?.checkout?.lineItems?.length,
    }),
  )
})

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

  function send(event, eventType, properties, idSuffix) {
    const body = JSON.stringify({
      api_key: apiKey,
      events: [
        {
          event_type: eventType,
          device_id: event.clientId, // Shopify's stable per-visitor id
          insert_id: event.id + (idSuffix || ''), // dedupe key (unique per line item)
          time: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
          event_properties: {
            ...properties,
            url: event.context?.document?.location?.href,
            referrer: event.context?.document?.referrer,
            source: 'shopify',
          },
        },
      ],
    })
    // Send as a CORS "simple request" (text/plain) so the browser skips the
    // preflight — in the pixel sandbox the preflighted POST was being dropped.
    // The ingestion parses the JSON body regardless of Content-Type.
    try {
      fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
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

  analytics.subscribe('checkout_completed', (e) => {
    const co = e.data?.checkout
    send(e, 'Order Completed', {
      // Revenue lands on the event so InspectUser's revenue/attribution works.
      revenue: co?.totalPrice?.amount,
      currency: co?.currencyCode,
      order_id: co?.order?.id,
      items: co?.lineItems?.length,
    })
    // One event per purchased product → rank products by units sold + revenue.
    ;(co?.lineItems || []).forEach((li, i) =>
      send(
        e,
        'Product Purchased',
        {
          product: li.variant?.product?.title || li.title,
          variant: li.variant?.title,
          price: li.variant?.price?.amount,
          quantity: li.quantity,
          currency: co?.currencyCode,
          revenue: Number(li.variant?.price?.amount || 0) * Number(li.quantity || 1),
        },
        '-p' + i,
      ),
    )
  })
})

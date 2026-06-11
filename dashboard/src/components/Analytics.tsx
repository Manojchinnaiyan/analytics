'use client'

import { useEffect } from 'react'
import { init, track } from '@/lib/inspectuser.mjs'

// InspectUser dogfooding its own analytics. The write key is publishable (browser-safe).
const IU_KEY = 'amp_701416ec67e37bec6e402ad965463a1790b34495aa4397f62e67d758bb74ad35'

export function Analytics() {
  useEffect(() => {
    init({
      apiKey: IU_KEY,
      serverUrl: 'https://ingest.inspectuser.com',
      autoCapture: {
        pageViews: true,        // incl. SPA route changes (pushState/popstate)
        clicks: true,
        formSubmissions: true,
        scrollDepth: true,
        rageClicks: true,
        deadClicks: true,
        webVitals: true,
        errors: true,
      },
      sessionReplay: {
        enabled: true,
        serverUrl: 'https://api.inspectuser.com',
        sampleRate: 0.5,        // record half of sessions
        maskAllInputs: true,    // never capture typed values
      },
    })

    // Named events for tagged elements: data-iu-event + data-iu-* become props.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-iu-event]') as HTMLElement | null
      if (!el) return
      const name = el.getAttribute('data-iu-event')
      if (!name) return
      const props: Record<string, string> = {}
      for (const a of Array.from(el.attributes)) {
        if (a.name.startsWith('data-iu-') && a.name !== 'data-iu-event') {
          props[a.name.slice(8).replace(/-/g, '_')] = a.value
        }
      }
      track(name, props)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}

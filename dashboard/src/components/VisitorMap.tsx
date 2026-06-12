'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

// react-svg-worldmap renders client-side SVG — load it without SSR.
const WorldMap = dynamic(() => import('react-svg-worldmap').then(m => m.WorldMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-lg bg-[var(--color-surface-muted)]" />,
})

// Give every country a visible light-grey landmass; countries with visitors
// graduate from light to brand-blue by share of the max. (The library's default
// leaves no-data countries fully transparent, so only the borders show.)
function styleFunction(ctx: { countryValue?: number; minValue: number; maxValue: number }) {
  const has = ctx.countryValue !== undefined && ctx.countryValue !== null
  const range = (ctx.maxValue - ctx.minValue) || 1
  const t = has ? (Number(ctx.countryValue) - ctx.minValue) / range : 0
  return {
    fill: has ? '#0052F2' : '#e8edf4',
    fillOpacity: has ? 0.3 + 0.65 * t : 1,
    stroke: '#c2ccda',
    strokeWidth: 0.6,
    strokeOpacity: 1,
    cursor: 'pointer',
  }
}

// Choropleth of visitors by country (PostHog-style). Takes the web-analytics
// `countries` breakdown ({ value: 'US', visitors: N }).
export function VisitorMap({ countries }: { countries: { value: string; visitors: number }[] }) {
  const data = (countries ?? [])
    .filter(c => c?.value && /^[a-zA-Z]{2}$/.test(c.value))
    .map(c => ({ country: c.value.toLowerCase(), value: c.visitors }))

  if (data.length === 0) {
    return <p className="py-16 text-center type-body-13 text-[var(--color-text-subtle)]">No location data yet.</p>
  }

  return (
    <div className="flex justify-center [&_svg]:w-full [&_svg]:h-auto">
      <WorldMap
        color="#0052F2"
        backgroundColor="transparent"
        size="responsive"
        data={data as ComponentProps<typeof WorldMap>['data']}
        styleFunction={styleFunction as ComponentProps<typeof WorldMap>['styleFunction']}
        richInteraction
        valueSuffix=" visitors"
        tooltipBgColor="#0f172a"
        tooltipTextColor="#ffffff"
      />
    </div>
  )
}

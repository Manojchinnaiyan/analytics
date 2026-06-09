'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio, Users, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'
import { SocialIcon } from '@/components/SocialIcon'
import { ExportButton } from '@/components/ExportButton'

interface Bucket {
  value: string
  users: number
  conversions: number
  conv_rate: number
}

function BreakdownTable({ title, rows, showConv, icons }: { title: string; rows: Bucket[]; showConv: boolean; icons?: boolean }) {
  const max = rows[0]?.users ?? 1
  return (
    <Card>
      <h2 className="type-h3-16 text-[var(--color-text)] mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No data</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.value} className="flex items-center gap-3">
              <span className="type-small-body text-[var(--color-text)] w-40 truncate flex items-center gap-2">
                {icons && <SocialIcon source={r.value} className="h-4 w-4 flex-shrink-0" />}
                <span className="truncate">{r.value}</span>
              </span>
              <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                <div className="h-full accent-gradient rounded-full" style={{ width: `${(r.users / max) * 100}%` }} />
              </div>
              <span className="type-body-13 text-[var(--color-text-muted)] w-14 text-right">{r.users.toLocaleString()}</span>
              {showConv && (
                <span className="type-body-13 text-emerald-600 w-20 text-right">
                  {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })} ({(r.conv_rate * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function AcquisitionPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [conversion, setConversion] = useState('')
  const [model, setModel] = useState('first_touch')
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading) return
    seeded.current = true
    // prefer a conversion-like event, else the top event
    const conv = events.find(e => /purchase|order|checkout|complete|paid|subscribe/i.test(e)) ?? events[0]
    if (conv) setConversion(conv)
  }, [events, eventsLoading])

  const { data, isLoading } = useQuery({
    queryKey: ['attribution', projectId, conversion, model],
    queryFn: () => api.attribution(projectId, conversion, model),
    enabled: !!projectId,
    refetchInterval: 15_000, // pick up new channel clicks live
  })

  const showConv = !!conversion
  const overallRate = data?.total_users > 0 ? (data.total_conversions / data.total_users) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Acquisition"
        subtitle="Where your users come from — attribution by channel, source & campaign"
        actions={
          <ExportButton
            filename="acquisition"
            rows={[
              ...(data?.channels ?? []).map((r: Bucket) => ({ dimension: 'channel', ...r })),
              ...(data?.sources ?? []).map((r: Bucket) => ({ dimension: 'source', ...r })),
              ...(data?.campaigns ?? []).map((r: Bucket) => ({ dimension: 'campaign', ...r })),
              ...(data?.referrers ?? []).map((r: Bucket) => ({ dimension: 'referrer', ...r })),
            ]}
          />
        }
      />

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Conversion event</span>
            <EventSelect value={conversion} onChange={setConversion} placeholder="(optional) pick a conversion" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Attribution model</span>
            <Select
              value={model}
              onChange={setModel}
              options={[
                { value: 'first_touch',    label: 'First touch' },
                { value: 'last_touch',     label: 'Last touch' },
                { value: 'linear',         label: 'Linear' },
                { value: 'time_decay',     label: 'Time decay' },
                { value: 'position_based', label: 'Position-based (U)' },
              ]}
            />
          </div>
          <p className="type-body-13 text-[var(--color-text-subtle)] pb-2 max-w-md">
            {{
              first_touch:    'Full credit to each user’s first-ever source.',
              last_touch:     'Full credit to each user’s most recent source.',
              linear:         'Conversion credit split equally across every touch on the path.',
              time_decay:     'More credit to touches nearer the conversion (7-day half-life).',
              position_based: '40% to the first touch, 40% to the last, 20% split among the middle (U-shaped).',
            }[model]}
            {(model !== 'first_touch' && model !== 'last_touch') && ' Needs a conversion event.'}
          </p>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Attributed users" value={data?.total_users ?? 0} icon={Users} tone="indigo" loading={isLoading} />
        <StatCard label={`Conversions (${conversion || 'none'})`} value={data?.total_conversions ?? 0} icon={Target} tone="emerald" loading={isLoading} />
        <StatCard label="Overall conv. rate" value={`${(overallRate * 100).toFixed(1)}%`} icon={Radio} tone="violet" loading={isLoading} />
      </div>

      {isLoading ? (
        <Card><div className="h-40 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div></Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <BreakdownTable title="Channels" rows={data?.channels ?? []} showConv={showConv} icons />
          <BreakdownTable title="Sources (utm_source)" rows={data?.sources ?? []} showConv={showConv} icons />
          <BreakdownTable title="Campaigns (utm_campaign)" rows={data?.campaigns ?? []} showConv={showConv} />
          <BreakdownTable title="Referrers" rows={data?.referrers ?? []} showConv={showConv} />
        </div>
      )}
    </div>
  )
}

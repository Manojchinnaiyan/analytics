'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Skeleton, TableSkeleton, PageSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { Radio, Users, Target, GitCompare } from 'lucide-react'
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

const COMPARE_MODELS = [
  { value: 'first_touch',    label: 'First' },
  { value: 'last_touch',     label: 'Last' },
  { value: 'linear',         label: 'Linear' },
  { value: 'time_decay',     label: 'Time decay' },
  { value: 'position_based', label: 'Position' },
]

// Side-by-side credit per channel across all five models — the clearest way to
// see how multi-touch redistributes credit vs. naive first/last-touch.
function ModelComparison({ projectId, conversion }: { projectId: string; conversion: string }) {
  const [open, setOpen] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: ['attribution-compare', projectId, conversion],
    queryFn: async () => {
      const res = await Promise.all(COMPARE_MODELS.map(m => api.attribution(projectId, conversion, m.value)))
      return COMPARE_MODELS.map((m, i) => ({
        model: m.value,
        total: (res[i].total_conversions as number) || 0,
        channels: (res[i].channels ?? []) as Bucket[],
      }))
    },
    enabled: open && !!projectId && !!conversion,
  })

  // Union of channels, ordered by their total credit across models.
  const channels = useMemo(() => {
    const tot: Record<string, number> = {}
    data?.forEach(d => d.channels.forEach(c => { tot[c.value] = (tot[c.value] ?? 0) + c.conversions }))
    return Object.keys(tot).sort((a, b) => tot[b] - tot[a])
  }, [data])

  // model → channel → share of that model's conversions (0–1).
  const share = (model: string, ch: string) => {
    const md = data?.find(d => d.model === model)
    if (!md || md.total <= 0) return 0
    return (md.channels.find(c => c.value === ch)?.conversions ?? 0) / md.total
  }

  return (
    <Card>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-[#0052F2]" />
          <div>
            <h2 className="type-h3-16 text-[var(--color-text)]">Compare attribution models</h2>
            <p className="type-body-13 text-[var(--color-text-subtle)] mt-0.5">See how each channel’s credit shifts across all five models.</p>
          </div>
        </div>
        <span className="type-caption text-[#0052F2] flex-shrink-0">{open ? 'Hide' : 'Compare'}</span>
      </button>

      {open && (
        !conversion ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">Pick a conversion event above to compare models.</p>
        ) : isFetching ? (
          <div className="mt-4"><TableSkeleton rows={5} /></div>
        ) : channels.length === 0 ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No attributed conversions yet.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] type-caption text-[var(--color-text-muted)]">
                  <th className="text-left py-2 pr-3">Channel</th>
                  {COMPARE_MODELS.map(m => <th key={m.value} className="text-right py-2 px-2">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {channels.map(ch => {
                  // Highlight the model that gives this channel the most credit.
                  const best = COMPARE_MODELS.reduce((b, m) => share(m.value, ch) > share(b, ch) ? m.value : b, COMPARE_MODELS[0].value)
                  return (
                    <tr key={ch} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2.5 pr-3 type-small-body text-[var(--color-text)]">{ch}</td>
                      {COMPARE_MODELS.map(m => {
                        const s = share(m.value, ch)
                        return (
                          <td key={m.value} className="py-2.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 bg-[#EEF3FD] rounded-full h-1.5 overflow-hidden hidden sm:block">
                                <div className="h-full accent-gradient rounded-full" style={{ width: `${s * 100}%` }} />
                              </div>
                              <span className={`type-body-13 tabular-nums w-9 ${m.value === best ? 'text-[#0052F2] font-medium' : 'text-[var(--color-text-muted)]'}`}>{(s * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-3">Each column shows the share of conversions a model credits to that channel. <span className="text-[#0052F2]">Blue</span> marks the model that values the channel most — e.g. introducer channels look weak under last-touch but strong under first-touch or position-based.</p>
          </div>
        )
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

  if (isLoading) return <PageSkeleton />

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
        <Card><div className="h-40 p-1"><Skeleton className="h-full w-full rounded-lg" /></div></Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <BreakdownTable title="Channels" rows={data?.channels ?? []} showConv={showConv} icons />
          <BreakdownTable title="Sources (utm_source)" rows={data?.sources ?? []} showConv={showConv} icons />
          <BreakdownTable title="Campaigns (utm_campaign)" rows={data?.campaigns ?? []} showConv={showConv} />
          <BreakdownTable title="Referrers" rows={data?.referrers ?? []} showConv={showConv} />
        </div>
      )}

      <ModelComparison projectId={projectId} conversion={conversion} />
    </div>
  )
}

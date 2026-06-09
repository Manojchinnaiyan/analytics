'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Rocket, Users, Target, Timer } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'

interface Step { event_type: string; users: number; conversion_rate: number; step_conversion_rate: number; drop_off: number; median_seconds: number }
interface Cohort { week: string; new_users: number; activated: number }
interface Seg { value: string; new_users: number; activated: number }
interface TTV { median_seconds: number; p25_seconds: number; p90_seconds: number; count: number; histogram: { label: string; count: number }[] }
interface OnboardingData { new_users: number; activated: number; activation_rate: number; ttv_days: number; steps: Step[]; ttv: TTV; cohorts: Cohort[]; breakdown: Seg[] }

const TTV_WINDOWS = [1, 7, 30]
const BREAKDOWNS = [
  { value: '', label: 'No breakdown' },
  { value: 'utm_source', label: 'Acquisition source' },
  { value: 'utm_medium', label: 'Channel' },
  { value: 'country', label: 'Country' },
  { value: 'platform', label: 'Platform' },
  { value: 'device_type', label: 'Device' },
  { value: 'browser', label: 'Browser' },
]

function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h}h ${m}m` : `${h}h` }
  const d = Math.floor(sec / 86400), h = Math.round((sec % 86400) / 3600)
  return h ? `${d}d ${h}h` : `${d}d`
}

export default function OnboardingPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [steps, setSteps] = useState<{ id: string; event_type: string }[]>([])
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading) return
    seeded.current = true
    const entry = events.find(e => /sign.?up|account|register|start/i.test(e)) ?? events[0]
    const milestone = events.find(e => /purchase|order|complete|paid|subscribe|activ/i.test(e)) ?? events[1] ?? events[0]
    const picks = [entry, milestone].filter(Boolean) as string[]
    while (picks.length < 2) picks.push('')
    setSteps(picks.map(e => ({ id: crypto.randomUUID(), event_type: e })))
  }, [events, eventsLoading])

  const [days, setDays] = useState(30)
  const [ttvDays, setTtvDays] = useState(7)
  const [breakdown, setBreakdown] = useState('')
  const { start, end } = rangeFromDays(days)

  const stepEvents = steps.map(s => s.event_type).filter(Boolean)
  const { data, isLoading } = useQuery<OnboardingData>({
    queryKey: ['onboarding', projectId, stepEvents, start, end, ttvDays, breakdown],
    queryFn: () => api.onboarding({ project_id: projectId, steps: stepEvents, start, end, ttv_days: ttvDays, breakdown: breakdown || undefined }),
    enabled: !!projectId && stepEvents.length >= 1,
  })

  const newUsers = data?.new_users ?? 0
  const activated = data?.activated ?? 0
  const rate = data?.activation_rate ?? 0
  const ttv = data?.ttv
  const result = data?.steps ?? []
  const cohorts = data?.cohorts ?? []
  const segs = (data?.breakdown ?? []).map(s => ({ ...s, rate: s.new_users > 0 ? s.activated / s.new_users : 0 }))

  const cohortChart = cohorts.map(c => ({ week: c.week.slice(5), rate: c.new_users > 0 ? (c.activated / c.new_users) * 100 : 0, new_users: c.new_users }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Onboarding"
        subtitle={`What share of NEW users reach value within ${ttvDays} day${ttvDays > 1 ? 's' : ''} of signing up`}
        actions={<DateRangePicker days={days} onChange={setDays} />}
      />

      {/* Controls */}
      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="type-h3-16 text-[var(--color-text)]">Activation path</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="type-caption text-[var(--color-text-muted)]">Activate within</span>
              <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
                {TTV_WINDOWS.map(w => (
                  <button key={w} onClick={() => setTtvDays(w)} className={`px-2.5 py-1 type-body-13 transition-colors ${ttvDays === w ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
                    {w}d
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="type-caption text-[var(--color-text-muted)]">Break down by</span>
              <Select value={breakdown} onChange={setBreakdown} options={BREAKDOWNS} className="w-[170px]" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#0052F2] text-white type-caption flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <EventSelect value={step.event_type} onChange={(v) => { const next = [...steps]; next[i] = { ...step, event_type: v }; setSteps(next) }} />
              {steps.length > 1 && (
                <button onClick={() => setSteps(steps.filter(s => s.id !== step.id))} className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#DE0202] transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {i < steps.length - 1 && <span className="text-[var(--color-text-subtle)] px-1">→</span>}
            </div>
          ))}
          <button onClick={() => setSteps([...steps, { id: crypto.randomUUID(), event_type: '' }])} className="flex items-center gap-1 type-link text-[#0052F2] hover:text-[#0C3FA7] ml-1">
            <Plus className="h-4 w-4" /> Add step
          </button>
        </div>
        <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">Step 1 = signup/entry. Cohort = users whose first-ever event falls in the selected range; activation is measured within {ttvDays}d of each user&apos;s own signup.</p>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Activation rate" value={`${(rate * 100).toFixed(1)}%`} icon={Rocket} loading={isLoading} hint={`${activated.toLocaleString()} of ${newUsers.toLocaleString()} new users`} />
        <StatCard label="New users (signed up)" value={newUsers} icon={Users} loading={isLoading} hint="first seen in range" />
        <StatCard label="Activated" value={activated} icon={Target} loading={isLoading} hint={`reached ${stepEvents.at(-1) ?? 'milestone'} ≤${ttvDays}d`} />
        <StatCard label="Median time to value" value={fmtDuration(ttv?.median_seconds ?? 0)} icon={Timer} loading={isLoading} hint={ttv?.count ? `across ${ttv.count.toLocaleString()} activated` : 'no activations yet'} />
      </div>

      {/* Funnel */}
      <Card>
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Activation funnel (within {ttvDays}d of signup)</h2>
        {isLoading ? (
          <div className="h-40 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : result.length === 0 ? (
          <div className="h-40 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Pick events that exist in your project above.</div>
        ) : (
          <FunnelChart steps={result} />
        )}
      </Card>

      {/* Time to value + Activation over time */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0">
          <h2 className="type-h3-16 text-[var(--color-text)] mb-1">Time to value</h2>
          <p className="type-body-13 text-[var(--color-text-muted)] mb-4">How long from signup to activation.</p>
          {ttv && ttv.count > 0 ? (
            <>
              <div className="flex gap-6 mb-4">
                <div><p className="type-body-12-400 text-[var(--color-text-subtle)]">p25</p><p className="type-h3-16 text-[var(--color-text)]">{fmtDuration(ttv.p25_seconds)}</p></div>
                <div><p className="type-body-12-400 text-[var(--color-text-subtle)]">median</p><p className="type-h3-16 text-[#0052F2]">{fmtDuration(ttv.median_seconds)}</p></div>
                <div><p className="type-body-12-400 text-[var(--color-text-subtle)]">p90</p><p className="type-h3-16 text-[var(--color-text)]">{fmtDuration(ttv.p90_seconds)}</p></div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={ttv.histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }} />
                  <Bar dataKey="count" name="Users" fill="#0052F2" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center type-body-13 text-[var(--color-text-subtle)]">No activations in this range.</div>
          )}
        </Card>

        <Card className="min-w-0">
          <h2 className="type-h3-16 text-[var(--color-text)] mb-1">Activation rate over time</h2>
          <p className="type-body-13 text-[var(--color-text-muted)] mb-4">By signup week — is onboarding improving?</p>
          {cohortChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cohortChart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={40} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }} formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Line type="monotone" dataKey="rate" name="Activation %" stroke="#0052F2" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center type-body-13 text-[var(--color-text-subtle)]">No signups in this range.</div>
          )}
        </Card>
      </div>

      {/* Segment breakdown */}
      {breakdown && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Activation by {BREAKDOWNS.find(b => b.value === breakdown)?.label.toLowerCase()}</h2>
          {segs.length === 0 ? (
            <p className="type-body-13 text-[var(--color-text-subtle)] py-6 text-center">No data for this breakdown.</p>
          ) : (
            <div className="space-y-3">
              {segs.map(s => (
                <div key={s.value} className="flex items-center gap-3">
                  <span className="type-small-body text-[var(--color-text)] w-40 truncate" title={s.value}>{s.value}</span>
                  <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-[#0052F2] rounded-full" style={{ width: `${s.rate * 100}%` }} />
                  </div>
                  <span className="type-body-13 text-[var(--color-text)] w-12 text-right">{(s.rate * 100).toFixed(0)}%</span>
                  <span className="type-body-12-400 text-[var(--color-text-subtle)] w-24 text-right">{s.activated}/{s.new_users} users</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

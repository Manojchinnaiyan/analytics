'use client'

import { useState, useEffect, useRef } from 'react'
import { Skeleton, TableSkeleton, PageSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Target, Clock, Ban } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { FunnelChart, fmtDuration } from '@/components/charts/FunnelChart'
import { FunnelHistogram } from '@/components/charts/FunnelHistogram'
import { EventSelect } from '@/components/EventSelect'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Select'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'
import { FilterBar, stripFilters } from '@/components/FilterBar'
import { CohortSelect } from '@/components/CohortSelect'
import type { Filter } from '@/lib/api'

interface BreakdownGroup { value: string; users: number[]; conversion_rate: number }
type Tab = 'conversion' | 'time' | 'trends' | 'segmentation'

const TABS: { id: Tab; label: string }[] = [
  { id: 'conversion', label: 'Conversion' },
  { id: 'time', label: 'Time to convert' },
  { id: 'trends', label: 'Trends' },
  { id: 'segmentation', label: 'Segmentation' },
]

export default function FunnelsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const router = useRouter()
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [steps, setSteps] = useState<{ id: string; event_type: string }[]>([])
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading) return
    seeded.current = true
    const picks = events.slice(0, 3)
    while (picks.length < 2) picks.push('')
    setSteps(picks.map(e => ({ id: crypto.randomUUID(), event_type: e })))
  }, [events, eventsLoading])

  const [rangeDays, setRangeDays] = useState(30)
  const [windowValue, setWindowValue] = useState(7)
  const [windowUnit, setWindowUnit] = useState<'minute' | 'hour' | 'day'>('day')
  const [mode, setMode] = useState<'ordered' | 'strict' | 'any'>('ordered')
  const [countedBy, setCountedBy] = useState<'users' | 'sessions'>('users')
  const [breakdown, setBreakdown] = useState('')
  const [exclusions, setExclusions] = useState<string[]>([])
  const [filters, setFilters] = useState<(Filter & { _k?: number })[]>([])
  const [cohortId, setCohortId] = useState('')
  const [tab, setTab] = useState<Tab>('conversion')

  const { start, end } = rangeFromDays(rangeDays)
  const cleanFilters = stripFilters(filters)
  const validSteps = steps.filter(s => s.event_type)
  const cleanExclusions = exclusions.filter(Boolean)

  const { data, isLoading } = useQuery({
    queryKey: ['funnel', projectId, steps, rangeDays, windowValue, windowUnit, mode, countedBy, breakdown, cleanExclusions, cleanFilters, cohortId],
    queryFn: () => api.funnel({
      project_id: projectId,
      steps: validSteps.map(({ event_type }) => ({ event_type })),
      start, end,
      window_value: windowValue, window_unit: windowUnit,
      mode, counted_by: countedBy, breakdown: breakdown || undefined,
      exclusions: cleanExclusions.length ? cleanExclusions : undefined,
      filters: cleanFilters, cohort_id: cohortId || undefined,
    }),
    enabled: !!projectId && validSteps.length >= 2,
  })

  const resultSteps = data?.steps ?? []
  const trend = data?.trend ?? []
  const groups: BreakdownGroup[] = data?.breakdown ?? []
  const unitWord = countedBy === 'sessions' ? 'sessions' : 'users'

  // Drop-off → analyze: jump to Paths starting from the step users dropped at.
  function analyzeDropoff(eventType: string) {
    router.push(`/paths?from=${encodeURIComponent(eventType)}`)
  }

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <PageHeader title="Funnel Analysis" subtitle="Conversion, drop-off, time-to-convert, trends and segments through a sequence of events" />

      {/* Builder */}
      <Card>
        <div className="space-y-2.5 mb-5">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-[#0052F2] text-white type-caption flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <div className="flex-1">
                <EventSelect value={step.event_type} onChange={(v) => { const next = [...steps]; next[i] = { ...step, event_type: v }; setSteps(next) }} />
              </div>
              {steps.length > 2 && (
                <button onClick={() => setSteps(steps.filter(s => s.id !== step.id))} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202] transition-colors"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          <button onClick={() => setSteps([...steps, { id: crypto.randomUUID(), event_type: '' }])} className="flex items-center gap-1.5 type-link text-[#0052F2] hover:text-[#0C3FA7] pl-10"><Plus className="h-4 w-4" /> Add step</button>
        </div>

        {/* Exclusions */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 type-caption text-[var(--color-text-muted)] mb-2"><Ban className="h-3.5 w-3.5" /> Exclude users who did</div>
          {exclusions.map((ex, i) => (
            <div key={i} className="flex items-center gap-3 mb-2">
              <div className="flex-1 max-w-md"><EventSelect value={ex} onChange={(v) => { const next = [...exclusions]; next[i] = v; setExclusions(next) }} placeholder="event to exclude" /></div>
              <button onClick={() => setExclusions(exclusions.filter((_, j) => j !== i))} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setExclusions([...exclusions, ''])} className="flex items-center gap-1.5 type-link text-[#0052F2] hover:text-[#0C3FA7]"><Plus className="h-4 w-4" /> Add exclusion</button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4 border-t border-[var(--color-border)] pt-4">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Counted by</span>
            <Select value={countedBy} onChange={(v) => setCountedBy(v as typeof countedBy)} options={[{ value: 'users', label: 'Unique users' }, { value: 'sessions', label: 'Sessions' }]} className="w-[140px]" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Conversion window</span>
            <div className="flex items-center gap-2">
              <input type="number" min={1} className="ctrl w-20" value={windowValue} onChange={e => setWindowValue(Math.max(1, Number(e.target.value)))} />
              <Select value={windowUnit} onChange={(v) => setWindowUnit(v as typeof windowUnit)} options={[{ value: 'minute', label: 'minutes' }, { value: 'hour', label: 'hours' }, { value: 'day', label: 'days' }]} className="w-[120px]" />
            </div>
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Order</span>
            <Select value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: 'ordered', label: 'This order' }, { value: 'strict', label: 'Strict order' }, { value: 'any', label: 'Any order' }]} className="w-[140px]" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Break down by</span>
            <input className="ctrl w-[150px]" value={breakdown} onChange={e => setBreakdown(e.target.value)} placeholder="(none) e.g. country" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Date range</span>
            <DateRangePicker days={rangeDays} onChange={setRangeDays} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Cohort</span>
            <CohortSelect value={cohortId} onChange={setCohortId} />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] mt-4 pt-4">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Overall conversion" value={`${((data?.overall_conversion ?? 0) * 100).toFixed(1)}%`} icon={Target} loading={isLoading} hint={`${resultSteps[0]?.event_type || ''} → ${resultSteps[resultSteps.length - 1]?.event_type || ''}`} />
        <StatCard label="Median time to convert" value={fmtDuration(data?.median_convert_seconds ?? 0)} icon={Clock} loading={isLoading} hint={`p25 ${fmtDuration(data?.p25_seconds ?? 0)} · p90 ${fmtDuration(data?.p90_seconds ?? 0)}`} />
        <StatCard label={`Entered (${unitWord})`} value={resultSteps[0]?.users ?? 0} icon={Target} loading={isLoading} />
        <StatCard label={`Completed (${unitWord})`} value={resultSteps[resultSteps.length - 1]?.users ?? 0} icon={Target} loading={isLoading} />
      </div>

      {/* Tabs */}
      <Card>
        <div className="flex gap-1 border-b border-[var(--color-border)] mb-5 -mt-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 type-small-body border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#0052F2] text-[#0052F2]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="h-72 p-1"><Skeleton className="h-full w-full rounded-lg" /></div>
        ) : tab === 'conversion' ? (
          <>
            <FunnelChart steps={resultSteps} />
            {resultSteps.length > 1 && (
              <div className="mt-5 pt-4 border-t border-[var(--color-border)] flex flex-wrap gap-2">
                <span className="type-caption text-[var(--color-text-muted)] self-center mr-1">Analyze who dropped off:</span>
                {resultSteps.slice(0, -1).map((s: { event_type: string }, i: number) => (
                  <button key={i} onClick={() => analyzeDropoff(s.event_type)} className="px-2.5 py-1 type-body-12-400 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[#0052F2]">
                    after {s.event_type} →
                  </button>
                ))}
              </div>
            )}
          </>
        ) : tab === 'time' ? (
          <div>
            <div className="flex flex-wrap gap-6 mb-4 type-body-13 text-[var(--color-text-muted)]">
              <span>25th percentile: <b className="text-[var(--color-text)]">{fmtDuration(data?.p25_seconds ?? 0)}</b></span>
              <span>Median: <b className="text-[var(--color-text)]">{fmtDuration(data?.median_convert_seconds ?? 0)}</b></span>
              <span>90th percentile: <b className="text-[var(--color-text)]">{fmtDuration(data?.p90_seconds ?? 0)}</b></span>
            </div>
            <FunnelHistogram buckets={data?.time_histogram ?? []} />
          </div>
        ) : tab === 'trends' ? (
          trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'conversion']} />
                <Line type="monotone" dataKey="conversion_rate" name="Conversion" stroke="#0052F2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Not enough days of data to show a trend</div>
          )
        ) : (
          // segmentation
          breakdown && groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map(g => {
                const entered = g.users[0] ?? 0
                const completed = g.users[g.users.length - 1] ?? 0
                return (
                  <div key={g.value} className="flex items-center gap-3">
                    <span className="w-40 truncate type-small-body text-[var(--color-text)]" title={g.value}>{g.value}</span>
                    <div className="flex-1 bg-[#EEF3FD] rounded-full h-2.5 overflow-hidden">
                      <div className="h-full accent-gradient rounded-full" style={{ width: `${g.conversion_rate * 100}%` }} />
                    </div>
                    <span className="w-16 text-right type-small-body text-[var(--color-text)]">{(g.conversion_rate * 100).toFixed(1)}%</span>
                    <span className="w-32 text-right type-body-12-400 text-[var(--color-text-subtle)]">{completed.toLocaleString()} / {entered.toLocaleString()} {unitWord}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)] text-center px-6">
              Set a <span className="mx-1 type-caption text-[var(--color-text)]">Break down by</span> property above (e.g. country, platform) to compare conversion across segments.
            </div>
          )
        )}
      </Card>
    </div>
  )
}

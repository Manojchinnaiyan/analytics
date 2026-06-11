'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton, PageSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { Sigma } from 'lucide-react'
import { SegmentationChart } from '@/components/charts/SegmentationChart'
import { EventSelect } from '@/components/EventSelect'
import { api } from '@/lib/api'
import { evalFormula } from '@/lib/formula'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'

interface Point { date: string; value: number }
type MetricRow = { key: string; event_type: string; metric: string }

const METRICS = [
  { value: 'totals', label: 'Total events' },
  { value: 'uniques', label: 'Unique users' },
]

export default function FormulaPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { events } = useTopEvents()
  const [days, setDays] = useState(30)
  const [metrics, setMetrics] = useState<MetricRow[]>([
    { key: 'A', event_type: '', metric: 'uniques' },
    { key: 'B', event_type: '', metric: 'uniques' },
  ])
  const [formula, setFormula] = useState('A / B * 100')
  const [label, setLabel] = useState('Conversion %')
  const { start, end } = rangeFromDays(days)

  // Seed A/B with the first two real events once.
  useState(() => {
    if (events.length >= 2) {
      setMetrics([
        { key: 'A', event_type: events[1], metric: 'uniques' },
        { key: 'B', event_type: events[0], metric: 'uniques' },
      ])
    }
  })

  const ready = metrics.every(m => m.event_type)
  const { data, isLoading, error } = useQuery({
    queryKey: ['formula', projectId, metrics, days],
    queryFn: () => api.formula({ project_id: projectId, start, end, granularity: 'day', metrics }),
    enabled: !!projectId && ready,
  })

  // Combine the named series per date via the formula.
  let combined: Point[] = []
  let formulaError = ''
  if (data?.series) {
    const dates = new Set<string>()
    const byKey: Record<string, Record<string, number>> = {}
    for (const m of metrics) {
      byKey[m.key] = {}
      for (const p of (data.series[m.key] ?? []) as Point[]) { byKey[m.key][p.date] = p.value; dates.add(p.date) }
    }
    try {
      combined = Array.from(dates).sort().map(date => {
        const vars: Record<string, number> = {}
        for (const m of metrics) vars[m.key] = byKey[m.key][date] ?? 0
        return { date, value: Number(evalFormula(formula, vars).toFixed(2)) }
      })
    } catch (e) { formulaError = (e as Error).message }
  }

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <PageHeader title="Formula Metrics" subtitle="Combine metrics into a ratio or expression — e.g. conversion = A / B × 100" />

      <Card>
        <div className="space-y-2.5 mb-4">
          {metrics.map((m, i) => (
            <div key={m.key} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-md bg-[#EEF3FD] text-[#0052F2] type-caption flex items-center justify-center flex-shrink-0">{m.key}</span>
              <div className="flex-1"><EventSelect value={m.event_type} onChange={(v) => { const n = [...metrics]; n[i] = { ...m, event_type: v }; setMetrics(n) }} /></div>
              <Select value={m.metric} onChange={(v) => { const n = [...metrics]; n[i] = { ...m, metric: v }; setMetrics(n) }} options={METRICS} className="w-[150px]" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4 border-t border-[var(--color-border)] pt-4">
          <div className="flex-1 min-w-[200px]">
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Formula (use A, B, +, −, ×, ÷, parentheses)</span>
            <input className="ctrl w-full font-mono" value={formula} onChange={e => setFormula(e.target.value)} placeholder="A / B * 100" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Label</span>
            <input className="ctrl w-44" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Date range</span>
            <DateRangePicker days={days} onChange={setDays} />
          </div>
        </div>
        {(formulaError || error) && <p className="type-body-13 text-[#DE0202] mt-2">{formulaError || 'Query failed'}</p>}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4"><Sigma className="h-4 w-4 text-[#0052F2]" /><h2 className="type-h3-16 text-[var(--color-text)]">{label}</h2></div>
        {!ready
          ? <div className="h-80 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Pick events for A and B above.</div>
          : isLoading
            ? <div className="h-80 p-1"><Skeleton className="h-full w-full rounded-lg" /></div>
            : <SegmentationChart data={combined} metric={label} />}
      </Card>
    </div>
  )
}

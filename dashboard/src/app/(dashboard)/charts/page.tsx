'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { SegmentationChart } from '@/components/charts/SegmentationChart'
import { EventSelect } from '@/components/EventSelect'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'
import { FilterBar, stripFilters } from '@/components/FilterBar'
import { CohortSelect } from '@/components/CohortSelect'
import { ExportButton } from '@/components/ExportButton'
import type { Filter } from '@/lib/api'

type Metric = 'totals' | 'uniques' | 'frequency' | 'sum' | 'average' | 'median' | 'p90' | 'p95' | 'p99'

function ChartsInner() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const chartIdParam = searchParams.get('chart')
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [eventType, setEventType] = useState('')
  const [metric, setMetric] = useState<Metric>('totals')
  const [property, setProperty] = useState('revenue')
  const [groupBy, setGroupBy] = useState('')
  const [days, setDays] = useState(30)
  const [filters, setFilters] = useState<(Filter & { _k?: number })[]>([])
  const [cohortId, setCohortId] = useState('')
  const [compare, setCompare] = useState(false)

  // Seed the event from the project's top events (unless we're loading a saved chart).
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading || chartIdParam) return
    seeded.current = true
    if (events[0]) setEventType(events[0])
  }, [events, eventsLoading, chartIdParam])

  // Open a saved chart in the builder: ?chart=<id> loads its config once.
  const loaded = useRef(false)
  useEffect(() => {
    if (!chartIdParam || loaded.current || !projectId) return
    loaded.current = true
    api.dashboards(projectId).then(d => {
      const chart = (d?.charts ?? []).find((ch: { id: string }) => ch.id === chartIdParam)
      const cfg = chart?.config
      if (!cfg) return
      if (cfg.event_type) setEventType(cfg.event_type)
      if (cfg.metric) setMetric(cfg.metric)
      if (cfg.property) setProperty(cfg.property)
      if (cfg.group_by) setGroupBy(cfg.group_by)
      if (cfg.days) setDays(cfg.days)
    }).catch(() => {})
  }, [chartIdParam, projectId])

  const { start, end } = rangeFromDays(days)
  const needsProperty = ['sum', 'average', 'median', 'p90', 'p95', 'p99'].includes(metric)
  const cleanFilters = stripFilters(filters)
  // Compare is unavailable when broken down by a property.
  const compareOn = compare && !groupBy

  const { data, isLoading } = useQuery({
    queryKey: ['segmentation', projectId, eventType, metric, property, groupBy, days, cleanFilters, cohortId, compareOn],
    queryFn: () => api.segmentation({
      project_id: projectId, event_type: eventType, start, end, granularity: 'day',
      metric, property: needsProperty ? property : undefined, group_by: groupBy || undefined,
      filters: cleanFilters, cohort_id: cohortId || undefined, compare: compareOn,
    }),
    enabled: !!projectId,
  })

  const { data: annData } = useQuery({
    queryKey: ['annotations', projectId],
    queryFn: () => api.annotations(projectId),
    enabled: !!projectId,
  })
  const annotations = annData?.annotations ?? []

  async function addAnnotation() {
    const today = new Date().toISOString().split('T')[0]
    const date = window.prompt('Annotation date (YYYY-MM-DD):', today)
    if (!date) return
    const label = window.prompt('Label (e.g. "v2 launch"):', '')
    if (!label) return
    await api.createAnnotation(projectId, { date, label })
    qc.invalidateQueries({ queryKey: ['annotations', projectId] })
  }

  const delta: number | undefined = data?.delta

  const metricLabel = metric === 'uniques' ? 'Unique Users'
    : metric === 'frequency' ? 'Avg events / user'
    : metric === 'sum' ? `Sum of ${property}`
    : metric === 'average' ? `Avg ${property}`
    : metric === 'median' ? `Median ${property}`
    : ['p90', 'p95', 'p99'].includes(metric) ? `${metric.toUpperCase()} ${property}`
    : 'Events'

  async function saveToDashboard() {
    const name = window.prompt('Name this chart for your dashboard:', `${eventType} · ${metricLabel}`)
    if (!name) return
    await api.saveDashboardChart(projectId, {
      name, type: 'segmentation',
      config: { event_type: eventType, metric, property: needsProperty ? property : undefined, group_by: groupBy || undefined, days },
    })
    window.alert('Saved to dashboard ✓')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Event Segmentation"
        subtitle="Analyze how often an event happens — break down and measure any way"
        actions={
          <>
            <button onClick={addAnnotation} className="inline-flex items-center gap-1.5 px-3 py-2 type-caption rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors">
              <MapPin className="h-4 w-4" /> Annotate
            </button>
            <ExportButton filename={`${eventType || 'segmentation'}-${days}d`} rows={(data?.data ?? []) as Record<string, unknown>[]} />
            <button onClick={saveToDashboard} className="btn-brand px-4 py-2 type-caption rounded-md">Save to dashboard</button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap gap-4 items-end mb-5">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Event</span>
            <EventSelect value={eventType} onChange={setEventType} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Measured as</span>
            <Select
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
              options={[
                { value: 'totals',    label: 'Total events' },
                { value: 'uniques',   label: 'Unique users' },
                { value: 'frequency', label: 'Avg per user (frequency)' },
                { value: 'sum',       label: 'Sum of property' },
                { value: 'average',   label: 'Average of property' },
                { value: 'median',    label: 'Median of property' },
                { value: 'p90',       label: 'P90 of property' },
                { value: 'p95',       label: 'P95 of property' },
                { value: 'p99',       label: 'P99 of property' },
              ]}
            />
          </div>
          {needsProperty && (
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Property</span>
              <input
                className="ctrl min-w-[160px]"
                value={property}
                onChange={e => setProperty(e.target.value)}
                placeholder="e.g. revenue"
              />
            </div>
          )}
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Break down by</span>
            <input
              className="ctrl min-w-[160px]"
              value={groupBy}
              onChange={e => setGroupBy(e.target.value)}
              placeholder="(none) — e.g. plan, country"
            />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Date range</span>
            <DateRangePicker days={days} onChange={setDays} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Cohort</span>
            <CohortSelect value={cohortId} onChange={setCohortId} />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
          <FilterBar filters={filters} onChange={setFilters} />
          <label className={`flex items-center gap-2 type-body-13 select-none ${groupBy ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer text-[var(--color-text-muted)]'}`} title={groupBy ? 'Turn off breakdown to compare periods' : 'Overlay the previous period of equal length'}>
            <input
              type="checkbox"
              checked={compareOn}
              disabled={!!groupBy}
              onChange={e => setCompare(e.target.checked)}
              className="accent-[#0052F2] h-3.5 w-3.5"
            />
            Compare to previous period
          </label>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <p className="type-body-13 text-[var(--color-text-subtle)]">
            {metricLabel} for <span className="type-caption text-[var(--color-text)]">{eventType || '(no event)'}</span>
            {groupBy && <> broken down by <span className="type-caption text-[var(--color-text)]">{groupBy}</span></>}, per day.
          </p>
          {compareOn && delta !== undefined && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full type-body-12-400 ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#DE0202]'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}% vs previous
            </span>
          )}
        </div>

        {isLoading
          ? <div className="h-80 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
          : <SegmentationChart data={data?.data ?? []} metric={metricLabel} compareData={compareOn ? data?.compare_data : undefined} annotations={annotations} />
        }
      </Card>
    </div>
  )
}

export default function ChartsPage() {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <ChartsInner />
    </Suspense>
  )
}

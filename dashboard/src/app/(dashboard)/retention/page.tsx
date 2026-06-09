'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RetentionChart } from '@/components/charts/RetentionChart'
import { EventSelect } from '@/components/EventSelect'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'
import { FilterBar, stripFilters } from '@/components/FilterBar'
import { CohortSelect } from '@/components/CohortSelect'
import { useTopEvents } from '@/hooks/useTopEvents'
import type { Filter } from '@/lib/api'

export default function RetentionPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [startEvent, setStartEvent] = useState('')
  const [returnEvent, setReturnEvent] = useState('')
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading) return
    seeded.current = true
    if (events[0]) setStartEvent(events[0])
    setReturnEvent(events[1] ?? events[0] ?? '')
  }, [events, eventsLoading])
  const [periods, setPeriods] = useState(8)
  const [days, setDays] = useState(90)
  const [mode, setMode] = useState<'nday' | 'unbounded'>('nday')
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [filters, setFilters] = useState<(Filter & { _k?: number })[]>([])
  const [cohortId, setCohortId] = useState('')
  const { start, end } = rangeFromDays(days)
  const cleanFilters = stripFilters(filters)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['retention', projectId, startEvent, returnEvent, periods, days, mode, granularity, cleanFilters, cohortId],
    queryFn: () => api.retention({ project_id: projectId, start_event: startEvent, return_event: returnEvent, start, end, periods, mode, granularity, filters: cleanFilters, cohort_id: cohortId || undefined }),
    enabled: !!projectId,
  })
  const unitLabel = granularity === 'week' ? 'Week' : granularity === 'month' ? 'Month' : 'Day'

  return (
    <div className="space-y-5">
      <PageHeader title="Retention" subtitle="See how often users come back after their first action" />

      <Card>
        <div className="flex flex-wrap gap-4 items-end mb-5">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Starting event</span>
            <EventSelect value={startEvent} onChange={setStartEvent} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Return event</span>
            <EventSelect value={returnEvent} onChange={setReturnEvent} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Type</span>
            <Select
              value={mode}
              onChange={(v) => setMode(v as 'nday' | 'unbounded')}
              options={[{ value: 'nday', label: 'N-day (exact)' }, { value: 'unbounded', label: 'Unbounded' }]}
              className="min-w-[150px]"
            />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Granularity</span>
            <Select
              value={granularity}
              onChange={(v) => setGranularity(v as 'day' | 'week' | 'month')}
              options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]}
              className="min-w-[120px]"
            />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Periods</span>
            <Select
              value={String(periods)}
              onChange={(v) => setPeriods(Number(v))}
              options={[7, 14, 30].map(n => ({ value: String(n), label: `${n} ${unitLabel.toLowerCase()}s` }))}
              className="min-w-[120px]"
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
          <button onClick={() => refetch()} className="btn-brand px-4 py-2 type-caption rounded-lg">
            Run
          </button>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4 mb-2">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>

        <div className="pt-5 border-t border-[var(--color-border)]">
          {isLoading
            ? <div className="h-40 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
            : <RetentionChart data={data?.data ?? []} unit={unitLabel} />
          }
        </div>
      </Card>
    </div>
  )
}

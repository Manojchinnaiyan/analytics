'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Flag } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'
import { DateRangePicker, rangeFromDays } from '@/components/ui/DateRangePicker'
import { PathsSankey, type SankeyNode, type SankeyLink } from '@/components/charts/PathsSankey'

function PathsInner() {
  const projectId = useProjectStore(s => s.projectId)
  const fromParam = useSearchParams().get('from') || ''
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [startEvent, setStartEvent] = useState(fromParam)
  const [days, setDays] = useState(30)
  const [depth, setDepth] = useState(4)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [exclude, setExclude] = useState('')
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading || fromParam) return
    seeded.current = true
    if (events[0]) setStartEvent(events[0])
  }, [events, eventsLoading, fromParam])

  const excludeList = exclude.split(',').map(s => s.trim()).filter(Boolean)
  const { start, end } = rangeFromDays(days)
  const { data, isLoading } = useQuery({
    queryKey: ['paths', projectId, startEvent, days, depth, direction, excludeList],
    queryFn: () => api.paths({ project_id: projectId, start_event: startEvent, start, end, depth, direction, exclude: excludeList }),
    enabled: !!projectId && !!startEvent,
  })

  const nodes: SankeyNode[] = data?.nodes ?? []
  const links: SankeyLink[] = data?.links ?? []
  const total: number = data?.total_users ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="User Paths"
        subtitle="How users flow from one event to the next — width shows how many take each path"
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Starting event</span>
            <EventSelect value={startEvent} onChange={setStartEvent} />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Direction</span>
            <Select
              value={direction}
              onChange={(v) => setDirection(v as 'forward' | 'backward')}
              options={[{ value: 'forward', label: 'Next events →' }, { value: 'backward', label: '← Preceding events' }]}
              className="w-[180px]"
            />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Steps</span>
            <Select
              value={String(depth)}
              onChange={(v) => setDepth(Number(v))}
              options={[2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `${n} steps` }))}
              className="w-[120px]"
            />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Exclude events</span>
            <input className="ctrl w-48" value={exclude} onChange={e => setExclude(e.target.value)} placeholder="comma,separated" />
          </div>
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Date range</span>
            <DateRangePicker days={days} onChange={setDays} />
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="h-80 p-1"><Skeleton className="h-full w-full rounded-lg" /></div>
        ) : total === 0 ? (
          <div className="h-80 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">
            No users performed “{startEvent || 'this event'}” in this range.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EEF3FD] text-[#0052F2] type-caption">
                <Flag className="h-3.5 w-3.5" /> {startEvent}
              </span>
              <span className="type-body-13 text-[var(--color-text-subtle)]">{total.toLocaleString()} users started here</span>
            </div>

            <PathsSankey nodes={nodes} links={links} />

            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 type-body-13 text-[var(--color-text-subtle)]">
              <span><b className="text-[#0052F2]">Blue</b> — an event step</span>
              <span><b className="text-[#DC2626]">Red (exit)</b> — users with no further event</span>
              <span><b className="text-[#98a0b8]">Grey (other)</b> — long-tail events grouped together</span>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

export default function PathsPage() {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <PathsInner />
    </Suspense>
  )
}

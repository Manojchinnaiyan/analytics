'use client'

import { useState, useEffect, useRef } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Users2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'

interface Cohort {
  id: string
  name: string
  definition: {
    type?: string; event_type?: string; min_count?: number; days?: number
    property?: string; operator?: string; value?: string; prop_type?: string
    did_event?: string; not_event?: string
  }
  user_count: number
}

function describeCohort(d: Cohort['definition']): string {
  const days = d.days ?? 30
  if (d.type === 'property') return `${d.prop_type ?? 'event'} ${d.property} ${d.operator} "${d.value}" · ${days}d`
  if (d.type === 'funnel') return `did ${d.did_event} but NOT ${d.not_event} · ${days}d`
  return `did ${d.event_type} ≥ ${d.min_count ?? 1}× in ${days}d`
}

export default function CohortsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { events, isLoading: eventsLoading } = useTopEvents()
  const [name, setName] = useState('')
  const [ctype, setCtype] = useState<'behavioral' | 'property' | 'funnel'>('behavioral')
  const [eventType, setEventType] = useState('')
  const [minCount, setMinCount] = useState(1)
  const [days, setDays] = useState(30)
  // property
  const [prop, setProp] = useState('')
  const [propType, setPropType] = useState('event')
  const [operator, setOperator] = useState('is')
  const [value, setValue] = useState('')
  // funnel
  const [didEvent, setDidEvent] = useState('')
  const [notEvent, setNotEvent] = useState('')
  const [saving, setSaving] = useState(false)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || eventsLoading) return
    seeded.current = true
    if (events[0]) { setEventType(events[0]); setDidEvent(events[0]) }
    if (events[1]) setNotEvent(events[1])
  }, [events, eventsLoading])

  const { data, isLoading } = useQuery({
    queryKey: ['cohorts', projectId],
    queryFn: () => api.cohorts(projectId),
    enabled: !!projectId,
  })
  const cohorts: Cohort[] = data?.cohorts ?? []

  async function save() {
    if (!name) return
    const body: Record<string, unknown> = { name, type: ctype, days }
    if (ctype === 'behavioral') {
      if (!eventType) return
      body.event_type = eventType; body.min_count = minCount
    } else if (ctype === 'property') {
      if (!prop) return
      body.property = prop; body.prop_type = propType; body.operator = operator; body.value = value
    } else {
      if (!didEvent || !notEvent) return
      body.did_event = didEvent; body.not_event = notEvent
    }
    setSaving(true)
    try {
      await api.createCohort(projectId, body)
      setCreating(false); setName('')
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] })
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    await api.deleteCohort(projectId, id)
    qc.invalidateQueries({ queryKey: ['cohorts', projectId] })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cohorts"
        subtitle="Reusable user segments based on behavior"
        actions={<button onClick={() => setCreating(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5"><Plus className="h-4 w-4" /> New cohort</button>}
      />

      {creating && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Define a cohort</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Name</span>
              <input className="ctrl w-48" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Power buyers" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Type</span>
              <Select value={ctype} onChange={(v) => setCtype(v as typeof ctype)} options={[
                { value: 'behavioral', label: 'Did an event' },
                { value: 'property', label: 'Has a property' },
                { value: 'funnel', label: 'Did A, not B' },
              ]} className="min-w-[150px]" />
            </div>

            {ctype === 'behavioral' && <>
              <div className="type-body-15 text-[var(--color-text-muted)] pb-2">did</div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Event</span><EventSelect value={eventType} onChange={setEventType} /></div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">At least</span><input type="number" min={1} className="ctrl w-20" value={minCount} onChange={e => setMinCount(Math.max(1, Number(e.target.value)))} /></div>
              <div className="type-body-15 text-[var(--color-text-muted)] pb-2">times</div>
            </>}

            {ctype === 'property' && <>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Scope</span>
                <Select value={propType} onChange={setPropType} options={[{ value: 'event', label: 'Event prop' }, { value: 'user', label: 'User prop' }, { value: 'system', label: 'System' }]} className="min-w-[120px]" /></div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Property</span><input className="ctrl w-36" value={prop} onChange={e => setProp(e.target.value)} placeholder="country" /></div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Op</span>
                <Select value={operator} onChange={setOperator} options={[{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, { value: 'contains', label: 'contains' }, { value: 'greater_than', label: '>' }, { value: 'less_than', label: '<' }]} className="min-w-[110px]" /></div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Value</span><input className="ctrl w-32" value={value} onChange={e => setValue(e.target.value)} placeholder="US" /></div>
            </>}

            {ctype === 'funnel' && <>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Did</span><EventSelect value={didEvent} onChange={setDidEvent} /></div>
              <div className="type-body-15 text-[var(--color-text-muted)] pb-2">but NOT</div>
              <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Event</span><EventSelect value={notEvent} onChange={setNotEvent} /></div>
            </>}

            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">In last</span>
              <Select value={String(days)} onChange={(v) => setDays(Number(v))} options={[7, 14, 30, 90].map(n => ({ value: String(n), label: `${n} days` }))} className="min-w-[120px]" />
            </div>
            <button onClick={save} disabled={saving} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : cohorts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><Users2 className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No cohorts yet — create one to segment your users.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Cohort</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Definition</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Users</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map(c => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                  <td className="px-5 py-3 type-small-body text-[var(--color-text)]">{c.name}</td>
                  <td className="px-5 py-3 type-body-13 text-[var(--color-text-muted)]">{describeCohort(c.definition)}</td>
                  <td className="px-5 py-3 text-right type-small-body text-[var(--color-text)]">{c.user_count.toLocaleString()}</td>
                  <td className="px-2"><button onClick={() => remove(c.id)} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

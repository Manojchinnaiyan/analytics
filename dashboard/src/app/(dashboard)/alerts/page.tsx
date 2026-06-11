'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Bell, BellRing, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'

interface Alert {
  id: string
  name: string
  event_type: string
  metric: string
  window_minutes: number
  operator: string
  threshold: number
  webhook_url: string
  enabled: boolean
  is_triggered: boolean
  last_value: number
  last_checked_at: string | null
}

interface AlertEvent {
  id: string
  alert_name: string
  message: string
  created_at: string
}

const WINDOWS = [
  { value: '15',   label: '15 minutes' },
  { value: '60',   label: '1 hour' },
  { value: '360',  label: '6 hours' },
  { value: '1440', label: '24 hours' },
]
const METRICS = [
  { value: 'count',        label: 'Event count' },
  { value: 'unique_users', label: 'Unique users' },
]
const OPERATORS = [
  { value: 'above', label: 'is above' },
  { value: 'below', label: 'is below' },
]

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 0) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AlertsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('')
  const [metric, setMetric] = useState('count')
  const [windowMin, setWindowMin] = useState('60')
  const [operator, setOperator] = useState('above')
  const [mode, setMode] = useState('threshold')
  const [threshold, setThreshold] = useState('100')
  const [webhook, setWebhook] = useState('')
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', projectId],
    queryFn: () => api.alerts(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  })
  const alerts: Alert[] = data?.alerts ?? []

  const { data: evData } = useQuery({
    queryKey: ['alert-events', projectId],
    queryFn: () => api.alertEvents(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  })
  const events: AlertEvent[] = evData?.events ?? []

  async function save() {
    if (!name.trim() || !eventType) return
    setSaving(true)
    try {
      await api.createAlert(projectId, {
        name: name.trim(), event_type: eventType, metric,
        window_minutes: Number(windowMin), operator, threshold: Number(threshold), mode,
        webhook_url: webhook.trim(),
      })
      setCreating(false); setName(''); setThreshold('100'); setWebhook('')
      qc.invalidateQueries({ queryKey: ['alerts', projectId] })
    } finally { setSaving(false) }
  }

  async function toggle(a: Alert) {
    await api.updateAlert(projectId, a.id, { ...a, enabled: !a.enabled })
    qc.invalidateQueries({ queryKey: ['alerts', projectId] })
  }

  async function remove(id: string) {
    await api.deleteAlert(projectId, id)
    qc.invalidateQueries({ queryKey: ['alerts', projectId] })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts"
        subtitle="Get notified when a metric crosses a threshold — checked every minute"
        actions={<button onClick={() => setCreating(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5"><Plus className="h-4 w-4" /> New alert</button>}
      />

      {creating && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Create an alert</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Name</span>
              <input className="ctrl w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Signups dropped" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Event</span>
              <EventSelect value={eventType} onChange={setEventType} />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Metric</span>
              <Select value={metric} onChange={setMetric} options={METRICS} className="w-[150px]" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Compare</span>
              <Select value={mode} onChange={setMode} options={[{ value: 'threshold', label: 'Absolute value' }, { value: 'change', label: '% change vs prior' }]} className="w-[150px]" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Condition</span>
              <Select value={operator} onChange={setOperator} options={OPERATORS} className="w-[120px]" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">{mode === 'change' ? 'By % (e.g. 30)' : 'Threshold'}</span>
              <input className="ctrl w-28" type="number" value={threshold} onChange={e => setThreshold(e.target.value)} />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Over the last</span>
              <Select value={windowMin} onChange={setWindowMin} options={WINDOWS} className="w-[140px]" />
            </div>
          </div>
          <div className="flex items-end gap-3 mt-3">
            <div className="flex-1 min-w-[240px]">
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Slack / webhook URL (optional)</span>
              <input className="ctrl w-full" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
            </div>
            <button onClick={save} disabled={saving || !name.trim() || !eventType} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">{saving ? 'Creating…' : 'Create alert'}</button>
          </div>
          <p className="type-body-13 text-[var(--color-text-subtle)] mt-3">
            {mode === 'change'
              ? <>Fires when <b>{metric === 'count' ? 'event count' : 'unique users'}</b> of <b>{eventType || '(event)'}</b> {operator === 'above' ? 'rises' : 'drops'} more than <b>{threshold}%</b> vs the prior {WINDOWS.find(w => w.value === windowMin)?.label}.</>
              : <>Fires when <b>{metric === 'count' ? 'event count' : 'unique users'}</b> of <b>{eventType || '(event)'}</b> {operator === 'above' ? 'goes above' : 'drops below'} <b>{threshold}</b> over the last {WINDOWS.find(w => w.value === windowMin)?.label}.</>}
          </p>
        </Card>
      )}

      {/* Rules */}
      <Card padding={false}>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : alerts.length === 0 ? (
          <div className="py-14 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><Bell className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No alerts yet — create one to get notified when a metric moves.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Alert</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Condition</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Latest</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Status</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                  <td className="px-5 py-3">
                    <div className="type-small-body text-[var(--color-text)]">{a.name}</div>
                    <div className="type-body-12-400 text-[var(--color-text-subtle)]">checked {timeAgo(a.last_checked_at)}</div>
                  </td>
                  <td className="px-5 py-3 type-body-13 text-[var(--color-text-muted)]">
                    {a.metric === 'count' ? 'count' : 'unique users'} of <span className="text-[var(--color-text)]">{a.event_type}</span> {a.operator} {a.threshold} / {a.window_minutes}m
                  </td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text)]">{a.last_value?.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    {!a.enabled ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)] type-body-12-400">paused</span>
                    ) : a.is_triggered ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-[#DE0202] type-body-12-400"><BellRing className="h-3 w-3" /> triggered</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 type-body-12-400">ok</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => toggle(a)} className="px-2 py-1 type-body-12-400 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-white">{a.enabled ? 'Pause' : 'Enable'}</button>
                      <button onClick={() => remove(a.id)} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Recent notifications */}
      <Card>
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Recent notifications</h2>
        {events.length === 0 ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-4 text-center">No alerts have fired yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map(e => (
              <div key={e.id} className="flex items-start gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                <div className="p-1.5 rounded-lg bg-amber-50 mt-0.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="type-body-13 text-[var(--color-text)]">{e.message}</p>
                  <p className="type-body-12-400 text-[var(--color-text-subtle)]">{e.alert_name} · {timeAgo(e.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { ArrowUpRight } from 'lucide-react'
import { api, type Filter } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { FilterBar, stripFilters } from '@/components/FilterBar'

type Quadrant = 'core' | 'power' | 'broad' | 'niche'
interface RawFeature {
  event_type: string
  users: number
  events: number
  adoption: number
  freq_days: number
  freq_times: number
  stickiness: number
  trend: number[]
}
interface Dividers {
  adoption: { median: number; mean: number }
  freq_days: { median: number; mean: number }
  freq_times: { median: number; mean: number }
}

const QUADRANT = {
  core:  { label: 'Core',  color: '#0052F2', desc: 'Used widely & often' },
  power: { label: 'Power', color: '#7C3AED', desc: 'Small but devoted audience' },
  broad: { label: 'Broad', color: '#059669', desc: 'Tried widely, not yet habitual' },
  niche: { label: 'Niche', color: '#9AA1B2', desc: 'Low reach & frequency' },
} as const

const WINDOWS = [7, 30, 90]

function Toggle<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 type-body-13 transition-colors ${value === o.value ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Sparkline({ data, color = '#0052F2' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return <span className="type-body-12-400 text-[var(--color-text-subtle)]">—</span>
  const w = 88, h = 22, max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface Point extends RawFeature { x: number; y: number; quadrant: Quadrant }
function MatrixTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Point }[]; unit: string }) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-sm px-3 py-2">
      <p className="type-small-body text-[var(--color-text)]">{f.event_type}</p>
      <p className="type-body-12-400 text-[var(--color-text-muted)]">Adoption {(f.adoption * 100).toFixed(0)}% · {f.y.toFixed(1)} {unit}</p>
      <p className="type-body-12-400 text-[var(--color-text-subtle)]">{f.users.toLocaleString()} users · {QUADRANT[f.quadrant].label}</p>
    </div>
  )
}

interface RetGroup { users: number; retained: number; retention: number }
interface RetData { event: string; adopters: RetGroup; non_adopters: RetGroup; lift: number }

// "Do adopters of this feature retain better?" — Amplitude's signature insight.
function FeatureRetention({ projectId, days, filters, options }: {
  projectId: string; days: number; filters: Filter[]; options: { value: string; label: string }[]
}) {
  const [event, setEvent] = useState('')
  const sel = event || options[0]?.value || ''

  const { data, isLoading } = useQuery<RetData>({
    queryKey: ['feature-retention', projectId, sel, days, filters],
    queryFn: () => api.featureRetention(projectId, sel, days, filters),
    enabled: !!projectId && !!sel,
  })

  const a = data?.adopters
  const n = data?.non_adopters
  const lift = data?.lift ?? 0
  const Bar = ({ label, g, color }: { label: string; g?: RetGroup; color: string }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="type-body-13 text-[var(--color-text)]">{label}</span>
        <span className="type-body-12-400 text-[var(--color-text-subtle)]">{(g?.users ?? 0).toLocaleString()} users</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-[var(--color-surface-muted)] rounded-full h-2.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(g?.retention ?? 0) * 100}%`, background: color }} />
        </div>
        <span className="type-small-body text-[var(--color-text)] w-12 text-right">{((g?.retention ?? 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
  )

  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="type-h3-16 text-[var(--color-text)]">Feature impact on retention</h2>
        <Select value={sel} onChange={setEvent} options={options} className="w-[200px]" />
      </div>
      <p className="type-body-13 text-[var(--color-text-muted)] mb-4">
        Return rate of users who adopted <b>{sel || '—'}</b> on their first day vs those who didn’t (over {days}d).
      </p>
      {isLoading ? (
        <div className="py-8 text-center type-body-13 text-[var(--color-text-subtle)]">Loading…</div>
      ) : (
        <div className="space-y-4">
          <Bar label="Adopters" g={a} color="#0052F2" />
          <Bar label="Non-adopters" g={n} color="#9AA1B2" />
          <div className="flex items-center gap-2 pt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md type-body-13 ${lift >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#DE0202]'}`}>
              <ArrowUpRight className={`h-3.5 w-3.5 ${lift < 0 ? 'rotate-90' : ''}`} />
              {lift >= 0 ? '+' : ''}{(lift * 100).toFixed(0)} pts
            </span>
            <span className="type-body-13 text-[var(--color-text-muted)]">
              {lift >= 0 ? 'higher retention for adopters' : 'lower retention for adopters'}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

interface FeatureDefn { id: string; name: string; events: string[] }

// Define a "feature" as a set of events (Amplitude lets you analyze features
// composed of multiple events). Listed/edited here; the matrix groups by these.
function ManageFeatures({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const { data: defData } = useQuery({ queryKey: ['features', projectId], queryFn: () => api.features(projectId), enabled: !!projectId })
  const { data: evData } = useQuery({ queryKey: ['event-types', projectId], queryFn: () => api.eventTypes(projectId), enabled: !!projectId && open })
  const defs: FeatureDefn[] = defData?.features ?? []
  const eventTypes: string[] = (evData?.event_types ?? []).map((e: { event_type: string }) => e.event_type)

  function toggle(ev: string) {
    setPicked(p => { const n = new Set(p); n.has(ev) ? n.delete(ev) : n.add(ev); return n })
  }
  async function create() {
    if (!name.trim() || picked.size === 0) return
    setSaving(true)
    try {
      await api.createFeature(projectId, { name: name.trim(), events: [...picked] })
      setName(''); setPicked(new Set())
      qc.invalidateQueries({ queryKey: ['features', projectId] })
      qc.invalidateQueries({ queryKey: ['feature-engagement', projectId] })
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    await api.deleteFeature(projectId, id)
    qc.invalidateQueries({ queryKey: ['features', projectId] })
    qc.invalidateQueries({ queryKey: ['feature-engagement', projectId] })
  }

  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="type-h3-16 text-[var(--color-text)]">Feature definitions</h2>
          <p className="type-body-13 text-[var(--color-text-muted)] mt-0.5">Group events into named features for the matrix.</p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="px-3 py-1.5 type-body-13 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
          {open ? 'Done' : 'Manage'}
        </button>
      </div>

      {defs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {defs.map(d => (
            <span key={d.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF3FD] text-[#0052F2] type-body-13">
              {d.name} <span className="text-[var(--color-text-subtle)]">· {d.events.length}</span>
              <button onClick={() => remove(d.id)} className="hover:text-[#DE0202]">×</button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <input className="ctrl w-full mb-3" value={name} onChange={e => setName(e.target.value)} placeholder="Feature name (e.g. Checkout)" />
          <p className="type-caption text-[var(--color-text-muted)] mb-2">Events in this feature</p>
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {eventTypes.length === 0 ? (
              <span className="type-body-13 text-[var(--color-text-subtle)]">No events yet.</span>
            ) : eventTypes.map(ev => (
              <button
                key={ev}
                onClick={() => toggle(ev)}
                className={`px-2.5 py-1 rounded-full type-body-13 border transition-colors ${picked.has(ev) ? 'bg-[#0052F2] text-white border-[#0052F2]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-white'}`}
              >
                {ev}
              </button>
            ))}
          </div>
          <button onClick={create} disabled={saving || !name.trim() || picked.size === 0} className="btn-brand px-4 py-2 type-caption rounded-md mt-3 disabled:opacity-50">
            {saving ? 'Saving…' : `Create feature${picked.size ? ` (${picked.size})` : ''}`}
          </button>
        </div>
      )}
    </Card>
  )
}

export default function FeatureEngagementPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<'days' | 'times'>('days')   // Amplitude: avg days vs avg times performed
  const [divider, setDivider] = useState<'median' | 'mean'>('median') // Amplitude: Median vs Average
  const [group, setGroup] = useState<'events' | 'features'>('events') // raw events vs named feature-groups
  const [filters, setFilters] = useState<(Filter & { _k?: number })[]>([])

  const cleanFilters = stripFilters(filters)
  const { data, isLoading } = useQuery({
    queryKey: ['feature-engagement', projectId, days, cleanFilters, group],
    queryFn: () => api.featureEngagement(projectId, days, cleanFilters, group === 'features' ? 'features' : undefined),
    enabled: !!projectId,
  })

  const features: RawFeature[] = data?.features ?? []
  const activeUsers: number = data?.active_users ?? 0
  const dividers: Dividers | undefined = data?.dividers

  const freqKey = metric === 'times' ? 'freq_times' : 'freq_days'
  const unit = metric === 'times' ? 'times/user' : 'days/user'
  const adoptThreshold = dividers ? dividers.adoption[divider] : 0
  const freqThreshold = dividers ? dividers[freqKey][divider] : 0

  // Classify quadrants client-side from the chosen metric + divider.
  const points: Point[] = features.map(f => {
    const y = f[freqKey]
    const hiAdopt = f.adoption >= adoptThreshold
    const hiFreq = y >= freqThreshold
    const quadrant: Quadrant = hiAdopt && hiFreq ? 'core' : !hiAdopt && hiFreq ? 'power' : hiAdopt && !hiFreq ? 'broad' : 'niche'
    return { ...f, x: f.adoption * 100, y, quadrant }
  })
  const byQuadrant = (q: Quadrant) => points.filter(p => p.quadrant === q)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feature Engagement"
        subtitle={`Adoption × frequency across features · ${activeUsers.toLocaleString()} active users (${days}d)`}
        actions={<Toggle value={days as never} onChange={(v) => setDays(Number(v))} options={WINDOWS.map(w => ({ value: String(w) as never, label: `${w}d` }))} />}
      />

      {/* Controls: segment, frequency measure, quadrant divider */}
      <Card className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[240px] flex-1"><FilterBar filters={filters} onChange={setFilters} /></div>
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Measure</span>
              <Toggle value={group} onChange={setGroup} options={[{ value: 'events', label: 'Events' }, { value: 'features', label: 'Features' }]} />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Frequency</span>
              <Toggle value={metric} onChange={setMetric} options={[{ value: 'days', label: 'Avg days' }, { value: 'times', label: 'Avg times' }]} />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Quadrant split</span>
              <Toggle value={divider} onChange={setDivider} options={[{ value: 'median', label: 'Median' }, { value: 'mean', label: 'Average' }]} />
            </div>
          </div>
        </div>
      </Card>

      {group === 'features' && <ManageFeatures projectId={projectId} />}

      {/* Engagement matrix */}
      <Card className="min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="type-h3-16 text-[var(--color-text)]">Engagement matrix</h2>
          <div className="flex items-center gap-3 flex-wrap">
            {(Object.keys(QUADRANT) as Quadrant[]).map(q => (
              <span key={q} className="inline-flex items-center gap-1.5 type-body-12-400 text-[var(--color-text-muted)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: QUADRANT[q].color }} />
                {QUADRANT[q].label}
              </span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[360px] flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : points.length === 0 ? (
          <div className="h-[360px] flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">No events in this window.</div>
        ) : (
          <div className="h-[360px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" />
                <XAxis
                  type="number" dataKey="x" name="Adoption" unit="%" domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false}
                  label={{ value: 'Adoption (% of active users)', position: 'bottom', offset: 12, fontSize: 12, fill: '#6F7480' }}
                />
                <YAxis
                  type="number" dataKey="y" name="Frequency"
                  tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={44}
                  label={{ value: `Frequency (${unit})`, angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6F7480' }}
                />
                <ZAxis type="number" dataKey="users" range={[40, 400]} name="Users" />
                <ReferenceLine x={adoptThreshold * 100} stroke="#C7CDDA" strokeDasharray="4 3" />
                <ReferenceLine y={freqThreshold} stroke="#C7CDDA" strokeDasharray="4 3" />
                <Tooltip content={<MatrixTooltip unit={unit} />} cursor={{ strokeDasharray: '3 3' }} />
                {(Object.keys(QUADRANT) as Quadrant[]).map(q => (
                  <Scatter key={q} name={QUADRANT[q].label} data={byQuadrant(q)} fill={QUADRANT[q].color} fillOpacity={0.75} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">
          Bubble size = users. Split lines use the {divider === 'median' ? 'median' : 'average'} adoption &amp; frequency. Top-right = core features.
        </p>
      </Card>

      {/* Feature impact on retention */}
      {points.length > 0 && (
        <FeatureRetention
          projectId={projectId}
          days={days}
          filters={cleanFilters}
          options={points.map(p => ({ value: p.event_type, label: p.event_type }))}
        />
      )}

      {/* Detail table */}
      <Card padding={false} className="min-w-0 overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : points.length === 0 ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">No events in the last {days} days.</div>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Feature / Event</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Users</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)] w-52">Adoption</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]" title={metric === 'times' ? 'Avg times performed per user' : 'Avg active days per user'}>Frequency</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]" title="DAU/MAU over 30 days — habitual use">Stickiness</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Trend</th>
              </tr>
            </thead>
            <tbody>
              {points.map(f => (
                <tr key={f.event_type} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: QUADRANT[f.quadrant].color }} title={QUADRANT[f.quadrant].label} />
                      <span className="type-small-body text-[var(--color-text)]">{f.event_type}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text)]">{f.users.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-[#0052F2] rounded-full" style={{ width: `${Math.min(f.adoption * 100, 100)}%` }} />
                      </div>
                      <span className="type-body-13 text-[var(--color-text-muted)] w-10 text-right">{(f.adoption * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text-muted)]">{f.y.toFixed(1)}{metric === 'days' ? 'd' : '×'}</td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text-muted)]">{(f.stickiness * 100).toFixed(0)}%</td>
                  <td className="px-5 py-3"><Sparkline data={f.trend} color={QUADRANT[f.quadrant].color} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

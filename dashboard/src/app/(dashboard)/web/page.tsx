'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, MousePointer2, Users, LogOut, Layers, Timer, UserPlus, X, Target, Plus, Trash2 } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore, usePermission } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Select'
import { DateRangePicker } from '@/components/ui/DateRangePicker'

interface Goal { id: string; name: string; type: string; match: string; conversions: number; rate: number }
interface VitalPage { value: string; samples: number; lcp: number; cls: number; fcp: number; inp: number }

// CWV rating thresholds (Google): [good, needs-improvement] upper bounds.
const VITALS: { key: 'lcp' | 'inp' | 'cls' | 'fcp'; label: string; unit: string; good: number; ni: number; fmt: (v: number) => string }[] = [
  { key: 'lcp', label: 'LCP', unit: 'Largest Contentful Paint', good: 2500, ni: 4000, fmt: v => `${(v / 1000).toFixed(2)}s` },
  { key: 'inp', label: 'INP', unit: 'Interaction to Next Paint', good: 200, ni: 500, fmt: v => `${Math.round(v)}ms` },
  { key: 'cls', label: 'CLS', unit: 'Cumulative Layout Shift',  good: 0.1,  ni: 0.25, fmt: v => v.toFixed(3) },
  { key: 'fcp', label: 'FCP', unit: 'First Contentful Paint',   good: 1800, ni: 3000, fmt: v => `${(v / 1000).toFixed(2)}s` },
]
function rating(v: number, good: number, ni: number): { label: string; cls: string } {
  if (v <= good) return { label: 'Good', cls: 'text-emerald-600 bg-emerald-50' }
  if (v <= ni)   return { label: 'Needs work', cls: 'text-amber-600 bg-amber-50' }
  return { label: 'Poor', cls: 'text-[#DE0202] bg-red-50' }
}

function WebVitalsCard({ projectId, days, filters }: { projectId: string; days: number; filters: Record<string, string> }) {
  const { data } = useQuery({
    queryKey: ['web-vitals', projectId, days, filters],
    queryFn: () => api.webVitals(projectId, days, filters),
    enabled: !!projectId,
  })
  const samples: number = data?.samples ?? 0
  const pages: VitalPage[] = data?.pages ?? []

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="type-h3-16 text-[var(--color-text)]">Core Web Vitals <span className="type-body-13 text-[var(--color-text-subtle)]">· p75</span></h2>
        <span className="type-body-13 text-[var(--color-text-subtle)]">{samples.toLocaleString()} measurements</span>
      </div>
      {samples === 0 ? (
        <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No performance data yet — enable <code>autoCapture.webVitals</code> in the SDK.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {VITALS.map(m => {
              const v = data?.[m.key] ?? 0
              const r = rating(v, m.good, m.ni)
              return (
                <div key={m.key} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="type-caption text-[var(--color-text-muted)]">{m.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full type-body-12-400 ${r.cls}`}>{r.label}</span>
                  </div>
                  <div className="type-h3 text-[var(--color-text)]">{m.fmt(v)}</div>
                  <div className="type-body-12-400 text-[var(--color-text-subtle)]">{m.unit}</div>
                </div>
              )
            })}
          </div>
          {pages.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] type-caption text-[var(--color-text-muted)]">
                  <th className="text-left py-2">Page</th>
                  <th className="text-right py-2">Samples</th>
                  <th className="text-right py-2">LCP</th>
                  <th className="text-right py-2">INP</th>
                  <th className="text-right py-2">CLS</th>
                  <th className="text-right py-2">FCP</th>
                </tr>
              </thead>
              <tbody>
                {pages.map(p => (
                  <tr key={p.value} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 type-small-body text-[var(--color-text)] truncate max-w-[260px]" title={p.value}>{p.value}</td>
                    <td className="py-2 text-right type-body-13 text-[var(--color-text-muted)]">{p.samples.toLocaleString()}</td>
                    <td className={`py-2 text-right type-body-13 ${rating(p.lcp, 2500, 4000).cls.split(' ')[0]}`}>{(p.lcp / 1000).toFixed(2)}s</td>
                    <td className={`py-2 text-right type-body-13 ${rating(p.inp, 200, 500).cls.split(' ')[0]}`}>{Math.round(p.inp)}ms</td>
                    <td className={`py-2 text-right type-body-13 ${rating(p.cls, 0.1, 0.25).cls.split(' ')[0]}`}>{p.cls.toFixed(3)}</td>
                    <td className={`py-2 text-right type-body-13 ${rating(p.fcp, 1800, 3000).cls.split(' ')[0]}`}>{(p.fcp / 1000).toFixed(2)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  )
}

function GoalsCard({ projectId, days, filters }: { projectId: string; days: number; filters: Record<string, string> }) {
  const qc = useQueryClient()
  const can = usePermission()
  const editable = can('settings.manage')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [gtype, setGtype] = useState('event')
  const [match, setMatch] = useState('')

  const { data } = useQuery({
    queryKey: ['web-goals', projectId, days, filters],
    queryFn: () => api.webGoals(projectId, days, filters),
    enabled: !!projectId,
  })
  const goals: Goal[] = data?.goals ?? []

  async function add() {
    if (!name.trim() || !match.trim()) return
    await api.createWebGoal(projectId, { name: name.trim(), type: gtype, match: match.trim() })
    setAdding(false); setName(''); setMatch('')
    qc.invalidateQueries({ queryKey: ['web-goals', projectId] })
  }
  async function remove(id: string) {
    await api.deleteWebGoal(projectId, id)
    qc.invalidateQueries({ queryKey: ['web-goals', projectId] })
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#0052F2]" />
          <h2 className="type-h3-16 text-[var(--color-text)]">Goals &amp; conversions</h2>
        </div>
        {editable && <button onClick={() => setAdding(v => !v)} className="type-caption text-[#0052F2] hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add goal</button>}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-[var(--color-border)]">
          <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">Name</span><input className="ctrl w-40" value={name} onChange={e => setName(e.target.value)} placeholder="Signup" /></div>
          <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">Type</span><Select value={gtype} onChange={setGtype} options={[{ value: 'event', label: 'Event' }, { value: 'page', label: 'Page path' }]} className="w-[120px]" /></div>
          <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">{gtype === 'page' ? 'Path (e.g. /thanks)' : 'Event name'}</span><input className="ctrl w-44" value={match} onChange={e => setMatch(e.target.value)} placeholder={gtype === 'page' ? '/thank-you' : 'Purchase'} /></div>
          <button onClick={add} className="btn-brand px-3 py-2 type-caption rounded-md">Create</button>
        </div>
      )}

      {goals.length === 0 ? (
        <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No goals yet{editable ? ' — add one to track conversions by source, page, country…' : '.'}</p>
      ) : (
        <div className="space-y-3">
          {goals.map(g => {
            const max = Math.max(...goals.map(x => x.conversions), 1)
            return (
              <div key={g.id} className="flex items-center gap-3 group">
                <span className="type-small-body text-[var(--color-text)] w-44 truncate" title={`${g.type}: ${g.match}`}>{g.name}</span>
                <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden"><div className="h-full accent-gradient rounded-full" style={{ width: `${(g.conversions / max) * 100}%` }} /></div>
                <span className="type-body-13 text-[var(--color-text)] w-16 text-right">{g.conversions.toLocaleString()}</span>
                <span className="type-body-13 text-emerald-600 w-14 text-right">{(g.rate * 100).toFixed(1)}%</span>
                {editable && <button onClick={() => remove(g.id)} className="p-1 text-[var(--color-text-subtle)] hover:text-[#DE0202] opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

interface Row { value: string; views?: number; visitors?: number; sessions?: number; downloads?: number; events?: number; clicks?: number }

function WebEngagementSection({ projectId, days, filters }: { projectId: string; days: number; filters: Record<string, string> }) {
  const { data } = useQuery({
    queryKey: ['web-engagement', projectId, days, filters],
    queryFn: () => api.webEngagement(projectId, days, filters),
    enabled: !!projectId,
  })
  const downloads: Row[] = data?.downloads ?? []
  const outbound: Row[] = data?.outbound ?? []
  const customEvents: Row[] = data?.custom_events ?? []
  const timeOnPage: { value: string; views: number; avg_ms: number }[] = data?.time_on_page ?? []
  const scroll: { depth: number; visitors: number }[] = data?.scroll ?? []
  const scrollBase: number = data?.scroll_base ?? 0
  const maxMs = Math.max(...timeOnPage.map(t => t.avg_ms), 1)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Time on page</h2>
        {timeOnPage.length === 0 ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No engagement data</p>
        ) : (
          <div className="space-y-3">
            {timeOnPage.map(t => (
              <div key={t.value} className="flex items-center gap-3">
                <span className="type-small-body text-[var(--color-text)] w-40 truncate" title={t.value}>{t.value}</span>
                <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden"><div className="h-full accent-gradient rounded-full" style={{ width: `${(t.avg_ms / maxMs) * 100}%` }} /></div>
                <span className="type-body-13 text-[var(--color-text-muted)] w-14 text-right">{fmtDuration(t.avg_ms / 1000)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <BreakdownCard title="File downloads" rows={downloads} metric="downloads" />
      <BreakdownCard title="Outbound links" rows={outbound} metric="clicks" />
      <BreakdownCard title="Custom events" rows={customEvents} metric="events" />
      <Card>
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Scroll depth</h2>
        {scrollBase === 0 || scroll.every(s => s.visitors === 0) ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No scroll data</p>
        ) : (
          <div className="space-y-3">
            {scroll.map(s => {
              const pct = scrollBase > 0 ? (s.visitors / scrollBase) * 100 : 0
              return (
                <div key={s.depth} className="flex items-center gap-3">
                  <span className="type-small-body text-[var(--color-text)] w-16">{s.depth}%</span>
                  <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden"><div className="h-full accent-gradient rounded-full" style={{ width: `${pct}%` }} /></div>
                  <span className="type-body-13 text-[var(--color-text-muted)] w-24 text-right">{s.visitors.toLocaleString()} ({pct.toFixed(0)}%)</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

const FILTER_LABELS: Record<string, string> = {
  country: 'Country', region: 'Region', city: 'City', browser: 'Browser',
  os: 'OS', device: 'Device', path: 'Page', source: 'Source', hostname: 'Host',
}

const METRICS = [
  { value: 'visitors',  label: 'Visitors',  color: '#0052F2' },
  { value: 'pageviews', label: 'Pageviews', color: '#7C3AED' },
  { value: 'sessions',  label: 'Sessions',  color: '#059669' },
]

function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return '0s'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return s ? `${m}m ${s}s` : `${m}m`
}

function BreakdownCard({ title, rows, metric, filterKey, onFilter }: {
  title: string; rows: Row[]; metric: 'views' | 'sessions' | 'visitors' | 'downloads' | 'events' | 'clicks'
  filterKey?: string; onFilter?: (k: string, v: string) => void
}) {
  const max = rows[0]?.[metric] ?? 1
  const clickable = !!filterKey && !!onFilter
  return (
    <Card>
      <h2 className="type-h3-16 text-[var(--color-text)] mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No data</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <button
              key={r.value}
              disabled={!clickable}
              onClick={() => clickable && onFilter!(filterKey!, r.value)}
              className={`flex items-center gap-3 w-full text-left ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}
            >
              <span className={`type-small-body w-44 truncate ${clickable ? 'text-[var(--color-text)] group-hover:text-[#0052F2]' : 'text-[var(--color-text)]'}`} title={r.value}>{r.value}</span>
              <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                <div className="h-full accent-gradient rounded-full" style={{ width: `${((r[metric] ?? 0) / max) * 100}%` }} />
              </div>
              <span className="type-body-13 text-[var(--color-text-muted)] w-16 text-right">{(r[metric] ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function WebAnalyticsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState('visitors')

  const { data, isLoading } = useQuery({
    queryKey: ['web-analytics', projectId, days, filters],
    queryFn: () => api.webAnalytics(projectId, days, filters),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }))
  const clearFilter = (k: string) => setFilters(f => { const n = { ...f }; delete n[k]; return n })
  const activeFilters = Object.entries(filters)
  const trend = data?.trend ?? []
  const metricColor = METRICS.find(m => m.value === metric)?.color ?? '#0052F2'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Website Analytics"
        subtitle="Pageviews, sessions, top pages and referrers — click any row to filter the whole report"
        actions={
          <div className="flex items-center gap-3">
            {(data?.live_visitors ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 type-caption">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {data.live_visitors} online now
              </span>
            )}
            <DateRangePicker days={days} onChange={setDays} />
          </div>
        }
      />

      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilters.map(([k, v]) => (
            <button key={k} onClick={() => clearFilter(k)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF3FD] text-[#0052F2] type-caption hover:bg-[#dde8fd]">
              <span className="text-[var(--color-text-muted)]">{FILTER_LABELS[k] ?? k}:</span> {v} <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={() => setFilters({})} className="type-body-13 text-[var(--color-text-subtle)] hover:text-[#DE0202]">Clear all</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <StatCard label="Visitors"        value={data?.visitors ?? 0} icon={Users} loading={isLoading} delta={data?.delta_visitors} hint="vs prev. period" />
        <StatCard label="New visitors"    value={data?.new_visitors ?? 0} icon={UserPlus} loading={isLoading} hint={`${(data?.returning_visitors ?? 0).toLocaleString()} returning`} />
        <StatCard label="Pageviews"       value={data?.pageviews ?? 0} icon={Eye} loading={isLoading} delta={data?.delta_pageviews} hint="vs prev. period" />
        <StatCard label="Sessions"        value={data?.sessions ?? 0} icon={MousePointer2} loading={isLoading} delta={data?.delta_sessions} hint="vs prev. period" />
        <StatCard label="Bounce rate"     value={`${((data?.bounce_rate ?? 0) * 100).toFixed(1)}%`} icon={LogOut} loading={isLoading} hint="single-page sessions" />
        <StatCard label="Pages / session" value={(data?.pages_per_session ?? 0).toFixed(2)} icon={Layers} loading={isLoading} />
        <StatCard label="Engaged time"    value={fmtDuration((data?.avg_engagement ?? 0) / 1000)} icon={Timer} loading={isLoading} hint="foreground / session" />
        <StatCard label="Avg session"     value={fmtDuration(data?.avg_duration ?? 0)} icon={Timer} loading={isLoading} hint="first → last event" />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="type-h3-16 text-[var(--color-text)]">Traffic over time</h2>
          <Select value={metric} onChange={setMetric} options={METRICS.map(m => ({ value: m.value, label: m.label }))} className="w-[150px]" />
        </div>
        {isLoading ? (
          <div className="h-64 p-1"><Skeleton className="h-full w-full rounded-lg" /></div>
        ) : trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">No pageviews in this range</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="wm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={metricColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }} />
              <Area type="monotone" dataKey={metric} name={METRICS.find(m => m.value === metric)?.label} stroke={metricColor} strokeWidth={2.5} fill="url(#wm)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <BreakdownCard title="Top pages" rows={data?.top_pages ?? []} metric="views" filterKey="path" onFilter={setFilter} />
        <BreakdownCard title="Top sources" rows={data?.referrers ?? []} metric="sessions" filterKey="source" onFilter={setFilter} />
        <BreakdownCard title="Landing pages (entry)" rows={data?.landing_pages ?? []} metric="sessions" />
        <BreakdownCard title="Exit pages" rows={data?.exit_pages ?? []} metric="sessions" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BreakdownCard title="Locations" rows={data?.countries ?? []} metric="visitors" filterKey="country" onFilter={setFilter} />
        <BreakdownCard title="Browsers" rows={data?.browsers ?? []} metric="visitors" filterKey="browser" onFilter={setFilter} />
        <BreakdownCard title="OS" rows={data?.os ?? []} metric="visitors" filterKey="os" onFilter={setFilter} />
        <BreakdownCard title="Devices" rows={data?.devices ?? []} metric="visitors" filterKey="device" onFilter={setFilter} />
      </div>

      <WebEngagementSection projectId={projectId} days={days} filters={filters} />

      <WebVitalsCard projectId={projectId} days={days} filters={filters} />

      <GoalsCard projectId={projectId} days={days} filters={filters} />
    </div>
  )
}

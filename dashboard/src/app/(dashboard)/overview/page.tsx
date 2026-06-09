'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Users, UserPlus, Timer, Repeat, Zap,
  Globe, Monitor, Smartphone, MousePointerClick, LayersIcon,
} from 'lucide-react'
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return '0s'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s ? `${m}m ${s}s` : `${m}m`
}

const BREAKDOWN_TABS = [
  { key: 'breakdown_country',  label: 'Country',  icon: Globe },
  { key: 'breakdown_platform', label: 'Platform', icon: Monitor },
  { key: 'breakdown_device',   label: 'Device',   icon: Smartphone },
] as const

const RANGES = [7, 30, 90]

export default function OverviewPage() {
  const projectName = useProjectStore(s => s.projectName)
  const projectId = useProjectStore(s => s.projectId)
  const [tab, setTab] = useState<typeof BREAKDOWN_TABS[number]['key']>('breakdown_platform')
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['product-overview', projectId, days],
    queryFn: () => api.productOverview(projectId, days),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const { data: ov } = useQuery({
    queryKey: ['overview', projectId],
    queryFn: () => api.overview(projectId),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const connected: boolean = data?.connected ?? false
  const breakdown: { value: string; users: number }[] = data?.[tab] ?? []
  const bmax = breakdown[0]?.users ?? 1
  const trend: { date: string; dau: number; new_users: number; returning: number; wau: number; mau: number; stickiness: number }[] = data?.trend ?? []
  const ret = data?.retention as { d1: number; d1_eligible: number; d7: number; d7_eligible: number } | undefined
  const topEvents: { event_type: string; count: number; users: number }[] = data?.top_events ?? []
  const topMax = topEvents[0]?.count ?? 1

  return (
    <div className="space-y-5">
      <PageHeader
        title="Product Overview"
        subtitle={`${projectName || 'Your project'} · core product health`}
        actions={
          <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {RANGES.map(r => (
              <button key={r} onClick={() => setDays(r)}
                className={`px-3 py-1.5 type-body-13 transition-colors ${days === r ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
                {r}d
              </button>
            ))}
          </div>
        }
      />

      {/* Current active-user snapshots */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Daily active users"   value={data?.dau ?? 0} icon={Activity} loading={isLoading} delta={data?.delta_dau} hint={`last full day · today ${(data?.dau_today ?? 0).toLocaleString()}`} />
        <StatCard label="Weekly active (WAU)"  value={data?.wau ?? 0} icon={Users} loading={isLoading} delta={data?.delta_wau} hint="vs prior 7d" />
        <StatCard label="Monthly active (MAU)" value={data?.mau ?? 0} icon={Users} loading={isLoading} delta={data?.delta_mau} hint="vs prior 30d" />
        <StatCard label="Stickiness · DAU/MAU" value={`${((data?.stickiness ?? 0) * 100).toFixed(0)}%`} icon={Repeat} loading={isLoading} hint="habitual use" />
        <StatCard label={`New users · ${days}d`} value={data?.new_users ?? 0} icon={UserPlus} loading={isLoading} delta={data?.delta_new_users} hint="vs prior period" />
      </div>

      {/* Engagement depth (windowed) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Avg session duration" value={fmtDuration(data?.avg_session_seconds ?? 0)} icon={Timer} loading={isLoading} hint={`last ${days}d`} />
        <StatCard label="Events / user" value={(data?.events_per_user ?? 0).toFixed(1)} icon={MousePointerClick} loading={isLoading} hint={`last ${days}d`} />
        <StatCard label="Sessions / user" value={(data?.sessions_per_user ?? 0).toFixed(1)} icon={LayersIcon} loading={isLoading} hint={`last ${days}d`} />
        <StatCard label="D1 retention" value={`${((ret?.d1 ?? 0) * 100).toFixed(0)}%`} icon={Repeat} loading={isLoading} hint={`${ret?.d1_eligible ?? 0} new users`} />
        <StatCard label="D7 retention" value={`${((ret?.d7 ?? 0) * 100).toFixed(0)}%`} icon={Repeat} loading={isLoading} hint={`${ret?.d7_eligible ?? 0} new users`} />
      </div>

      {/* Active users · new vs returning (Amplitude-style) */}
      <Card className="min-w-0">
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Active users · last {days} days</h2>
        {trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">
            No active users yet — connect your site.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e7e9f2', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Stacked active users = returning + new (sum = DAU) */}
              <Area type="monotone" dataKey="returning" name="Returning" stackId="au" stroke="#0052F2" strokeWidth={1.5} fill="#0052F2" fillOpacity={0.85} />
              <Area type="monotone" dataKey="new_users" name="New" stackId="au" stroke="#9DBBFB" strokeWidth={1.5} fill="#9DBBFB" fillOpacity={0.9} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top events */}
        <Card className="min-w-0">
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Top events · last {days}d</h2>
          {topEvents.length === 0 ? (
            <p className="type-body-15 text-[var(--color-text-subtle)] py-8 text-center">No events yet</p>
          ) : (
            <div className="space-y-3">
              {topEvents.map(e => (
                <div key={e.event_type} className="flex items-center gap-3">
                  <span className="type-small-body text-[var(--color-text)] w-40 truncate" title={e.event_type}>{e.event_type}</span>
                  <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-[#0052F2] rounded-full" style={{ width: `${(e.count / topMax) * 100}%` }} />
                  </div>
                  <span className="type-body-13 text-[var(--color-text-muted)] w-16 text-right">{e.count.toLocaleString()}</span>
                  <span className="type-body-12-400 text-[var(--color-text-subtle)] w-20 text-right">{e.users.toLocaleString()} users</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Breakdown */}
        <Card className="min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="type-h3-16 text-[var(--color-text)]">Users by</h2>
            <div className="flex gap-1 bg-[var(--color-surface-muted)] p-1 rounded-lg">
              {BREAKDOWN_TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 type-caption rounded-md transition-all ${tab === t.key ? 'bg-white text-[#0052F2] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
          {breakdown.length === 0 ? (
            <p className="type-body-15 text-[var(--color-text-subtle)] py-8 text-center">No data for this dimension yet</p>
          ) : (
            <div className="space-y-3">
              {breakdown.map(b => (
                <div key={b.value} className="flex items-center gap-3">
                  <span className="type-small-body text-[var(--color-text)] w-36 truncate">{b.value}</span>
                  <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                    <div className="h-full accent-gradient rounded-full" style={{ width: `${(b.users / bmax) * 100}%` }} />
                  </div>
                  <span className="type-body-13 text-[var(--color-text-muted)] w-14 text-right">{b.users.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="type-h3-16 text-[var(--color-text)]">Recent activity</h2>
          {connected && <span className="flex items-center gap-1.5 type-caption text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
        </div>
        {(ov?.recent_events?.length ?? 0) === 0 ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-8 text-center">No activity yet</p>
        ) : (
          <div className="space-y-0.5">
            {ov.recent_events.map((e: { event_type: string; user_id: string; event_time: string }, i: number) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-[#EEF3FD]"><Zap className="h-3 w-3 text-[#0052F2]" /></div>
                  <span className="type-small-body text-[var(--color-text)] truncate">{e.event_type}</span>
                  <span className="type-body-13 text-[var(--color-text-subtle)] truncate">· {e.user_id || 'anon'}</span>
                </div>
                <span className="type-body-13 text-[var(--color-text-subtle)] flex-shrink-0">{timeAgo(e.event_time)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

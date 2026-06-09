'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Users, Gauge, AlertTriangle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore, usePermission } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'

interface UsageMonth { month: number; events: number; mtu: number }
interface Usage {
  month: number
  current_events: number
  current_mtu: number
  event_limit: number
  months: UsageMonth[]
}

// 202406 → "Jun"
function monthLabel(yyyymm: number): string {
  const m = yyyymm % 100
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] ?? String(m)
}

export default function UsagePage() {
  const projectId = useProjectStore(s => s.projectId)
  const can = usePermission()
  const qc = useQueryClient()
  const canEdit = can('billing.manage')

  const { data, isLoading } = useQuery<Usage>({
    queryKey: ['usage', projectId],
    queryFn: () => api.usage(projectId),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const [limitInput, setLimitInput] = useState('')
  useEffect(() => {
    if (data) setLimitInput(String(data.event_limit ?? 0))
  }, [data])

  const setLimit = useMutation({
    mutationFn: (v: number) => api.setUsageLimit(projectId, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usage', projectId] }),
  })

  const limit = data?.event_limit ?? 0
  const used = data?.current_events ?? 0
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const over = limit > 0 && used >= limit
  const near = limit > 0 && !over && pct >= 80

  const chart = (data?.months ?? []).map(m => ({
    name: monthLabel(m.month),
    Events: m.events,
    MTU: m.mtu,
  }))

  return (
    <div>
      <PageHeader
        title="Usage & Billing"
        subtitle="Monthly event volume and tracked users (MTU) for this project."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Events this month" value={used} icon={Activity} loading={isLoading} />
        <StatCard label="Tracked users (MTU)" value={data?.current_mtu ?? 0} icon={Users} loading={isLoading} />
        <StatCard
          label="Monthly event limit"
          value={limit > 0 ? limit.toLocaleString() : 'Unlimited'}
          icon={Gauge}
          loading={isLoading}
        />
      </div>

      {limit > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="type-h3-16 text-[var(--color-text)]">Quota</h2>
            <span className="type-body-13 text-[var(--color-text-muted)]">
              {used.toLocaleString()} / {limit.toLocaleString()} ({pct.toFixed(0)}%)
            </span>
          </div>
          <div className="bg-[#EEF3FD] rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: over ? '#DE0202' : near ? '#E8A400' : 'var(--color-accent, #0052F2)',
              }}
            />
          </div>
          {(over || near) && (
            <div className={`flex items-center gap-1.5 mt-2 type-body-13 ${over ? 'text-[#DE0202]' : 'text-[#9A6F00]'}`}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {over
                ? 'Over quota — new events are being rejected (HTTP 429) until next month or a higher limit.'
                : 'Approaching the monthly limit.'}
            </div>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Last 12 months</h2>
        {chart.length === 0 ? (
          <p className="type-body-15 text-[var(--color-text-subtle)] py-10 text-center">No usage yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF3FD" vertical={false} />
              <XAxis dataKey="name" stroke="#8A93A6" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#8A93A6" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E3E8F0', fontSize: 13 }}
                formatter={(v: number) => v.toLocaleString()}
              />
              <Bar dataKey="Events" fill="#0052F2" radius={[3, 3, 0, 0]} />
              <Bar dataKey="MTU" fill="#9DBBFB" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {canEdit && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-1">Monthly event limit</h2>
          <p className="type-body-13 text-[var(--color-text-muted)] mb-3">
            Cap monthly ingestion for this project. Set to 0 for unlimited. Over-quota events are rejected with HTTP 429.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              className="ctrl w-48"
              placeholder="0"
            />
            <button
              onClick={() => setLimit.mutate(Math.max(0, parseInt(limitInput || '0', 10)))}
              disabled={setLimit.isPending}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent,#0052F2)] text-white type-body-13 disabled:opacity-50"
            >
              {setLimit.isPending ? 'Saving…' : 'Save limit'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

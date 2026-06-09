'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, ShoppingCart, Users, TrendingUp, CreditCard, Percent } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'

interface Row { value: string; revenue: number; purchases: number }
interface RevData {
  range_days: number; total_revenue: number; purchases: number; paying_users: number; active_users: number
  arpu: number; arppu: number; aov: number; paid_conversion: number
  delta_revenue?: number | null; delta_paying?: number | null; currency: string
  trend: { date: string; revenue: number; purchases: number }[]
  by_product: Row[]; by_type: Row[]; by_currency: Row[]
}

const RANGES = [7, 30, 90]

function money(v: number, cur: string): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(v || 0) }
  catch { return `${(v || 0).toFixed(2)} ${cur}` }
}

function RevBreakdown({ title, rows, cur }: { title: string; rows: Row[]; cur: string }) {
  const max = rows[0]?.revenue ?? 1
  return (
    <Card className="min-w-0">
      <h2 className="type-h3-16 text-[var(--color-text)] mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="type-body-15 text-[var(--color-text-subtle)] py-6 text-center">No revenue yet</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.value} className="flex items-center gap-3">
              <span className="type-small-body text-[var(--color-text)] w-40 truncate" title={r.value}>{r.value}</span>
              <div className="flex-1 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                <div className="h-full bg-[#0052F2] rounded-full" style={{ width: `${(r.revenue / max) * 100}%` }} />
              </div>
              <span className="type-body-13 text-[var(--color-text)] w-24 text-right">{money(r.revenue, cur)}</span>
              <span className="type-body-12-400 text-[var(--color-text-subtle)] w-20 text-right">{r.purchases.toLocaleString()} orders</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function RevenuePage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery<RevData>({
    queryKey: ['revenue', projectId, days],
    queryFn: () => api.revenue(projectId, days),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const cur = data?.currency ?? 'USD'
  const trend = data?.trend ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue"
        subtitle="Monetization — revenue, paying users, ARPU & order value"
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label={`Total revenue · ${days}d`} value={money(data?.total_revenue ?? 0, cur)} icon={DollarSign} loading={isLoading} delta={data?.delta_revenue} hint="vs prior period" />
        <StatCard label="Paying users" value={data?.paying_users ?? 0} icon={Users} loading={isLoading} delta={data?.delta_paying} hint="distinct buyers" />
        <StatCard label="Purchases" value={data?.purchases ?? 0} icon={ShoppingCart} loading={isLoading} hint="revenue events" />
        <StatCard label="ARPU" value={money(data?.arpu ?? 0, cur)} icon={TrendingUp} loading={isLoading} hint="per active user" />
        <StatCard label="ARPPU" value={money(data?.arppu ?? 0, cur)} icon={CreditCard} loading={isLoading} hint="per paying user" />
        <StatCard label="Avg order value" value={money(data?.aov ?? 0, cur)} icon={DollarSign} loading={isLoading} hint={`paid conv ${((data?.paid_conversion ?? 0) * 100).toFixed(1)}%`} />
      </div>

      <Card className="min-w-0">
        <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Revenue · last {days} days</h2>
        {trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">No revenue events yet — call <code className="mx-1">revenue()</code> in your SDK.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#98a0b8' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => money(v, cur)} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e7e9f2', fontSize: 13 }} formatter={(v: number) => money(v, cur)} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" strokeWidth={2.5} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RevBreakdown title="Top products" rows={data?.by_product ?? []} cur={cur} />
        <RevBreakdown title="By revenue type" rows={data?.by_type ?? []} cur={cur} />
        <RevBreakdown title="By currency" rows={data?.by_currency ?? []} cur={cur} />
      </div>
    </div>
  )
}

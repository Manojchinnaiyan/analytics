'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { DollarSign, ShoppingCart, TrendingUp, Package, Percent, ArrowRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { PageSkeleton } from '@/components/ui/Skeleton'

const RANGES = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }]
const money = (n: number) => '$' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const num = (n: number) => (n || 0).toLocaleString()

const CHART_METRICS = [
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'orders', label: 'Orders', money: false },
  { key: 'views', label: 'Product views', money: false },
] as const
type ChartKey = (typeof CHART_METRICS)[number]['key']

export default function EcommercePage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)
  const [chartMetric, setChartMetric] = useState<ChartKey>('revenue')

  const { data: ov, isLoading } = useQuery({
    queryKey: ['ecom-overview', projectId, days],
    queryFn: () => api.ecommerceOverview(projectId, days),
    enabled: !!projectId,
  })
  const { data: pd } = useQuery({
    queryKey: ['ecom-products', projectId, days],
    queryFn: () => api.ecommerceProducts(projectId, days),
    enabled: !!projectId,
  })

  if (isLoading) return <PageSkeleton />

  const products = (pd?.products ?? []).slice(0, 8)
  const maxViews = Math.max(1, ...products.map(p => p.views))
  const f = ov?.funnel ?? { viewed: 0, carted: 0, checkout: 0, purchased: 0 }
  const maxFunnel = Math.max(1, f.viewed)
  const steps = [
    { label: 'Viewed product', n: f.viewed, color: '#0052F2' },
    { label: 'Added to cart', n: f.carted, color: '#3B82F6' },
    { label: 'Checkout started', n: f.checkout, color: '#8B5CF6' },
    { label: 'Purchased', n: f.purchased, color: '#16A34A' },
  ]
  const kpis = [
    { label: 'Revenue', value: money(ov?.revenue ?? 0), icon: DollarSign },
    { label: 'Orders', value: num(ov?.orders ?? 0), icon: ShoppingCart },
    { label: 'Avg order value', value: money(ov?.aov ?? 0), icon: TrendingUp },
    { label: 'Conversion', value: (ov?.conversion ?? 0).toFixed(2) + '%', icon: Percent },
    { label: 'Units sold', value: num(ov?.units ?? 0), icon: Package },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ecommerce"
        subtitle="Your store at a glance — revenue, funnel and products"
        actions={
          <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {RANGES.map(r => (
              <button key={r.d} onClick={() => setDays(r.d)}
                className={`px-3 py-1.5 type-caption transition-colors ${days === r.d ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <div className="flex items-center gap-2 type-caption text-[var(--color-text-muted)]"><k.icon className="h-4 w-4 text-[#0052F2]" /> {k.label}</div>
            <div className="mt-2 type-h2 text-[var(--color-text)]">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="type-h3-16 text-[var(--color-text)]">Trend</h3>
          <div className="flex gap-1">
            {CHART_METRICS.map(m => (
              <button key={m.key} onClick={() => setChartMetric(m.key)}
                className={`px-2.5 py-1 type-body-12-400 rounded-md transition-colors ${chartMetric === m.key ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {(ov?.trend?.length ?? 0) === 0 ? (
          <p className="py-12 text-center type-body-13 text-[var(--color-text-subtle)]">No activity in this range yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={ov!.trend} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="ecomGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0052F2" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#0052F2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} tickFormatter={(d: string) => String(d).slice(5)} />
              <YAxis tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v: number) => [chartMetric === 'revenue' ? money(v) : num(v), CHART_METRICS.find(m => m.key === chartMetric)?.label]} />
              <Area type="monotone" dataKey={chartMetric} stroke="#0052F2" strokeWidth={2} fill="url(#ecomGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <h3 className="type-h3-16 text-[var(--color-text)] mb-4">Shopping funnel</h3>
        <div className="space-y-3">
          {steps.map((s, i) => {
            const pct = (s.n / maxFunnel) * 100
            const conv = i > 0 && steps[i - 1].n > 0 ? (s.n / steps[i - 1].n * 100).toFixed(1) + '%' : ''
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between type-body-13 mb-1">
                  <span className="text-[var(--color-text)] font-medium">{s.label}</span>
                  <span className="text-[var(--color-text)] tabular-nums font-medium">{num(s.n)}{conv && <span className="ml-2 type-body-12-400 text-[var(--color-text-muted)] font-normal">{conv} of prev</span>}</span>
                </div>
                <div className="h-7 rounded-md bg-[var(--color-surface-muted)] overflow-hidden">
                  <div className="h-full rounded-md transition-all" style={{ width: `${Math.max(2, pct)}%`, background: s.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="type-h3-16 text-[var(--color-text)]">Top products by views</h3>
          <Link href="/ecommerce/products" className="type-body-13 text-[#0052F2] hover:underline inline-flex items-center gap-1">All products <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {products.length === 0 ? (
          <p className="py-8 text-center type-body-13 text-[var(--color-text-subtle)]">No product activity yet — browse your store to populate this.</p>
        ) : (
          <div className="space-y-2.5">
            {products.map(p => (
              <div key={p.product} className="flex items-center gap-3">
                <span className="type-body-13 text-[var(--color-text)] truncate w-40 sm:w-56 flex-shrink-0" title={p.product}>{p.product}</span>
                <div className="flex-1 h-5 rounded bg-[var(--color-surface-muted)] overflow-hidden">
                  <div className="h-full rounded bg-[#0052F2]" style={{ width: `${Math.max(2, p.views / maxViews * 100)}%` }} />
                </div>
                <span className="type-body-13 text-[var(--color-text)] tabular-nums w-20 text-right flex-shrink-0">{num(p.views)} <span className="text-[var(--color-text-subtle)]">views</span></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

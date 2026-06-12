'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { api, type EcommerceProduct } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { TableSkeleton } from '@/components/ui/Skeleton'

const METRICS = [
  { key: 'views', label: 'Views' },
  { key: 'carts', label: 'Add to cart' },
  { key: 'units', label: 'Units sold' },
  { key: 'revenue', label: 'Revenue' },
] as const
type MetricKey = (typeof METRICS)[number]['key']
const RANGES = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }]

export default function EcommerceProductsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<MetricKey>('views')

  const { data, isLoading } = useQuery({
    queryKey: ['ecom-products', projectId, days],
    queryFn: () => api.ecommerceProducts(projectId, days),
    enabled: !!projectId,
  })

  const products = [...(data?.products ?? [])].sort((a, b) => (b[metric] as number) - (a[metric] as number))
  const maxViews = Math.max(1, ...products.map(p => p.views))
  const fmt = (n: number) => metric === 'revenue' ? '$' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) : (n || 0).toLocaleString()
  const buyRate = (p: EcommerceProduct) => p.views > 0 ? (p.units / p.views * 100).toFixed(1) + '%' : '—'

  return (
    <div className="space-y-5">
      <Link href="/ecommerce" className="inline-flex items-center gap-1.5 type-body-13 text-[var(--color-text-muted)] hover:text-[#0052F2]">
        <ArrowLeft className="h-4 w-4" /> Ecommerce
      </Link>
      <PageHeader
        title="Products"
        subtitle="Ranked product performance — views, cart, units, revenue"
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

      <Card>
        {/* Metric toggle */}
        <div className="flex flex-wrap gap-1 mb-5">
          {METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`px-3 py-1.5 type-caption rounded-md transition-colors ${metric === m.key ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={8} /></div>
        ) : products.length === 0 ? (
          <p className="py-10 text-center type-body-13 text-[var(--color-text-subtle)]">No product activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[680px] space-y-2.5">
              <div className="flex items-center gap-3 type-caption text-[var(--color-text-muted)] pb-1 border-b border-[var(--color-border)]">
                <span className="w-6 flex-shrink-0" />
                <span className="w-40 sm:w-48 flex-shrink-0">Product</span>
                <span className="flex-1">Funnel</span>
                <span className="w-32 text-right flex-shrink-0">Views → Cart → Buy</span>
                <span className="w-20 text-right flex-shrink-0">{METRICS.find(m => m.key === metric)?.label}</span>
                <span className="w-14 text-right flex-shrink-0">Rate</span>
              </div>
              {products.map((p, i) => {
                const br = p.views > 0 ? p.units / p.views : 0
                return (
                  <div key={p.product} className="flex items-center gap-3">
                    <span className="w-6 text-right type-body-12-400 text-[var(--color-text-subtle)] flex-shrink-0">{i + 1}</span>
                    <span className="w-40 sm:w-48 truncate type-body-13 text-[var(--color-text)] flex-shrink-0" title={p.product}>{p.product}</span>
                    {/* Nested funnel bar (visual): views → cart → bought */}
                    <div className="flex-1 relative h-5 rounded bg-[var(--color-surface-muted)] overflow-hidden" title={`${p.views} views → ${p.carts} cart → ${p.units} bought`}>
                      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(2, p.views / maxViews * 100)}%`, background: 'rgba(0,82,242,.22)' }} />
                      <div className="absolute inset-y-0 left-0" style={{ width: `${p.carts / maxViews * 100}%`, background: 'rgba(0,82,242,.65)' }} />
                      <div className="absolute inset-y-0 left-0" style={{ width: `${p.units / maxViews * 100}%`, background: '#16A34A' }} />
                    </div>
                    {/* Clear numeric funnel — dark text, own column */}
                    <span className="w-32 text-right type-body-13 text-[var(--color-text)] tabular-nums flex-shrink-0">
                      {p.views} <span className="text-[var(--color-text-subtle)]">→</span> {p.carts} <span className="text-[var(--color-text-subtle)]">→</span> {p.units}
                    </span>
                    <span className="w-20 text-right type-body-13 text-[var(--color-text)] tabular-nums flex-shrink-0">{fmt(p[metric] as number)}</span>
                    <span className={`w-14 text-right type-small-body tabular-nums flex-shrink-0 ${br >= 0.05 ? 'text-[#16794C]' : br > 0 ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-subtle)]'}`}>{buyRate(p)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton, PageSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { Repeat, Users, Sparkles, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { LifecycleChart, type LifecycleRow } from '@/components/charts/LifecycleChart'
import { ExportButton } from '@/components/ExportButton'

export default function LifecyclePage() {
  const projectId = useProjectStore(s => s.projectId)
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['lifecycle', projectId, days],
    queryFn: () => api.lifecycle(projectId, days),
    enabled: !!projectId,
  })

  const series: LifecycleRow[] = data?.series ?? []
  const pct = (v: number) => `${((v ?? 0) * 100).toFixed(1)}%`

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lifecycle & Stickiness"
        subtitle="New, current, resurrected and dormant users over time — plus how sticky your product is"
        actions={
          <ExportButton
            filename={`lifecycle-${days}d`}
            rows={series as unknown as Record<string, unknown>[]}
          />
        }
      />

      {/* Growth accounting + stickiness ratios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Quick Ratio"
          value={isLoading ? '—' : (data?.quick_ratio ?? 0).toFixed(2)}
          icon={TrendingUp}
          loading={isLoading}
          hint={data?.totals ? `(${data.totals.new}+${data.totals.resurrected}) new/resurrected ÷ ${data.totals.churned} churned · >1 = growing` : 'growth vs churn'}
        />
        <StatCard label="Stickiness (DAU / MAU)" value={isLoading ? '—' : pct(data?.stickiness_dau_mau)} icon={Sparkles} loading={isLoading} hint="Share of monthly users active today" />
        <StatCard label="DAU / WAU" value={isLoading ? '—' : pct(data?.stickiness_dau_wau)} icon={Repeat} loading={isLoading} />
        <StatCard label="WAU / MAU" value={isLoading ? '—' : pct(data?.stickiness_wau_mau)} icon={Users} loading={isLoading} />
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
          <h2 className="type-h3-16 text-[var(--color-text)]">User lifecycle</h2>
          <DateRangePicker days={days} onChange={setDays} />
        </div>

        {isLoading
          ? <div className="h-80 p-1"><Skeleton className="h-full w-full rounded-lg" /></div>
          : <LifecycleChart data={series} />
        }

        <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 type-body-13 text-[var(--color-text-subtle)]">
          <span><b className="text-[#059669]">New</b> — first ever active that day</span>
          <span><b className="text-[#0052F2]">Current</b> — active that day and the day before</span>
          <span><b className="text-[#7C3AED]">Resurrected</b> — came back after being away</span>
          <span><b className="text-[#DC2626]">Dormant</b> — active yesterday, gone today</span>
        </div>
      </Card>
    </div>
  )
}

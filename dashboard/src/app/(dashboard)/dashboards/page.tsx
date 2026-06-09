'use client'

import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, LayoutDashboard, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { SegmentationChart } from '@/components/charts/SegmentationChart'
import { rangeFromDays } from '@/components/ui/DateRangePicker'

interface SavedChart {
  id: string
  name: string
  type: string
  config: {
    event_type: string
    metric?: string
    property?: string
    group_by?: string
    days?: number
  }
}

function ChartTile({ chart, onDelete }: { chart: SavedChart; onDelete: () => void }) {
  const projectId = useProjectStore(s => s.projectId)
  const cfg = chart.config
  const { start, end } = rangeFromDays(cfg.days ?? 30)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-chart', chart.id, projectId],
    queryFn: () => api.segmentation({
      project_id: projectId, event_type: cfg.event_type, start, end, granularity: 'day',
      metric: (cfg.metric as 'totals') ?? 'totals', property: cfg.property, group_by: cfg.group_by,
    }),
    enabled: !!projectId,
  })

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="type-h3-16 text-[var(--color-text)] truncate">{chart.name}</h3>
          <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-0.5 truncate">{cfg.event_type} · {cfg.metric ?? 'totals'}{cfg.group_by ? ` by ${cfg.group_by}` : ''}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Link href={`/charts?chart=${chart.id}`} title="Open in builder" className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#0052F2]"><Pencil className="h-4 w-4" /></Link>
          <button onClick={onDelete} title="Delete" className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {isLoading
        ? <div className="h-80 flex items-center justify-center type-body-13 text-[var(--color-text-subtle)]">Loading…</div>
        : <div className="h-80 min-w-0"><SegmentationChart data={data?.data ?? []} metric={cfg.metric ?? 'Events'} /></div>}
    </Card>
  )
}

export default function DashboardsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboards', projectId],
    queryFn: () => api.dashboards(projectId),
    enabled: !!projectId,
  })
  const charts: SavedChart[] = data?.charts ?? []

  async function remove(id: string) {
    await api.deleteDashboardChart(projectId, id)
    qc.invalidateQueries({ queryKey: ['dashboards', projectId] })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboards" subtitle="Your saved charts, all in one place" />

      {isLoading ? (
        <Card><div className="h-40 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div></Card>
      ) : charts.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><LayoutDashboard className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text)]">No saved charts yet.</p>
            <p className="type-body-13 text-[var(--color-text-subtle)] mt-1">Go to <span className="text-[#0052F2]">Segmentation</span>, build a chart, and click <span className="type-caption text-[var(--color-text)]">Save to dashboard</span>.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {charts.map(c => <ChartTile key={c.id} chart={c} onDelete={() => remove(c.id)} />)}
        </div>
      )}
    </div>
  )
}

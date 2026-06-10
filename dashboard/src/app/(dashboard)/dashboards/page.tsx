'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, LayoutDashboard, Pencil, Share2, Globe2, Copy, Check, Lock } from 'lucide-react'
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

function ShareDashboard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = token ? `${origin}/public/${token}` : ''

  useEffect(() => {
    if (!projectId) return
    api.getDashboardShare(projectId).then(r => setToken(r.token)).catch(() => {})
  }, [projectId])

  async function enable() {
    setLoading(true)
    try { const r = await api.enableDashboardShare(projectId); setToken(r.token) } finally { setLoading(false) }
  }
  async function disable() {
    setLoading(true)
    try { await api.disableDashboardShare(projectId); setToken(null) } finally { setLoading(false) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5">
        <Share2 className="h-4 w-4" /> Share{token ? ' · live' : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[var(--color-border)] bg-white shadow-[0_24px_60px_-18px_rgba(16,24,40,.28)] p-4 z-20">
            <div className="flex items-center gap-2 mb-1"><Globe2 className="h-4 w-4 text-[#0052F2]" /><span className="type-small-body text-[var(--color-text)]">Public dashboard</span></div>
            <p className="type-body-12-400 text-[var(--color-text-subtle)] mb-3">Anyone with the link can view these charts — read-only, no login.</p>
            {token ? (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <input readOnly value={url} onFocus={e => e.currentTarget.select()} className="flex-1 ctrl text-[12px]" />
                  <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }} title="Copy" className="p-2 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-[var(--color-text-muted)]" />}
                  </button>
                </div>
                <button onClick={disable} disabled={loading} className="w-full type-body-13 text-[#DE0202] hover:bg-red-50 rounded-md py-1.5 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Lock className="h-3.5 w-3.5" /> Make private
                </button>
              </>
            ) : (
              <button onClick={enable} disabled={loading} className="w-full btn-brand py-2 type-caption rounded-md disabled:opacity-50">
                {loading ? 'Enabling…' : 'Enable public link'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
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
      <PageHeader title="Dashboards" subtitle="Your saved charts, all in one place" actions={<ShareDashboard projectId={projectId} />} />

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

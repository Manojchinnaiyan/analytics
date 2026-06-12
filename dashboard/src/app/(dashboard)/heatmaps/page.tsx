'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MousePointerClick, ArrowDownWideNarrow, Info } from 'lucide-react'
import 'rrweb/dist/style.css'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { Skeleton, PageSkeleton } from '@/components/ui/Skeleton'

interface HeatPoint { rx: number; y: number; count: number }
interface ScrollReach { depth: number; pct: number }
interface ClickedEl { label: string; count: number }

const REF_WIDTH = 1280   // grid-fallback heatmap is drawn against a 1280px reference
const MAX_HEIGHT = 8000  // cap very long pages

// Build a 256-entry RGB lookup (blue → cyan → green → yellow → red).
function gradientPalette(): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = 1; c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0.0, '#2563eb')
  g.addColorStop(0.35, '#22d3ee')
  g.addColorStop(0.55, '#22c55e')
  g.addColorStop(0.75, '#facc15')
  g.addColorStop(1.0, '#ef4444')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1, 256)
  return ctx.getImageData(0, 0, 1, 256).data
}

// simpleheat-style render: accumulate grayscale alpha blobs, then colorize.
// Points are placed at x = rx·refWidth, y = page px; bounds = canvas.width/height.
function drawHeatmap(canvas: HTMLCanvasElement, points: HeatPoint[], refWidth: number) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (points.length === 0) return

  const maxCount = Math.max(...points.map(p => p.count))
  const radius = 26
  for (const p of points) {
    const x = p.rx * refWidth
    if (p.y > canvas.height) continue
    const intensity = Math.max(0.12, Math.min(1, p.count / maxCount))
    ctx.globalAlpha = intensity
    const grd = ctx.createRadialGradient(x, p.y, 0, x, p.y, radius)
    grd.addColorStop(0, 'rgba(0,0,0,1)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(x, p.y, radius, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = img.data
  const palette = gradientPalette()
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a > 0) {
      const o = a * 4
      data[i] = palette[o]
      data[i + 1] = palette[o + 1]
      data[i + 2] = palette[o + 2]
      data[i + 3] = Math.min(255, a + 40)
    }
  }
  ctx.putImageData(img, 0, 0)
}

function EmptyClicks() {
  return (
    <div className="py-20 text-center">
      <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><MousePointerClick className="h-6 w-6 text-[#0052F2]" /></div>
      <p className="type-body-15 text-[var(--color-text)]">No click data for this page yet</p>
      <p className="type-body-13 text-[var(--color-text-subtle)] mt-1">Clicks are captured automatically — data appears as visitors interact with the page.</p>
    </div>
  )
}

// Grid-background fallback used when no replay snapshot exists for the page.
function GridHeatmap({ points }: { points: HeatPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const height = Math.min(MAX_HEIGHT, Math.max(420, (Math.max(0, ...points.map(p => p.y)) + 60)))

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = REF_WIDTH
    cv.height = height
    drawHeatmap(cv, points, REF_WIDTH)
  }, [points, height])

  if (points.length === 0) return <EmptyClicks />
  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-white">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, #f1f5f9 1px, transparent 1px)', backgroundSize: `${100 / 12}% 100%` }} />
      <canvas ref={ref} className="relative w-full h-auto block" />
    </div>
  )
}

type Snap = { found: boolean; width?: number; height?: number; events?: unknown[] }

// Renders a real recorded page (rrweb static snapshot) with the click heat overlaid.
// Falls back to the grid heatmap when no recording matches the page.
function SnapshotHeatmap({ projectId, path, days, points, onMode }: {
  projectId: string; path: string; days: number; points: HeatPoint[]; onMode: (m: 'snapshot' | 'grid') => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  const { data } = useQuery<Snap>({
    queryKey: ['heatmap-snapshot', projectId, path, days],
    queryFn: () => api.heatmapSnapshot(projectId, path, days),
    enabled: !!projectId && !!path,
  })

  useEffect(() => {
    setFailed(false)
    if (!data?.found || !data.events || !hostRef.current) return
    const host = hostRef.current
    const snapW = data.width || 1280
    let cancelled = false

    const fit = (r: { iframe?: HTMLIFrameElement }) => {
      const wrapper = host.querySelector('.replayer-wrapper') as HTMLElement | null
      const iframe = r.iframe
      if (!wrapper || !iframe) return
      let fullH = data.height || 800
      try {
        const doc = iframe.contentDocument!
        fullH = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0, data.height || 0)
      } catch { /* same-origin expected; fall back to viewport height */ }
      const maxClickY = Math.max(0, ...points.map(p => p.y))
      fullH = Math.min(MAX_HEIGHT, Math.max(fullH, maxClickY + 40, 420))

      iframe.style.height = `${fullH}px`
      wrapper.style.height = `${fullH}px`
      const availW = host.clientWidth || snapW
      const scale = Math.min(availW / snapW, 1)
      wrapper.style.transform = `scale(${scale})`
      wrapper.style.transformOrigin = 'top left'
      host.style.height = `${Math.round(fullH * scale)}px`

      const cv = canvasRef.current
      if (cv) {
        cv.width = snapW
        cv.height = fullH
        drawHeatmap(cv, points, snapW)
        cv.style.width = `${snapW}px`
        cv.style.height = `${fullH}px`
        cv.style.transform = `scale(${scale})`
        cv.style.transformOrigin = 'top left'
      }
    }

    let cleanup = () => {}
    host.innerHTML = ''
    import('rrweb')
      .then(mod => {
        if (cancelled || !hostRef.current) return
        const Ctor = (mod as unknown as { Replayer: new (e: unknown[], o: unknown) => { iframe?: HTMLIFrameElement; pause: () => void } }).Replayer
        const r = new Ctor(data.events as unknown[], { root: host, mouseTail: false, skipInactive: true })
        try { r.pause() } catch { /* already static at frame 0 */ }
        onMode('snapshot')
        requestAnimationFrame(() => fit(r))
        setTimeout(() => fit(r), 500) // re-fit after styles/images load
        const onResize = () => fit(r)
        window.addEventListener('resize', onResize)
        cleanup = () => window.removeEventListener('resize', onResize)
      })
      .catch(() => setFailed(true))

    return () => { cancelled = true; cleanup(); if (hostRef.current) hostRef.current.innerHTML = '' }
  }, [data, points, onMode])

  // Signal grid mode (for the caption) when there's no matching recording.
  useEffect(() => {
    if (data && (!data.found || failed)) onMode('grid')
  }, [data, failed, onMode])

  // No matching recording (or render failed) → grid fallback.
  if (data && (!data.found || failed)) {
    return <GridHeatmap points={points} />
  }
  if (!data) return <div className="h-[420px]"><Skeleton className="h-full w-full rounded-lg" /></div>
  if (points.length === 0) return <EmptyClicks />

  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] bg-white">
      <div ref={hostRef} className="relative w-full" />
      <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" />
    </div>
  )
}

export default function HeatmapsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [path, setPath] = useState('')
  const [days, setDays] = useState(30)
  const [mode, setMode] = useState<'snapshot' | 'grid'>('grid')

  const { data, isLoading } = useQuery({
    queryKey: ['heatmap', projectId, path, days],
    queryFn: () => api.heatmap(projectId, path, days),
    enabled: !!projectId,
  })

  const paths: string[] = data?.paths ?? []
  const points: HeatPoint[] = data?.points ?? []
  const scroll: ScrollReach[] = data?.scroll ?? []
  const elements: ClickedEl[] = data?.elements ?? []
  const activePath = data?.path ?? path
  const maxEl = elements[0]?.count ?? 1

  if (isLoading && !data) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Heatmaps"
        subtitle="See where visitors click and how far they scroll on each page"
        actions={<DateRangePicker days={days} onChange={setDays} />}
      />

      {/* Page picker */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px]">
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Page</span>
            <Select
              value={activePath}
              onChange={setPath}
              options={paths.length ? paths.map(p => ({ value: p, label: p })) : [{ value: '', label: 'No pages with click data yet' }]}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-4 pb-2">
            <span className="type-body-13 text-[var(--color-text-muted)]"><b className="text-[var(--color-text)]">{(data?.total_clicks ?? 0).toLocaleString()}</b> clicks</span>
            <span className="type-body-13 text-[var(--color-text-muted)]"><b className="text-[var(--color-text)]">{(data?.pageviews ?? 0).toLocaleString()}</b> views</span>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Click heatmap */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="type-h3-16 text-[var(--color-text)] flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-[#0052F2]" /> Click heatmap</h2>
            {points.length > 0 && (
              <div className="flex items-center gap-2 type-body-12-400 text-[var(--color-text-subtle)]">
                Low
                <span className="h-2.5 w-28 rounded-full" style={{ background: 'linear-gradient(90deg,#2563eb,#22d3ee,#22c55e,#facc15,#ef4444)' }} />
                High
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="h-[420px]"><Skeleton className="h-full w-full rounded-lg" /></div>
          ) : (
            <SnapshotHeatmap projectId={projectId} path={activePath} days={days} points={points} onMode={setMode} />
          )}
          <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-3 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {mode === 'snapshot'
              ? 'Overlaid on a real recorded view of this page (from Session Replay). Hotter areas = more clicks.'
              : 'No session recording for this page yet — showing positions on a reference grid. Record a session to see the heat on the real page.'}
          </p>
        </Card>

        {/* Side panels */}
        <div className="space-y-4">
          <Card>
            <h2 className="type-h3-16 text-[var(--color-text)] mb-4 flex items-center gap-2"><ArrowDownWideNarrow className="h-4 w-4 text-[#0052F2]" /> Scroll reach</h2>
            <div className="space-y-3">
              {scroll.map(s => (
                <div key={s.depth} className="flex items-center gap-3">
                  <span className="type-small-body text-[var(--color-text)] w-12">{s.depth}%</span>
                  <div className="flex-1 bg-[#EEF3FD] rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.pct * 100}%`, background: 'linear-gradient(90deg,#22c55e,#facc15,#ef4444)' }} />
                  </div>
                  <span className="type-body-13 text-[var(--color-text-muted)] w-12 text-right">{(s.pct * 100).toFixed(0)}%</span>
                </div>
              ))}
              <p className="type-body-12-400 text-[var(--color-text-subtle)] pt-1">Share of viewers who scrolled at least this far down the page.</p>
            </div>
          </Card>

          <Card>
            <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Most-clicked elements</h2>
            {elements.length === 0 ? (
              <p className="type-body-13 text-[var(--color-text-subtle)] py-4 text-center">No element clicks yet.</p>
            ) : (
              <div className="space-y-2.5">
                {elements.map((e, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="type-small-body text-[var(--color-text)] flex-1 truncate" title={e.label}>{e.label}</span>
                    <div className="w-20 bg-[#EEF3FD] rounded-full h-2 overflow-hidden">
                      <div className="h-full accent-gradient rounded-full" style={{ width: `${(e.count / maxEl) * 100}%` }} />
                    </div>
                    <span className="type-body-13 text-[var(--color-text-muted)] w-10 text-right">{e.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

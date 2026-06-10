'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Card } from '@/components/ui/Card'

// IMPORTANT: the player must match the rrweb version the SDK *records* with
// (packages/sdk-browser → rrweb 2.0.0-alpha.4). Playing alpha.4 recordings with a
// newer rrweb-player blanks the DOM (only the cursor renders). We use the matching
// rrweb Replayer so the recorded page actually reconstructs.
const RRWEB_JS = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.4/dist/rrweb.min.js'
const RRWEB_CSS = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.4/dist/rrweb.min.css'

type Replayer = {
  play: (timeOffset?: number) => void
  pause: () => void
  getCurrentTime?: () => number
}

let loaderPromise: Promise<void> | null = null
function loadRrweb(): Promise<void> {
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${RRWEB_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = RRWEB_CSS
      document.head.appendChild(link)
    }
    if ((window as unknown as { rrweb?: { Replayer?: unknown } }).rrweb?.Replayer) return resolve()
    const s = document.createElement('script')
    s.src = RRWEB_JS
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('failed'))
    document.body.appendChild(s)
  })
  return loaderPromise
}

// Scale the recorded viewport down to fit our container width.
function fit(target: HTMLElement) {
  const wrapper = target.querySelector('.replayer-wrapper') as HTMLElement | null
  if (!wrapper) return
  const recW = parseFloat(wrapper.style.width) || wrapper.offsetWidth || 1280
  const recH = parseFloat(wrapper.style.height) || wrapper.offsetHeight || 800
  const scale = Math.min(1, (target.clientWidth || recW) / recW)
  wrapper.style.transform = `scale(${scale})`
  wrapper.style.transformOrigin = 'top left'
  target.style.height = `${Math.round(recH * scale)}px`
}

export default function ReplayPlayerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const decoded = decodeURIComponent(sessionId)
  const projectId = useProjectStore(s => s.projectId)
  const ref = useRef<HTMLDivElement>(null)
  const replayerRef = useRef<Replayer | null>(null)
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['replay', projectId, decoded],
    queryFn: () => api.replay(projectId, decoded),
    enabled: !!projectId,
  })
  const events = data?.events as unknown[] | undefined

  useEffect(() => {
    if (!events || !ref.current) return
    if (events.length < 2) { setErr('This recording is too short to play.'); return }
    const target = ref.current
    loadRrweb().then(() => {
      target.innerHTML = ''
      try {
        const rrweb = (window as unknown as { rrweb: { Replayer: new (e: unknown[], o: unknown) => Replayer } }).rrweb
        const replayer = new rrweb.Replayer(events, { root: target, mouseTail: true, skipInactive: true })
        replayerRef.current = replayer
        replayer.play()
        setPlaying(true)
        requestAnimationFrame(() => fit(target))
        setTimeout(() => fit(target), 400)
      } catch {
        setErr('Could not initialise the player for this recording.')
      }
    }).catch(() => setErr('Failed to load the replay player.'))
    return () => { try { replayerRef.current?.pause() } catch { /* noop */ }; target.innerHTML = ''; replayerRef.current = null }
  }, [events])

  function toggle() {
    const r = replayerRef.current
    if (!r) return
    if (playing) { r.pause(); setPlaying(false) }
    else { r.play(r.getCurrentTime?.() ?? 0); setPlaying(true) }
  }
  function restart() {
    const r = replayerRef.current
    if (!r) return
    r.play(0); setPlaying(true)
  }

  return (
    <div className="space-y-4">
      <Link href="/replay" className="inline-flex items-center gap-1.5 type-body-13 text-[var(--color-text-muted)] hover:text-[#0052F2]">
        <ArrowLeft className="h-4 w-4" /> Back to recordings
      </Link>
      <h1 className="type-h3 text-[var(--color-text)]">Session {decoded.slice(0, 24)}…</h1>

      <Card>
        {isLoading ? (
          <div className="h-96 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">Loading recording…</div>
        ) : err ? (
          <div className="h-96 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">{err}</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={toggle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0052F2] text-white type-caption hover:bg-[#0043c4] transition-colors">
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={restart} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text)] type-caption hover:bg-[var(--color-surface-muted)] transition-colors">
                <RotateCcw className="h-3.5 w-3.5" /> Restart
              </button>
            </div>
            <div ref={ref} className="rr-player-wrap w-full overflow-hidden bg-white rounded-lg border border-[var(--color-border)] min-h-[400px]" />
          </>
        )}
      </Card>
    </div>
  )
}

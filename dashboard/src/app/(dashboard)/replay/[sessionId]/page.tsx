'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react'
import 'rrweb/dist/rrweb.min.css'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Card } from '@/components/ui/Card'

// Bundled (no CDN) + pinned to rrweb 2.0.0-alpha.4 — the exact version the SDK
// records with. We render with the low-level Replayer and build our own controls
// (fit-to-screen, speed, timeline) since rrweb-player has no alpha.4 release.
type Replayer = {
  play: (timeOffset?: number) => void
  pause: () => void
  setConfig: (c: { speed: number }) => void
  getCurrentTime: () => number
  getMetaData: () => { totalTime: number }
  on: (event: string, cb: () => void) => void
}

const SPEEDS = [1, 2, 4, 8]

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ReplayPlayerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const decoded = decodeURIComponent(sessionId)
  const projectId = useProjectStore(s => s.projectId)
  const ref = useRef<HTMLDivElement>(null)
  const replayerRef = useRef<Replayer | null>(null)
  const rafRef = useRef(0)
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(0)

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
    let cancelled = false

    // Scale the recorded viewport so the WHOLE frame fits — width and height — no scroll.
    const fit = () => {
      const wrapper = target.querySelector('.replayer-wrapper') as HTMLElement | null
      if (!wrapper) return
      const recW = parseFloat(wrapper.style.width) || 1280
      const recH = parseFloat(wrapper.style.height) || 800
      const availW = target.clientWidth || recW
      const availH = Math.min(window.innerHeight * 0.66, 760)
      const scale = Math.min(availW / recW, availH / recH, 1)
      wrapper.style.transform = `scale(${scale})`
      wrapper.style.transformOrigin = 'top center'
      target.style.height = `${Math.round(recH * scale)}px`
    }

    const tick = () => {
      const r = replayerRef.current
      if (r) { try { setCur(r.getCurrentTime()) } catch { /* noop */ } }
      rafRef.current = requestAnimationFrame(tick)
    }

    import('rrweb')
      .then((mod) => {
        if (cancelled || !ref.current) return
        target.innerHTML = ''
        const Ctor = (mod as unknown as { Replayer: new (e: unknown[], o: unknown) => Replayer }).Replayer
        const r = new Ctor(events, { root: target, mouseTail: true, skipInactive: false, speed: 1 })
        replayerRef.current = r
        try { setTotal(r.getMetaData().totalTime) } catch { /* noop */ }
        r.on('finish', () => setPlaying(false))
        r.play()
        setPlaying(true); setSpeed(1)
        requestAnimationFrame(() => { fit(); tick() })
        setTimeout(fit, 400)
      })
      .catch(() => setErr('Could not initialise the player for this recording.'))

    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      try { replayerRef.current?.pause() } catch { /* noop */ }
      target.innerHTML = ''
      replayerRef.current = null
    }
  }, [events])

  function toggle() {
    const r = replayerRef.current
    if (!r) return
    if (playing) { r.pause(); setPlaying(false) }
    else { r.play(cur); setPlaying(true) }
  }
  function restart() {
    const r = replayerRef.current
    if (!r) return
    r.play(0); setPlaying(true); setCur(0)
  }
  function changeSpeed(s: number) {
    const r = replayerRef.current
    if (!r) return
    r.setConfig({ speed: s }); setSpeed(s)
  }
  function seek(ms: number) {
    const r = replayerRef.current
    if (!r) return
    r.play(ms); setPlaying(true); setCur(ms)
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
            {/* Player viewport — fits fully, never scrolls */}
            <div ref={ref} className="rr-player-wrap w-full overflow-hidden bg-[#fafafa] rounded-lg border border-[var(--color-border)]" />

            {/* Controls */}
            <div className="mt-3 flex items-center gap-3">
              <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="grid place-items-center h-9 w-9 rounded-full bg-[#0052F2] text-white hover:bg-[#0043c4] transition-colors flex-shrink-0">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={restart} aria-label="Restart" className="grid place-items-center h-9 w-9 rounded-full border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors flex-shrink-0">
                <RotateCcw className="h-4 w-4" />
              </button>

              <span className="type-body-12-400 text-[var(--color-text-subtle)] tabular-nums w-10 text-right">{fmt(cur)}</span>
              <input
                type="range" min={0} max={total || 1} value={Math.min(cur, total)} step={100}
                onChange={(e) => seek(Number(e.currentTarget.value))}
                className="flex-1 accent-[#0052F2] cursor-pointer"
                aria-label="Seek"
              />
              <span className="type-body-12-400 text-[var(--color-text-subtle)] tabular-nums w-10">{fmt(total)}</span>

              <div className="flex items-center gap-1 flex-shrink-0">
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => changeSpeed(s)}
                    className={`px-2 py-1 rounded-md type-body-12-400 transition-colors ${speed === s ? 'bg-[#0052F2] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

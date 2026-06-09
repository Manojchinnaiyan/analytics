'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Card } from '@/components/ui/Card'

const PLAYER_JS = 'https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.11/dist/index.js'
const PLAYER_CSS = 'https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.11/dist/style.css'

let loaderPromise: Promise<void> | null = null
function loadPlayer(): Promise<void> {
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${PLAYER_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = PLAYER_CSS
      document.head.appendChild(link)
    }
    if ((window as unknown as { rrwebPlayer?: unknown }).rrwebPlayer) return resolve()
    const s = document.createElement('script')
    s.src = PLAYER_JS
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('failed'))
    document.body.appendChild(s)
  })
  return loaderPromise
}

export default function ReplayPlayerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const decoded = decodeURIComponent(sessionId)
  const projectId = useProjectStore(s => s.projectId)
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')

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
    loadPlayer().then(() => {
      target.innerHTML = ''
      const w = Math.min(target.clientWidth || 960, 1200)
      const PlayerCtor = (window as unknown as { rrwebPlayer: new (o: unknown) => unknown }).rrwebPlayer
      try {
        new PlayerCtor({ target, props: { events, width: w, height: Math.round(w * 0.6), autoPlay: true } })
      } catch {
        setErr('Could not initialise the player for this recording.')
      }
    }).catch(() => setErr('Failed to load the replay player.'))
    return () => { target.innerHTML = '' }
  }, [events])

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
          <div ref={ref} className="rr-player-wrap min-h-[400px] flex justify-center" />
        )}
      </Card>
    </div>
  )
}

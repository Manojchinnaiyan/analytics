'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Pause, Play, Radio, Globe, Smartphone } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EventSelect } from '@/components/EventSelect'

interface LiveEvent {
  ts_ms: number
  event_type: string
  user_id: string
  device_id: string
  platform: string
  os_name: string
  device_type: string
  country: string
  city: string
  utm_source: string
  properties: string
}

function relTime(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function propsPreview(raw: string): string {
  try {
    const o = JSON.parse(raw)
    const entries = Object.entries(o)
    if (!entries.length) return ''
    return entries.slice(0, 4).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('  ·  ')
  } catch { return '' }
}

export default function LiveEventsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [paused, setPaused] = useState(false)
  const [eventType, setEventType] = useState('')
  const [search, setSearch] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['live-events', projectId, eventType, search],
    queryFn: () => api.liveEvents(projectId, { limit: 80, event_type: eventType || undefined, search: search || undefined }),
    enabled: !!projectId,
    refetchInterval: paused ? false : 3000,
  })

  const events: LiveEvent[] = data?.events ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live Events"
        subtitle="Raw events as they arrive — verify your instrumentation in real time"
        actions={
          <button
            onClick={() => setPaused(p => !p)}
            className="inline-flex items-center gap-1.5 px-3 py-2 type-caption rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}
          </button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Event</span>
            <EventSelect value={eventType} onChange={setEventType} placeholder="All events" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Search user / device</span>
            <div className="relative">
              <Search className="h-4 w-4 text-[var(--color-text-subtle)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="ctrl w-full pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="user_id or device_id…"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <span className={`inline-flex h-2 w-2 rounded-full ${paused ? 'bg-[var(--color-text-subtle)]' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="type-body-13 text-[var(--color-text-subtle)]">
              {paused ? 'Paused' : isFetching ? 'Updating…' : 'Live'}
            </span>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        {isLoading ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><Radio className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No events yet — fire one from your SDK and it’ll show up here within seconds.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {events.map((e, i) => {
              const who = e.user_id || e.device_id || 'anonymous'
              const preview = propsPreview(e.properties)
              return (
                <div key={`${e.ts_ms}-${i}`} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--color-surface-muted)]">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#EEF3FD] text-[#0052F2] type-body-12-400 mt-0.5 whitespace-nowrap">
                    {e.event_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="type-small-body text-[var(--color-text)] truncate max-w-[220px]" title={who}>{who}</span>
                      {(e.platform || e.device_type) && (
                        <span className="inline-flex items-center gap-1 type-body-12-400 text-[var(--color-text-subtle)]">
                          <Smartphone className="h-3 w-3" />{[e.platform, e.os_name].filter(Boolean).join(' ') || e.device_type}
                        </span>
                      )}
                      {(e.country || e.city) && (
                        <span className="inline-flex items-center gap-1 type-body-12-400 text-[var(--color-text-subtle)]">
                          <Globe className="h-3 w-3" />{[e.city, e.country].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {e.utm_source && (
                        <span className="inline-flex items-center px-1.5 rounded bg-[var(--color-surface-muted)] type-body-12-400 text-[var(--color-text-muted)]">{e.utm_source}</span>
                      )}
                    </div>
                    {preview && <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-0.5 truncate">{preview}</p>}
                  </div>
                  <span className="type-body-12-400 text-[var(--color-text-subtle)] whitespace-nowrap mt-0.5">{relTime(e.ts_ms)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

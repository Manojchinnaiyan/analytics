'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PUBLIC_API_BASE } from '@/lib/api'
import { SegmentationChart } from '@/components/charts/SegmentationChart'
import { Logo } from '@/components/Logo'

interface PublicChart {
  id: string
  name: string
  config: { metric?: string; group_by?: string; event_type?: string }
  data: unknown[]
}

export default function PublicDashboardPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [name, setName] = useState('')
  const [charts, setCharts] = useState<PublicChart[]>([])

  useEffect(() => {
    if (!token) return
    fetch(`${PUBLIC_API_BASE}/public/dashboard/${token}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(d => { setName(d.name ?? 'Dashboard'); setCharts(d.charts ?? []); setState('ok') })
      .catch(() => setState('error'))
  }, [token])

  return (
    <div className="min-h-screen bg-[#FAFBFD]">
      <header className="bg-white border-b border-[var(--color-border)] sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="h-8 w-8 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-[var(--color-text)] truncate">{name || 'Dashboard'}</div>
              <div className="text-[12px] text-[var(--color-text-subtle)]">Public dashboard · read-only</div>
            </div>
          </div>
          <a href="https://inspectuser.com" target="_blank" rel="noopener" className="flex items-center gap-1.5 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)] whitespace-nowrap">
            Powered by <span className="font-semibold text-[var(--color-text)]">InspectUser</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {state === 'loading' && (
          <div className="py-24 text-center text-[15px] text-[var(--color-text-subtle)]">Loading dashboard…</div>
        )}
        {state === 'error' && (
          <div className="py-24 text-center">
            <div className="text-[18px] font-semibold text-[var(--color-text)]">Dashboard not available</div>
            <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">This link is invalid or was made private.</p>
            <a href="https://inspectuser.com" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-[var(--color-brand)] text-white text-[14px] font-medium">Go to InspectUser</a>
          </div>
        )}
        {state === 'ok' && charts.length === 0 && (
          <div className="py-24 text-center text-[15px] text-[var(--color-text-subtle)]">This dashboard has no charts yet.</div>
        )}
        {state === 'ok' && charts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {charts.map(c => (
              <div key={c.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5 min-w-0 overflow-hidden">
                <h3 className="text-[16px] font-semibold text-[var(--color-text)] truncate">{c.name}</h3>
                <p className="text-[12px] text-[var(--color-text-subtle)] mt-0.5 truncate">{c.config.event_type} · {c.config.metric ?? 'totals'}{c.config.group_by ? ` by ${c.config.group_by}` : ''}</p>
                <div className="h-72 mt-3 min-w-0">
                  <SegmentationChart data={(c.data as never[]) ?? []} metric={c.config.metric ?? 'Events'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Search, Hash, User, Cpu, Sigma, Plus, X } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Select } from '@/components/ui/Select'

export type PropType = 'event' | 'user' | 'system' | 'derived'
interface Item { key: string; count?: number; type: PropType }

const TRANSFORMS = [
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'email_domain', label: 'Domain from email' },
  { value: 'url_domain', label: 'Domain from URL' },
  { value: 'url_path', label: 'Path from URL' },
  { value: 'before', label: 'Text before separator' },
  { value: 'after', label: 'Text after separator' },
  { value: 'regex', label: 'Regex extract' },
]

export function PropertySelect({ value, onChange, className }: {
  value: string
  onChange: (property: string, type: PropType) => void
  className?: string
}) {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Item | null>(null)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); setCreating(false) } }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const { data } = useQuery({ queryKey: ['properties', projectId], queryFn: () => api.properties(projectId), enabled: !!projectId, staleTime: 60_000 })
  const { data: derivedData } = useQuery({ queryKey: ['derived', projectId], queryFn: () => api.derived(projectId), enabled: !!projectId })

  const groups = useMemo(() => {
    const q = query.toLowerCase()
    const filt = (arr: Item[]) => arr.filter(i => i.key.toLowerCase().includes(q))
    return {
      system: filt((data?.system_properties ?? []).map((p: { key: string }) => ({ key: p.key, type: 'system' as PropType }))),
      event: filt((data?.event_properties ?? []).map((p: { key: string; count: number }) => ({ key: p.key, count: p.count, type: 'event' as PropType }))),
      user: filt((data?.user_properties ?? []).map((p: { key: string; count: number }) => ({ key: p.key, count: p.count, type: 'user' as PropType }))),
      derived: filt((derivedData?.derived ?? []).map((p: { name: string }) => ({ key: p.name, type: 'derived' as PropType }))),
    }
  }, [data, derivedData, query])

  // Detail panel data for the hovered/active property.
  const { data: detail } = useQuery({
    queryKey: ['prop-detail', projectId, active?.key, active?.type],
    queryFn: () => api.propertyDetail(projectId, active!.key, active!.type),
    enabled: !!projectId && !!active && active.type !== 'derived',
  })

  function choose(it: Item) { onChange(it.key, it.type); setOpen(false); setQuery('') }

  const Section = ({ label, icon: Icon, items }: { label: string; icon: typeof Hash; items: Item[] }) => {
    if (!items.length) return null
    return (
      <div className="py-1">
        <div className="px-3 py-1 flex items-center gap-1.5 type-small-10-500 text-[var(--color-text-subtle)] uppercase tracking-wide"><Icon className="h-3 w-3" /> {label}</div>
        {items.map(it => (
          <button key={it.type + it.key} onClick={() => choose(it)} onMouseEnter={() => setActive(it)}
            className={clsx('w-full flex items-center justify-between gap-2 px-3 py-1.5 type-body-13 text-left', value === it.key ? 'bg-[#EEF3FD] text-[#0052F2]' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]')}>
            <span className="truncate">{it.key}</span>
            {it.count !== undefined && <span className="type-body-12-400 text-[var(--color-text-subtle)]">{it.count.toLocaleString()}</span>}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={clsx('relative', className)} ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="ctrl w-full min-w-0 justify-between">
        <span className={clsx('truncate', !value && 'text-[var(--color-text-subtle)]')}>{value || 'property'}</span>
        <ChevronDown className={clsx('h-4 w-4 text-[var(--color-text-subtle)] flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 flex bg-white border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden" style={{ width: 560 }}>
          {/* Left: searchable categorized list */}
          <div className="w-72 border-r border-[var(--color-border)] flex flex-col">
            <div className="p-2 border-b border-[var(--color-border)]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--color-text-subtle)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search properties…" className="w-full bg-[var(--color-surface-muted)] rounded-md pl-8 pr-2 py-1.5 type-body-13 focus:outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && query.trim()) choose({ key: query.trim(), type: 'event' }) }} />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto flex-1">
              <Section label="System" icon={Cpu} items={groups.system} />
              <Section label="Event" icon={Hash} items={groups.event} />
              <Section label="User" icon={User} items={groups.user} />
              <Section label="Derived" icon={Sigma} items={groups.derived} />
            </div>
            <button onClick={() => setCreating(v => !v)} className="flex items-center gap-1.5 px-3 py-2 type-body-13 text-[#0052F2] border-t border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"><Plus className="h-3.5 w-3.5" /> New derived property</button>
          </div>

          {/* Right: detail panel / create form */}
          <div className="flex-1 p-4 min-w-0">
            {creating ? (
              <DerivedForm projectId={projectId} onDone={(name) => { setCreating(false); qc.invalidateQueries({ queryKey: ['derived', projectId] }); if (name) choose({ key: name, type: 'derived' }) }} onCancel={() => setCreating(false)} />
            ) : active ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1"><span className="type-small-10-500 text-[var(--color-text-subtle)] uppercase">{active.type} property</span></div>
                <p className="type-h3-16 text-[var(--color-text)] mb-3 break-all">{active.key}</p>
                {active.type === 'derived' ? (
                  <p className="type-body-13 text-[var(--color-text-subtle)]">Computed property.</p>
                ) : detail ? (
                  <div className="space-y-1.5 type-body-13 text-[var(--color-text-muted)]">
                    <div className="flex justify-between"><span>Occurrences</span><b className="text-[var(--color-text)]">{(detail.count ?? 0).toLocaleString()}</b></div>
                    <div className="flex justify-between"><span>Distinct values</span><b className="text-[var(--color-text)]">{(detail.distinct ?? 0).toLocaleString()}</b></div>
                    <div className="flex justify-between"><span>First seen</span><span>{detail.first_seen ? new Date(detail.first_seen).toLocaleDateString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Last seen</span><span>{detail.last_seen ? new Date(detail.last_seen).toLocaleDateString() : '—'}</span></div>
                    {detail.samples?.length > 0 && (
                      <div className="pt-2"><span className="type-caption text-[var(--color-text-subtle)]">Sample values</span>
                        <div className="flex flex-wrap gap-1 mt-1">{detail.samples.slice(0, 6).map((s: string, i: number) => <span key={i} className="px-1.5 py-0.5 rounded bg-[var(--color-surface-muted)] type-body-12-400 text-[var(--color-text-muted)] truncate max-w-[150px]">{s}</span>)}</div>
                      </div>
                    )}
                  </div>
                ) : <p className="type-body-13 text-[var(--color-text-subtle)]">Loading…</p>}
              </div>
            ) : (
              <p className="type-body-13 text-[var(--color-text-subtle)]">Hover a property to see its usage, values and when it was first seen.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DerivedForm({ projectId, onDone, onCancel }: { projectId: string; onDone: (name?: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [sourceType, setSourceType] = useState('event')
  const [transform, setTransform] = useState('email_domain')
  const [config, setConfig] = useState('')
  const needsConfig = transform === 'regex' || transform === 'before' || transform === 'after'

  async function save() {
    if (!name.trim() || !source.trim()) return
    await api.createDerived(projectId, { name: name.trim(), source_property: source.trim(), source_type: sourceType, transform, config })
    onDone(name.trim())
  }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between"><span className="type-h3-16 text-[var(--color-text)]">New derived property</span><button onClick={onCancel} className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"><X className="h-4 w-4" /></button></div>
      <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">Name</span><input className="ctrl w-full" value={name} onChange={e => setName(e.target.value)} placeholder="email_domain" /></div>
      <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">Source property</span><input className="ctrl w-full" value={source} onChange={e => setSource(e.target.value)} placeholder="email / url / referrer" /></div>
      <div className="flex gap-2">
        <div className="flex-1"><span className="type-caption text-[var(--color-text-muted)] block mb-1">In</span><Select value={sourceType} onChange={setSourceType} options={[{ value: 'event', label: 'Event' }, { value: 'user', label: 'User' }, { value: 'system', label: 'System' }]} className="w-full" /></div>
        <div className="flex-1"><span className="type-caption text-[var(--color-text-muted)] block mb-1">Transform</span><Select value={transform} onChange={setTransform} options={TRANSFORMS} className="w-full" /></div>
      </div>
      {needsConfig && <div><span className="type-caption text-[var(--color-text-muted)] block mb-1">{transform === 'regex' ? 'Pattern' : 'Separator'}</span><input className="ctrl w-full font-mono" value={config} onChange={e => setConfig(e.target.value)} placeholder={transform === 'regex' ? '([a-z]+)' : '/'} /></div>}
      <button onClick={save} disabled={!name.trim() || !source.trim()} className="btn-brand px-4 py-2 type-caption rounded-md w-full disabled:opacity-50">Create</button>
    </div>
  )
}

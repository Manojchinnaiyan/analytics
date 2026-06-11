'use client'

import { useState, Fragment } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tags, Check, Pencil, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'

interface EventDef {
  name: string
  count: number
  last_seen: string
  description: string
  status: string
  expected_properties: string // JSON array of {name,type,required}
}

interface PropSpec { name: string; type: string; required: boolean }

// Parse the editor textarea ("name:type" or "name:type*" for required) → JSON.
function parseSchema(text: string): string {
  const props: PropSpec[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const required = line.endsWith('*')
    const [name, type] = line.replace(/\*$/, '').split(':').map(s => s.trim())
    if (name) props.push({ name, type: type || 'string', required })
  }
  return props.length ? JSON.stringify(props) : ''
}
function schemaToText(json: string): string {
  try {
    const props = JSON.parse(json || '[]') as PropSpec[]
    return props.map(p => `${p.name}:${p.type}${p.required ? '*' : ''}`).join('\n')
  } catch { return '' }
}
function schemaCount(json: string): number {
  try { return (JSON.parse(json || '[]') as PropSpec[]).length } catch { return 0 }
}

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'blocked',    label: 'Blocked' },
]

const statusBadge: Record<string, string> = {
  active:     'bg-emerald-50 text-emerald-700',
  deprecated: 'bg-amber-50 text-amber-700',
  blocked:    'bg-red-50 text-[#DE0202]',
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t) || t <= 0) return '—'
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function TaxonomyPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [schemaFor, setSchemaFor] = useState<string | null>(null)
  const [schemaDraft, setSchemaDraft] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy', projectId],
    queryFn: () => api.taxonomy(projectId),
    enabled: !!projectId,
  })
  const events: EventDef[] = data?.events ?? []

  async function save(ev: EventDef, patch: Partial<Pick<EventDef, 'description' | 'status' | 'expected_properties'>>) {
    await api.updateTaxonomy(projectId, {
      event: ev.name,
      description: patch.description ?? ev.description,
      status: patch.status ?? ev.status,
      expected_properties: patch.expected_properties ?? ev.expected_properties,
    })
    qc.invalidateQueries({ queryKey: ['taxonomy', projectId] })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Event Taxonomy"
        subtitle="Document your events, deprecate the old ones, and block events you don’t want ingested"
      />

      <Card padding={false}>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><Tags className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No events yet — once your SDK sends events they’ll appear here to manage.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Event</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Description</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Volume</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Last seen</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Schema</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <Fragment key={ev.name}>
                <tr className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                  <td className="px-5 py-3">
                    <span className="type-small-body text-[var(--color-text)]">{ev.name}</span>
                  </td>
                  <td className="px-5 py-3 max-w-[360px]">
                    {editing === ev.name ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          className="ctrl flex-1"
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { save(ev, { description: draft }); setEditing(null) } }}
                          placeholder="What does this event mean?"
                        />
                        <button onClick={() => { save(ev, { description: draft }); setEditing(null) }} className="p-1.5 text-emerald-600 hover:bg-white rounded-md"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditing(null)} className="p-1.5 text-[var(--color-text-subtle)] hover:bg-white rounded-md"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditing(ev.name); setDraft(ev.description) }} className="group flex items-center gap-2 text-left">
                        <span className={`type-body-13 truncate ${ev.description ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-subtle)] italic'}`}>
                          {ev.description || 'Add description'}
                        </span>
                        <Pencil className="h-3 w-3 text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100" />
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text-muted)]">{ev.count.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text-subtle)]">{ev.count > 0 ? timeAgo(ev.last_seen) : '—'}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => { setSchemaFor(schemaFor === ev.name ? null : ev.name); setSchemaDraft(schemaToText(ev.expected_properties)) }}
                      className="type-body-13 text-[#0052F2] hover:underline">
                      {schemaCount(ev.expected_properties) > 0 ? `${schemaCount(ev.expected_properties)} props` : '+ define'}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full type-body-12-400 ${statusBadge[ev.status] || statusBadge.active}`}>{ev.status}</span>
                      <Select value={ev.status} onChange={(s) => save(ev, { status: s })} options={STATUS_OPTIONS} className="w-[130px]" />
                    </div>
                  </td>
                </tr>
                {schemaFor === ev.name && (
                  <tr className="bg-[var(--color-surface-muted)]">
                    <td colSpan={5} className="px-5 py-3">
                      <p className="type-caption text-[var(--color-text-muted)] mb-1.5">Expected properties — one per line as <code>name:type</code> (add <code>*</code> for required). e.g. <code>plan:string*</code></p>
                      <textarea className="ctrl w-full font-mono text-[13px]" rows={4} value={schemaDraft} onChange={e => setSchemaDraft(e.target.value)} placeholder={'amount:number*\ncurrency:string\nplan:string'} />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { save(ev, { expected_properties: parseSchema(schemaDraft) }); setSchemaFor(null) }} className="btn-brand px-3 py-1.5 type-caption rounded-md">Save schema</button>
                        <button onClick={() => setSchemaFor(null)} className="px-3 py-1.5 type-caption rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]">Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="type-body-13 text-[var(--color-text-subtle)]">
        <b className="text-[#DE0202]">Blocked</b> events are dropped at ingestion and won’t be stored. Existing data for them is kept.
      </p>
    </div>
  )
}

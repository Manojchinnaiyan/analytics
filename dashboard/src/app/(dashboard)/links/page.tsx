'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Link2, Copy, Check, MousePointerClick } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SocialIcon } from '@/components/SocialIcon'

// Smart links live on the CUSTOMER's own domain: <destination>/?il=<code>. The
// destination page's SDK reads the code and the backend resolves it to utm_*, so
// the shareable link is the user's domain (not inspectuser.com). INGEST_BASE is
// where the SDK posts events.
const INGEST_BASE = process.env.NEXT_PUBLIC_INGEST_PUBLIC_URL || 'https://ingest.inspectuser.com'
const DEMO_BASE = process.env.NEXT_PUBLIC_DEMO_PUBLIC_URL || 'https://demo.inspectuser.com'

interface SmartLink {
  id: string
  name: string
  slug: string
  destination: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  clicks: number
}

const SOURCES = [
  { value: 'whatsapp',  label: 'WhatsApp',  medium: 'social' },
  { value: 'instagram', label: 'Instagram', medium: 'social' },
  { value: 'facebook',  label: 'Facebook',  medium: 'social' },
  { value: 'linkedin',  label: 'LinkedIn',  medium: 'social' },
  { value: 'twitter',   label: 'X / Twitter', medium: 'social' },
  { value: 'telegram',  label: 'Telegram',  medium: 'social' },
  { value: 'email',     label: 'Email',     medium: 'email' },
  { value: 'sms',       label: 'SMS',       medium: 'sms' },
  { value: 'google',    label: 'Google Ads', medium: 'cpc' },
]

function RowCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex items-center gap-1 type-link text-[#0052F2] hover:text-[#0C3FA7]"
    >
      {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
    </button>
  )
}

export default function LinksPage() {
  const projectId = useProjectStore(s => s.projectId)
  const apiKey = useProjectStore(s => s.apiKey)
  const qc = useQueryClient()

  const [creating, setCreating] = useState(false)
  const [source, setSource] = useState('whatsapp')
  const [campaign, setCampaign] = useState('launch')
  const [destination, setDestination] = useState(DEMO_BASE)
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['links', projectId],
    queryFn: () => api.links(projectId),
    enabled: !!projectId,
  })
  const links: SmartLink[] = data?.links ?? []

  async function save() {
    setSaving(true)
    try {
      const medium = SOURCES.find(s => s.value === source)?.medium ?? 'social'
      // Pre-bake the demo's API key + ingest URL so the link works with zero setup.
      const extra = `key=${apiKey}&api=${INGEST_BASE}`
      await api.createLink(projectId, {
        name: SOURCES.find(s => s.value === source)?.label ?? source,
        destination, utm_source: source, utm_medium: medium, utm_campaign: campaign, extra,
      })
      setCreating(false)
      qc.invalidateQueries({ queryKey: ['links', projectId] })
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    await api.deleteLink(projectId, id)
    qc.invalidateQueries({ queryKey: ['links', projectId] })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Smart Links"
        subtitle="Clean branded links that record the source on click — share these instead of long UTM URLs"
        actions={<button onClick={() => setCreating(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5"><Plus className="h-4 w-4" /> New link</button>}
      />

      {creating && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Create a smart link</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Source</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md border border-[var(--color-border)] bg-white flex-shrink-0">
                  <SocialIcon source={source} className="h-4 w-4" />
                </span>
                <Select value={source} onChange={setSource} options={SOURCES.map(s => ({ value: s.value, label: s.label }))} />
              </div>
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Campaign</span>
              <input className="ctrl w-40" value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="launch" />
            </div>
            <div className="flex-1 min-w-[260px]">
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Destination</span>
              <input className="ctrl w-full" value={destination} onChange={e => setDestination(e.target.value)} placeholder="https://your-site.com" />
            </div>
            <button onClick={save} disabled={saving} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">{saving ? 'Creating…' : 'Create link'}</button>
          </div>
          <p className="type-body-13 text-[var(--color-text-subtle)] mt-3">
            The link records <span className="type-caption text-[var(--color-text)]">utm_source={source}</span> on every click and redirects to your destination.
          </p>
        </Card>
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : links.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><Link2 className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No smart links yet — create one to track where your traffic comes from.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Source</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Short link</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Clicks</th>
                <th className="w-24"></th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => {
                const shortUrl = `${l.destination}${l.destination.includes('?') ? '&' : '?'}il=${l.slug}`
                return (
                  <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface-muted)] flex-shrink-0">
                          <SocialIcon source={l.utm_source} className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="type-small-body text-[var(--color-text)]">{l.name}</div>
                          <div className="type-body-12-400 text-[var(--color-text-subtle)]">{l.utm_source} · {l.utm_medium} · {l.utm_campaign}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><code className="type-caption-12-400 text-[#0052F2]">{shortUrl}</code></td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 type-small-body text-[var(--color-text)]"><MousePointerClick className="h-3.5 w-3.5 text-[var(--color-text-subtle)]" />{l.clicks.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-3"><RowCopy text={shortUrl} /></td>
                    <td className="px-2"><button onClick={() => remove(l.id)} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

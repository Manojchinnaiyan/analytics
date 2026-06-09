'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Play, DatabaseZap } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'

interface ExportDest {
  id: string
  endpoint: string
  bucket: string
  prefix: string
  interval_minutes: number
  enabled: boolean
  last_status: string
  last_run: string | null
  rows_exported: number
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ExportPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [endpoint, setEndpoint] = useState('')
  const [bucket, setBucket] = useState('')
  const [prefix, setPrefix] = useState('events')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [interval, setInterval] = useState('60')
  const [busy, setBusy] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['exports', projectId],
    queryFn: () => api.exports(projectId),
    enabled: !!projectId,
    refetchInterval: 15_000,
  })
  const exports: ExportDest[] = data?.exports ?? []

  async function create() {
    if (!endpoint || !bucket) return
    setBusy('create')
    try {
      await api.createExport(projectId, {
        endpoint, bucket, prefix, access_key: accessKey, secret_key: secretKey, interval_minutes: Number(interval),
      })
      setCreating(false); setBucket(''); setAccessKey(''); setSecretKey('')
      qc.invalidateQueries({ queryKey: ['exports', projectId] })
    } finally { setBusy('') }
  }

  async function run(id: string) {
    setBusy(id)
    try { await api.runExport(projectId, id) } finally {
      setBusy(''); qc.invalidateQueries({ queryKey: ['exports', projectId] })
    }
  }

  async function remove(id: string) {
    await api.deleteExport(projectId, id)
    qc.invalidateQueries({ queryKey: ['exports', projectId] })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Export"
        subtitle="Stream raw events to your own S3 / R2 / GCS bucket as NDJSON — load into Snowflake, BigQuery, Redshift or Databricks."
        actions={<button onClick={() => setCreating(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5"><Plus className="h-4 w-4" /> New destination</button>}
      />

      {creating && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">New export destination</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">S3 endpoint</span>
              <input className="ctrl w-full" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://<acct>.r2.cloudflarestorage.com" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Bucket</span>
              <input className="ctrl w-full" value={bucket} onChange={e => setBucket(e.target.value)} placeholder="my-warehouse-bucket" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Path prefix</span>
              <input className="ctrl w-full" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="events" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Export every</span>
              <Select value={interval} onChange={setInterval} options={[{ value: '15', label: '15 minutes' }, { value: '60', label: 'Hourly' }, { value: '360', label: '6 hours' }, { value: '1440', label: 'Daily' }]} className="w-full" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Access key ID</span>
              <input className="ctrl w-full" value={accessKey} onChange={e => setAccessKey(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Secret access key</span>
              <input className="ctrl w-full" type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <button onClick={create} disabled={busy === 'create' || !endpoint || !bucket} className="btn-brand px-4 py-2 type-caption rounded-md mt-4 disabled:opacity-50">{busy === 'create' ? 'Saving…' : 'Create destination'}</button>
        </Card>
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : exports.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><DatabaseZap className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No export destinations yet — add a bucket to stream events to your warehouse.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Destination</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Schedule</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Rows exported</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Last run</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {exports.map(e => (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                  <td className="px-5 py-3 type-small-body text-[var(--color-text)]">{e.bucket}<span className="text-[var(--color-text-subtle)]">/{e.prefix}</span></td>
                  <td className="px-5 py-3 type-body-13 text-[var(--color-text-muted)]">every {e.interval_minutes >= 1440 ? `${e.interval_minutes / 1440}d` : e.interval_minutes >= 60 ? `${e.interval_minutes / 60}h` : `${e.interval_minutes}m`}</td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text)]">{e.rows_exported.toLocaleString()}</td>
                  <td className="px-5 py-3 type-body-13">
                    <span className="text-[var(--color-text-muted)]">{ago(e.last_run)}</span>
                    {e.last_status && <span className={`block type-body-12-400 ${e.last_status.startsWith('error') ? 'text-[#DE0202]' : 'text-[var(--color-text-subtle)]'}`}>{e.last_status}</span>}
                  </td>
                  <td className="px-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => run(e.id)} disabled={busy === e.id} title="Run now" className="p-2 text-[var(--color-text-subtle)] hover:text-[#0052F2] disabled:opacity-40"><Play className="h-4 w-4" /></button>
                      <button onClick={() => remove(e.id)} title="Delete" className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="type-body-13 text-[var(--color-text-subtle)]">
        Each run writes a timestamped <code>.jsonl</code> file under <code>{'<prefix>/<project>/'}</code> containing events since the last export. Point your warehouse&apos;s external stage / load job at the bucket.
      </p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Save, Trash2, Database, Loader2, BookMarked } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

interface SavedQuery { id: string; name: string; query: string }

const DEFAULT_QUERY = `SELECT event_type, count() AS events, uniq(if(user_id != '', user_id, device_id)) AS users
FROM inspectuser.events
WHERE project_id = '{{project_id}}'
GROUP BY event_type
ORDER BY events DESC
LIMIT 20`

const SCHEMA = [
  'inspectuser.events — project_id, user_id, device_id, session_id, event_type, event_time,',
  '   properties, user_properties, platform, os_name, device_type, browser, country, region, city,',
  '   utm_source, utm_medium, utm_campaign, referrer',
]

export default function SqlPage() {
  const projectId = useProjectStore(s => s.projectId)
  const qc = useQueryClient()
  const [sql, setSql] = useState(DEFAULT_QUERY.replace('{{project_id}}', projectId))
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[]; row_count: number; elapsed_ms: number } | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const { data: savedData } = useQuery({
    queryKey: ['saved-queries', projectId],
    queryFn: () => api.savedQueries(projectId),
    enabled: !!projectId,
  })
  const saved: SavedQuery[] = savedData?.queries ?? []

  async function run() {
    setRunning(true); setError(''); setResult(null)
    try {
      const r = await api.runSql(projectId, sql)
      setResult(r)
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Query failed')
    } finally { setRunning(false) }
  }

  async function save() {
    const name = window.prompt('Name this query:')
    if (!name) return
    await api.saveQuery(projectId, name, sql)
    qc.invalidateQueries({ queryKey: ['saved-queries', projectId] })
  }
  async function remove(id: string) {
    await api.deleteQuery(projectId, id)
    qc.invalidateQueries({ queryKey: ['saved-queries', projectId] })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="SQL / Notebooks" subtitle="Run read-only SQL directly against your event data" />

      <div className="grid lg:grid-cols-[1fr_240px] gap-4">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 type-caption text-[var(--color-text-muted)]"><Database className="h-3.5 w-3.5" /> Query editor</span>
              <div className="flex items-center gap-2">
                <button onClick={save} className="inline-flex items-center gap-1.5 px-3 py-1.5 type-body-13 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"><Save className="h-3.5 w-3.5" /> Save</button>
                <button onClick={run} disabled={running} className="btn-brand inline-flex items-center gap-1.5 px-4 py-1.5 type-caption rounded-md disabled:opacity-50">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
                </button>
              </div>
            </div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run() }}
              spellCheck={false}
              className="w-full h-48 bg-[#1e1e2e] text-[#e2e8f0] rounded-lg p-4 type-caption-12-400 leading-relaxed font-mono resize-y focus:outline-none"
            />
            <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">Read-only · ⌘/Ctrl+Enter to run · auto-LIMIT 1000</p>
            <details className="mt-2">
              <summary className="type-body-12-400 text-[var(--color-text-muted)] cursor-pointer">Schema</summary>
              <pre className="type-caption-12-400 text-[var(--color-text-subtle)] mt-1 whitespace-pre-wrap">{SCHEMA.join('\n')}</pre>
            </details>
          </Card>

          {error && <Card><p className="type-body-13 text-[#DE0202]">{error}</p></Card>}

          {result && (
            <Card padding={false}>
              <div className="px-5 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
                <span className="type-body-13 text-[var(--color-text-muted)]">{result.row_count} rows</span>
                <span className="type-body-12-400 text-[var(--color-text-subtle)]">{result.elapsed_ms} ms</span>
              </div>
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-[var(--color-border)]">
                      {result.columns.map(c => <th key={c} className="text-left px-4 py-2 type-caption text-[var(--color-text-muted)] whitespace-nowrap">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                        {result.columns.map(c => <td key={c} className="px-4 py-2 type-body-13 text-[var(--color-text)] whitespace-nowrap">{String(row[c] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Saved queries */}
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2"><BookMarked className="h-4 w-4 text-[#0052F2]" /><span className="type-caption text-[var(--color-text-muted)]">Saved</span></div>
          {saved.length === 0 ? (
            <p className="type-body-13 text-[var(--color-text-subtle)] p-4">No saved queries yet.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {saved.map(q => (
                <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-muted)] group">
                  <button onClick={() => setSql(q.query)} className="flex-1 text-left type-body-13 text-[var(--color-text)] truncate">{q.name}</button>
                  <button onClick={() => remove(q.id)} className="p-1 text-[var(--color-text-subtle)] hover:text-[#DE0202] opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

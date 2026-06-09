'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

interface Entry {
  time: string
  method: string
  path: string
  status: number
  ip: string
  actor_email: string
  actor_name: string
}

// Turn a method + path into a human action label.
function describe(method: string, path: string): string {
  const p = path.replace(/^\/v1\//, '')
  const seg = p.split('/')
  const rules: [RegExp, string][] = [
    [/^team\/invite$/, 'Invited a member'],
    [/^team\/invites\/.+$/, 'Revoked an invite'],
    [/^team\/.+\/permissions$/, 'Changed member permissions'],
    [/^team\/.+$/, method === 'PUT' ? 'Changed member role' : 'Removed a member'],
    [/^team$/, 'Added a member'],
    [/^projects$/, 'Created a project'],
    [/^projects\/.+\/timezone$/, 'Changed reporting timezone'],
    [/^projects\/.+\/usage\/limit$/, 'Changed event quota'],
    [/^projects\/.+\/gdpr\/delete$/, 'Deleted user data (GDPR)'],
    [/^projects\/.+\/gdpr\/export$/, 'Exported user data (GDPR)'],
    [/^projects\/.+\/flags(\/.+)?$/, method === 'DELETE' ? 'Deleted a feature flag' : method === 'PUT' ? 'Updated a feature flag' : 'Created a feature flag'],
    [/^projects\/.+\/features(\/.+)?$/, method === 'DELETE' ? 'Deleted a feature definition' : 'Created a feature definition'],
    [/^projects\/.+\/cohorts(\/.+)?$/, method === 'DELETE' ? 'Deleted a cohort' : 'Created a cohort'],
    [/^projects\/.+\/alerts(\/.+)?$/, method === 'DELETE' ? 'Deleted an alert' : method === 'PUT' ? 'Updated an alert' : 'Created an alert'],
    [/^projects\/.+\/links(\/.+)?$/, method === 'DELETE' ? 'Deleted a smart link' : 'Created a smart link'],
    [/^projects\/.+\/taxonomy$/, 'Updated event taxonomy'],
    [/^projects\/.+\/sql(\/.+)?$/, 'Ran / saved a SQL query'],
    [/^projects\/.+\/replays\/.+$/, 'Deleted a session replay'],
    [/^projects\/.+\/dashboard/, 'Edited a dashboard'],
    [/^orgs$/, 'Created an org'],
  ]
  for (const [re, label] of rules) if (re.test(p)) return label
  return `${method} /${seg.slice(2).join('/') || p}`
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export default function AuditPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { data, isLoading } = useQuery({
    queryKey: ['audit', projectId],
    queryFn: () => api.audit(),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })
  const entries: Entry[] = data?.entries ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" subtitle="Every admin & configuration change in your workspace — who, what, when." />

      <Card padding={false} className="min-w-0 overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center type-body-15 text-[var(--color-text-subtle)]">No admin actions recorded yet.</div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">When</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Who</th>
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">Action</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Result</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const ok = e.status < 400
                return (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)] transition-colors">
                    <td className="px-5 py-3 type-body-13 text-[var(--color-text-muted)] whitespace-nowrap">{fmt(e.time)}</td>
                    <td className="px-5 py-3 type-body-13 text-[var(--color-text)] truncate max-w-[200px]" title={e.actor_email}>{e.actor_name || e.actor_email}</td>
                    <td className="px-5 py-3 type-small-body text-[var(--color-text)]">{describe(e.method, e.path)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full type-body-12-400 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#DE0202]'}`}>{e.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right type-body-12-400 text-[var(--color-text-subtle)]">{e.ip}</td>
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

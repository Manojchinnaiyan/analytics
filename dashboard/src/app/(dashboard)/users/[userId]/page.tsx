'use client'

import { use, useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Zap, Activity, Layers, Calendar, Globe, Monitor, Download, Trash2, ShieldAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore, usePermission } from '@/stores/project'

// GDPR data-subject controls — export (Art. 15) and erasure (Art. 17).
function PrivacyCard({ projectId, userId }: { projectId: string; userId: string }) {
  const can = usePermission()
  const canExport = can('data.export')
  const canDelete = can('data.delete')
  const [deleted, setDeleted] = useState(false)
  if (!canExport && !canDelete) return null

  const exportData = useMutation({
    mutationFn: () => api.gdprExport(projectId, { user_id: userId }),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gdpr-export-${userId}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
  })
  const del = useMutation({
    mutationFn: () => api.gdprDelete(projectId, { user_id: userId }),
    onSuccess: () => setDeleted(true),
  })

  return (
    <div className="glass rounded-lg p-5 border border-[#FCE2E2]">
      <h2 className="type-h3-16 text-[#0f172a] mb-1 flex items-center gap-1.5">
        <ShieldAlert className="h-4 w-4 text-[#DE0202]" /> Privacy & GDPR
      </h2>
      <p className="type-body-13 text-[#64748b] mb-3">
        Export everything this user&apos;s data, or permanently erase it (events, profile, sessions, replays).
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {canExport && (
          <button
            onClick={() => exportData.mutate()}
            disabled={exportData.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] type-body-13 text-[#0f172a] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {exportData.isPending ? 'Exporting…' : 'Export data'}
          </button>
        )}
        {canDelete && (deleted ? (
          <span className="type-body-13 text-[#DE0202]">Erasure scheduled — data is being removed.</span>
        ) : (
          <button
            onClick={() => { if (confirm(`Permanently delete all data for "${userId}"? This cannot be undone.`)) del.mutate() }}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#DE0202] text-white type-body-13 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {del.isPending ? 'Deleting…' : 'Delete user data'}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TimelineEvent {
  event_type: string
  event_time: string
  properties: string
  platform: string
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function safeProps(json: string): Record<string, unknown> {
  try {
    const o = JSON.parse(json || '{}')
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export default function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const decodedId = decodeURIComponent(userId)
  const projectId = useProjectStore(s => s.projectId)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['user-profile', projectId, decodedId],
    queryFn: () => api.userProfile(projectId, decodedId),
    enabled: !!projectId,
  })

  const userProps = data ? safeProps(data.user_properties) : {}
  const timeline: TimelineEvent[] = data?.timeline ?? []

  return (
    <div className="space-y-6">
      <Link href="/users" className="inline-flex items-center gap-1.5 type-link text-[#64748b] hover:text-[#0f172a]">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      {isLoading ? (
        <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
      ) : isError || !data ? (
        <div className="glass rounded-lg py-16 text-center">
          <p className="type-body-15 text-[#94a3b8]">User not found or has no events.</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="glass rounded-lg p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#0052F2] text-white flex items-center justify-center type-h3">
                {decodedId.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="type-h3 text-[#0f172a]">{decodedId}</h1>
                <p className="type-body-13 text-[#64748b] mt-0.5">
                  First seen {fmt(data.first_seen)} · Last seen {fmt(data.last_seen)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {[
                { icon: Activity, label: 'Events', value: data.events },
                { icon: Layers,   label: 'Event types', value: data.event_types },
                { icon: Monitor,  label: 'Platform', value: data.platform || '—' },
                { icon: Globe,    label: 'Country', value: data.country || '—' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="glass-soft rounded-lg p-3">
                  <div className="flex items-center gap-1.5 type-body-12-400 text-[#94a3b8] mb-1">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </div>
                  <p className="type-h3-16 text-[#0f172a]">{typeof value === 'number' ? value.toLocaleString() : value}</p>
                </div>
              ))}
            </div>
          </div>

          <PrivacyCard projectId={projectId} userId={decodedId} />

          <div className="grid lg:grid-cols-3 gap-4">
            {/* User properties */}
            <div className="glass rounded-lg p-5 lg:col-span-1 h-fit">
              <h2 className="type-h3-16 text-[#0f172a] mb-3">User properties</h2>
              {Object.keys(userProps).length === 0 ? (
                <p className="type-body-13 text-[#94a3b8]">No properties set. Call <code>identify()</code> to add some.</p>
              ) : (
                <dl className="space-y-2">
                  {Object.entries(userProps).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-[#f1f5f9] last:border-0">
                      <dt className="type-body-13 text-[#64748b]">{k}</dt>
                      <dd className="type-caption-12-400 text-[#0f172a] text-right break-all">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {/* Event timeline */}
            <div className="glass rounded-lg p-5 lg:col-span-2">
              <h2 className="type-h3-16 text-[#0f172a] mb-4">Event timeline</h2>
              <div className="relative pl-5">
                {/* vertical line */}
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[#e2e8f0]" />
                <div className="space-y-4">
                  {timeline.map((e, i) => {
                    const props = safeProps(e.properties)
                    return (
                      <div key={i} className="relative">
                        <div className="absolute -left-5 top-1 w-3.5 h-3.5 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
                          <Zap className="h-1.5 w-1.5 text-[#0052F2]" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="type-small-body text-[#0f172a]">{e.event_type}</span>
                          <span className="type-body-12-400 text-[#94a3b8] flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {fmt(e.event_time)}
                          </span>
                        </div>
                        {Object.keys(props).length > 0 && (
                          <div className="mt-1 type-caption-12-400 text-[#64748b] bg-[#f8fafc] rounded-lg px-2.5 py-1.5 break-all">
                            {JSON.stringify(props)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

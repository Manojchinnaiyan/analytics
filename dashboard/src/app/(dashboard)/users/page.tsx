'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, User, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'

interface UserRow {
  user_id: string
  is_anonymous: boolean
  events: number
  event_types: number
  first_seen: string
  last_seen: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function UsersPage() {
  const router = useRouter()
  const projectId = useProjectStore(s => s.projectId)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users', projectId, search],
    queryFn: () => api.users(projectId, search),
    enabled: !!projectId,
  })

  const users: UserRow[] = data?.users ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Users" subtitle="Browse every visitor — logged-in or anonymous — and their full activity" />

      <Card padding={false}>
        <div className="p-4 border-b border-white/50">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 text-[var(--color-text-subtle)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              className="ctrl w-full pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by user or device ID…"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><User className="h-6 w-6 text-[#4C85F5]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">{search ? 'No users match your search.' : 'No visitors yet — send some events to see them here.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/50">
                <th className="text-left px-5 py-3 type-caption text-[var(--color-text-muted)]">User</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Events</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Event types</th>
                <th className="text-right px-5 py-3 type-caption text-[var(--color-text-muted)]">Last seen</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr
                  key={u.user_id}
                  onClick={() => router.push(`/users/${encodeURIComponent(u.user_id)}`)}
                  className="border-b border-white/40 last:border-0 hover:bg-white/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar seed={u.user_id} size={34} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="type-small-body text-[var(--color-text)] truncate max-w-[280px]" title={u.user_id}>{u.user_id}</span>
                          {u.is_anonymous && (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)] type-body-12-400 flex-shrink-0">anonymous</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right type-body-13 text-[var(--color-text)]">{u.events.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right type-body-13 text-[var(--color-text-muted)]">{u.event_types}</td>
                  <td className="px-5 py-3.5 text-right type-body-13 text-[var(--color-text-muted)]">{timeAgo(u.last_seen)}</td>
                  <td className="px-2"><ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  )
}

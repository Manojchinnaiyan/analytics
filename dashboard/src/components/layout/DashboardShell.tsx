'use client'

import { useEffect, useRef } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useRequireAuth } from '@/hooks/useAuth'
import { useProjectStore } from '@/stores/project'
import { api } from '@/lib/api'
import { saveToken } from '@/lib/auth'
import { Loader2 } from 'lucide-react'

export function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const ready = useRequireAuth()
  const hydrated = useRef(false)

  // Hydrate the current user's project + API key from the server ONCE per load.
  // Only writes to the store when a value actually changed, to avoid re-render churn.
  useEffect(() => {
    if (!ready || hydrated.current) return
    hydrated.current = true
    // Roll the session forward so an active user doesn't get logged out at 24h.
    api.refreshToken().then(r => r.token && saveToken(r.token)).catch(() => { /* keep existing token */ })
    api.me()
      .then(me => {
        const s = useProjectStore.getState()
        const next = {
          projectId: me.project_id ?? '',
          apiKey: me.api_key ?? '',
          orgId: me.org_id ?? '',
          userName: me.name ?? '',
          email: me.email ?? '',
          projectName: me.project_name ?? '',
          role: me.role ?? '',
          permissions: (me.permissions ?? []) as string[],
        }
        const changed = (Object.keys(next) as (keyof typeof next)[]).some(k =>
          k === 'permissions'
            ? (s.permissions ?? []).join(',') !== (next.permissions as string[]).join(',')
            : s[k] !== next[k]
        )
        if (changed) s.setProject(next)
      })
      .catch(() => { /* interceptor handles 401 */ })
  }, [ready])

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-surface-muted)]">
        <Loader2 className="h-6 w-6 text-[#0052F2] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface-muted)]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto px-6 py-6">{children}</main>
      </div>
    </div>
  )
}

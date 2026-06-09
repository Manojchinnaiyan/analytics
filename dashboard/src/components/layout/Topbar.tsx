'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LogOut, Settings, FolderKanban, User, Plus, Check } from 'lucide-react'
import { useProjectStore } from '@/stores/project'
import { useLogout } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import Link from 'next/link'

interface Project { project_id: string; name: string; api_key: string }

function ProjectSwitcher() {
  const { projectId, projectName, setProject } = useProjectStore()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const { data } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects() })
  const projects: Project[] = data?.projects ?? []

  function pick(p: Project) {
    setProject({ projectId: p.project_id, apiKey: p.api_key, projectName: p.name })
    setOpen(false)
    qc.invalidateQueries() // refetch all analytics for the new project
  }

  async function create() {
    const name = window.prompt('New project name:')
    if (!name) return
    const res = await api.createProject(name)
    await qc.invalidateQueries({ queryKey: ['projects'] })
    setProject({ projectId: res.project_id, apiKey: res.api_key, projectName: res.name })
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-muted)] transition-colors">
        <FolderKanban className="h-4 w-4 text-[#0052F2]" />
        <span className="type-caption text-[var(--color-text)] max-w-[180px] truncate">{projectName || 'My Project'}</span>
        <ChevronDown className={`h-4 w-4 text-[var(--color-text-subtle)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-white border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50">
          <div className="py-1.5 max-h-72 overflow-y-auto">
            {projects.map(p => (
              <button key={p.project_id} onClick={() => pick(p)} className="w-full flex items-center justify-between gap-2 px-4 py-2 type-small-body text-left hover:bg-[var(--color-surface-muted)] transition-colors">
                <span className="truncate text-[var(--color-text)]">{p.name}</span>
                {p.project_id === projectId && <Check className="h-4 w-4 text-[#0052F2] flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="py-1.5 border-t border-[var(--color-border)]">
            <button onClick={create} className="w-full flex items-center gap-2 px-4 py-2 type-small-body text-[#0052F2] hover:bg-[var(--color-surface-muted)] transition-colors">
              <Plus className="h-4 w-4" /> New project
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const userName = useProjectStore(s => s.userName)
  const email = useProjectStore(s => s.email)
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const initials = (userName || email || 'U')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header className="h-14 bg-white border-b border-[var(--color-border)] flex items-center justify-between px-6 flex-shrink-0">
      <ProjectSwitcher />

      {/* Account */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md hover:bg-[var(--color-surface-muted)] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[#0052F2] text-white flex items-center justify-center type-small-10">
            {initials}
          </div>
          <span className="type-caption text-[var(--color-text)] max-w-[140px] truncate">{userName || email || 'Account'}</span>
          <ChevronDown className={`h-4 w-4 text-[var(--color-text-subtle)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-64 bg-white border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3.5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0052F2] text-white flex items-center justify-center type-caption">{initials}</div>
                <div className="min-w-0">
                  <p className="type-small-body text-[var(--color-text)] truncate">{userName || 'User'}</p>
                  <p className="type-body-13 text-[var(--color-text-subtle)] truncate">{email}</p>
                </div>
              </div>
            </div>
            <div className="py-1.5">
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 type-small-body text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors">
                <Settings className="h-4 w-4" /> Project settings
              </Link>
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 type-small-body text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors">
                <User className="h-4 w-4" /> API keys & SDK
              </Link>
            </div>
            <div className="py-1.5 border-t border-[var(--color-border)]">
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 type-small-body text-[#DE0202] hover:bg-red-50 transition-colors">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

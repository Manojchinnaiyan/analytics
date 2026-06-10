import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ssrStorage } from '@/lib/ssrStorage'

interface ProjectState {
  projectId: string
  apiKey: string
  orgId: string
  userName: string
  email: string
  projectName: string
  role: string
  permissions: string[]
  setProject: (data: Partial<Omit<ProjectState, 'setProject' | 'clear'>>) => void
  clear: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projectId: '',
      apiKey: '',
      orgId: '',
      userName: '',
      email: '',
      projectName: '',
      role: '',
      permissions: [],
      setProject: (data) => set((s) => ({ ...s, ...data })),
      clear: () => set({ projectId: '', apiKey: '', orgId: '', userName: '', email: '', projectName: '', role: '', permissions: [] }),
    }),
    {
      name: 'amp-project',
      storage: ssrStorage,
      partialize: (s) => ({
        projectId: s.projectId,
        apiKey: s.apiKey,
        orgId: s.orgId,
        userName: s.userName,
        email: s.email,
        projectName: s.projectName,
        role: s.role,
        permissions: s.permissions,
      }),
    }
  )
)

/**
 * usePermission returns a `can(key)` predicate for gating UI on the current
 * user's effective permissions. Owners always pass. Server-side checks are the
 * real enforcement; this just hides/disables controls the user can't use.
 */
export function usePermission() {
  const role = useProjectStore(s => s.role)
  const permissions = useProjectStore(s => s.permissions)
  return (key: string) => role === 'owner' || permissions.includes(key)
}

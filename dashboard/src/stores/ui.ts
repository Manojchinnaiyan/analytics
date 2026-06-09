import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  /** User's manual preference: keep the sidebar expanded (pinned). */
  pinned: boolean
  /** Collapsed nav groups (by heading). */
  collapsedGroups: Record<string, boolean>
  togglePinned: () => void
  toggleGroup: (heading: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      pinned: true,
      collapsedGroups: {},
      togglePinned: () => set(s => ({ pinned: !s.pinned })),
      toggleGroup: (heading) =>
        set(s => ({ collapsedGroups: { ...s.collapsedGroups, [heading]: !s.collapsedGroups[heading] } })),
    }),
    { name: 'amp-ui' }
  )
)

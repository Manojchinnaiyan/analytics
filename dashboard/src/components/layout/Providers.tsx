'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Keep results in memory 5 min so navigating between pages and back is
        // instant (served from cache, no refetch).
        gcTime: 5 * 60_000,
        retry: 1,
        // Don't refire every query when the user just switches back to the tab —
        // analytics doesn't need it, and it caused a refetch storm + jank.
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

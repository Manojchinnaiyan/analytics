'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'

/**
 * The project's real event types, most-frequent first. Used to seed page
 * defaults from actual data instead of hardcoded placeholder names.
 */
export function useTopEvents() {
  const projectId = useProjectStore(s => s.projectId)
  const { data, isLoading } = useQuery({
    queryKey: ['event-types', projectId],
    queryFn: () => api.eventTypes(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })
  return {
    events: (data?.event_types ?? []).map(t => t.event_type),
    isLoading: isLoading || !projectId,
  }
}

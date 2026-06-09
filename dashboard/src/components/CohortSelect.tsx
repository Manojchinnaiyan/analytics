'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Select } from '@/components/ui/Select'

interface Cohort { id: string; name: string; user_count: number }

/** Picks a saved cohort to scope an analysis to. "All users" = no cohort. */
export function CohortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const projectId = useProjectStore(s => s.projectId)
  const { data } = useQuery({
    queryKey: ['cohorts', projectId],
    queryFn: () => api.cohorts(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })
  const cohorts: Cohort[] = data?.cohorts ?? []

  return (
    <Select
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: 'All users' },
        ...cohorts.map(c => ({ value: c.id, label: c.name, hint: c.user_count.toLocaleString() })),
      ]}
      className="min-w-[160px]"
    />
  )
}

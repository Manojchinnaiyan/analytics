'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { Select, type SelectOption } from '@/components/ui/Select'

/**
 * Searchable event picker built on the custom Select.
 * Lists the project's real events with their counts; allows typing a custom
 * name when the project has no events yet.
 */
export function EventSelect({
  value,
  onChange,
  placeholder = 'Select an event',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const projectId = useProjectStore(s => s.projectId)

  const { data } = useQuery({
    queryKey: ['event-types', projectId],
    queryFn: () => api.eventTypes(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })

  const options: SelectOption[] = (data?.event_types ?? []).map(t => ({
    value: t.event_type,
    label: t.event_type,
    hint: t.count.toLocaleString(),
  }))

  // Keep the current value selectable even if it isn't in the list yet.
  if (value && !options.some(o => o.value === value)) {
    options.unshift({ value, label: value })
  }

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchable
      searchPlaceholder="Search events…"
      allowCustom
    />
  )
}

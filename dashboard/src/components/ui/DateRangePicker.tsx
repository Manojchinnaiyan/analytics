'use client'

import { Select } from '@/components/ui/Select'

export const RANGE_PRESETS = [
  { value: '7',  label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const

/** Returns ISO yyyy-mm-dd start/end for a "last N days" window. */
export function rangeFromDays(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export function DateRangePicker({
  days,
  onChange,
}: {
  days: number
  onChange: (days: number) => void
}) {
  return (
    <Select
      value={String(days)}
      onChange={(v) => onChange(Number(v))}
      options={RANGE_PRESETS.map(p => ({ value: p.value, label: p.label }))}
      className="min-w-[150px]"
    />
  )
}

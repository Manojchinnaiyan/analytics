'use client'

import { Plus, X, Filter as FilterIcon } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { PropertySelect } from '@/components/PropertySelect'
import type { Filter } from '@/lib/api'

const OPERATORS = [
  { value: 'is',           label: 'is' },
  { value: 'is_not',       label: 'is not' },
  { value: 'contains',     label: 'contains' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than',    label: '<' },
]

let _id = 0
const newFilter = (): Filter & { _k: number } => ({ _k: ++_id, property: '', operator: 'is', value: '' })

/**
 * Add/remove filter rows: where <property> <operator> <value>.
 * Property can be an event property (e.g. plan) or native column (country, platform…).
 */
export function FilterBar({
  filters,
  onChange,
}: {
  filters: (Filter & { _k?: number })[]
  onChange: (f: (Filter & { _k?: number })[]) => void
}) {
  const update = (i: number, patch: Partial<Filter>) => {
    const next = [...filters]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 type-caption text-[var(--color-text-muted)]">
        <FilterIcon className="h-3.5 w-3.5" /> Filters
        {filters.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#EEF3FD] text-[#0052F2] type-body-12-400">
            {filters.length}
          </span>
        )}
      </div>

      {filters.length === 0 ? (
        <p className="type-body-13 text-[var(--color-text-subtle)]">No filters — showing all events.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filters.map((f, i) => (
            <div
              key={f._k ?? i}
              className="flex items-center gap-2 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-lg pl-3 pr-1.5 py-1.5"
            >
              <span className="type-body-12-400 text-[var(--color-text-subtle)] w-12 text-right uppercase tracking-wide flex-shrink-0">
                {i === 0 ? 'where' : 'and'}
              </span>
              <PropertySelect
                value={f.property}
                onChange={(property, type) => update(i, { property, type })}
                className="w-44 flex-shrink-0"
              />
              <Select
                value={f.operator}
                onChange={(v) => update(i, { operator: v as Filter['operator'] })}
                options={OPERATORS}
                className="w-[116px] flex-shrink-0"
              />
              <input
                className="ctrl flex-1 min-w-[120px]"
                value={f.value}
                onChange={e => update(i, { value: e.target.value })}
                placeholder="value"
              />
              <button
                onClick={() => onChange(filters.filter((_, j) => j !== i))}
                title="Remove filter"
                className="flex-shrink-0 p-1.5 rounded-md text-[var(--color-text-subtle)] hover:bg-white hover:text-[#DE0202] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onChange([...filters, newFilter()])}
        className="flex items-center gap-1.5 type-link text-[#0052F2] hover:text-[#0C3FA7] w-fit"
      >
        <Plus className="h-4 w-4" /> Add filter
      </button>
    </div>
  )
}

export function stripFilters(filters: (Filter & { _k?: number })[]): Filter[] {
  return filters
    .filter(f => f.property && f.value)
    .map(({ property, operator, value, type }) => ({ property, operator, value, type }))
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { clsx } from 'clsx'

export interface SelectOption {
  value: string
  label: string
  hint?: string // right-aligned secondary text (e.g. count)
}

/**
 * Branded custom dropdown — replaces native <select>.
 * Clean white trigger + popover list, optional search.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchable = false,
  searchPlaceholder = 'Search…',
  allowCustom = false,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  allowCustom?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open, searchable])

  const selected = options.find(o => o.value === value)
  const label = selected?.label ?? value ?? ''
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function choose(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={clsx('relative', className ?? 'min-w-[160px]')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ctrl w-full min-w-0 justify-between"
      >
        <span className={clsx('truncate', !label && 'text-[var(--color-text-subtle)]')}>
          {label || placeholder}
        </span>
        <ChevronDown className={clsx('h-4 w-4 text-[var(--color-text-subtle)] flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[220px] bg-white border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-[var(--color-border)]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--color-text-subtle)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-[var(--color-surface-muted)] rounded-md pl-8 pr-2 py-1.5 type-body-13 text-[var(--color-text)] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              allowCustom && query ? (
                <button
                  onClick={() => choose(query)}
                  className="w-full text-left px-3 py-2 type-body-13 text-[#0052F2] hover:bg-[var(--color-surface-muted)]"
                >
                  Use “{query}”
                </button>
              ) : (
                <p className="px-3 py-3 type-body-13 text-[var(--color-text-subtle)] text-center">No matches</p>
              )
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  onClick={() => choose(o.value)}
                  className={clsx(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 type-body-13 text-left transition-colors',
                    o.value === value ? 'bg-[#EEF3FD] text-[#0052F2]' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {o.value === value && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className={clsx('truncate', o.value !== value && 'pl-[22px]')}>{o.label}</span>
                  </span>
                  {o.hint && <span className="type-body-12-400 text-[var(--color-text-subtle)] flex-shrink-0">{o.hint}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

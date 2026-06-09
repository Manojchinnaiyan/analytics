import type { LucideIcon } from 'lucide-react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { clsx } from 'clsx'

export function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  hint,
  delta,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: string
  loading?: boolean
  hint?: string
  /** fractional change vs prior period (e.g. 0.12 = +12%). null/undefined = no comparison */
  delta?: number | null
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta)
  const up = (delta ?? 0) >= 0

  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
        <p className="type-body-13 text-[var(--color-text-muted)] truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="type-h3 text-[var(--color-text)] leading-none">
          {loading ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {hasDelta && !loading && (
          <span className={clsx(
            'flex items-center gap-0.5 type-body-12-400',
            up ? 'text-emerald-600' : 'text-[#DE0202]',
          )}>
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs((delta as number) * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {hint && <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-1">{hint}</p>}
    </div>
  )
}

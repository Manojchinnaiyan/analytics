import { clsx } from 'clsx'

/** A single shimmering placeholder block. Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('iu-skeleton rounded-md', className)} aria-hidden />
}

/**
 * Full content-area skeleton — header + controls + stat cards + chart + table.
 * Use as the initial-load state of a page so the WHOLE right side shimmers, not
 * just one widget.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-5">
      {/* header: title + subtitle + action */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      {/* KPI cards */}
      <StatsSkeleton />
      {/* main content (chart / table area) */}
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    </div>
  )
}

/** KPI stat-card row. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] p-4 space-y-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

/** Chart placeholder: title + plot area. */
export function ChartSkeleton({ className, height = 'h-72' }: { className?: string; height?: string }) {
  return (
    <div className={clsx('space-y-3', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className={clsx('w-full rounded-lg', height)} />
    </div>
  )
}

/** Generic table: header + rows. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-8', c === 0 ? 'flex-[2]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Vertical list of label + bar rows (sources, referrers, breakdowns). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-24 flex-shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-10 flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}

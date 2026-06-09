import { clsx } from 'clsx'

export function Card({
  className,
  children,
  padding = true,
}: {
  className?: string
  children: React.ReactNode
  padding?: boolean
}) {
  return (
    <div className={clsx('glass rounded-lg', padding && 'p-5', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h2 className="type-h3-16 text-[var(--color-text)]">{title}</h2>
        {subtitle && <p className="type-body-13 text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

'use client'

import { Download } from 'lucide-react'
import { downloadCSV } from '@/lib/csv'

/** Outline button that downloads the given rows as a CSV file. */
export function ExportButton({
  filename,
  rows,
  label = 'Export CSV',
}: {
  filename: string
  rows: Record<string, unknown>[]
  label?: string
}) {
  return (
    <button
      onClick={() => downloadCSV(filename, rows)}
      disabled={!rows.length}
      title={rows.length ? 'Download as CSV' : 'Nothing to export yet'}
      className="inline-flex items-center gap-1.5 px-3 py-2 type-caption rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Download className="h-4 w-4" /> {label}
    </button>
  )
}

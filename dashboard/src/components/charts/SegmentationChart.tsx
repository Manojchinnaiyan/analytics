'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'

interface DataPoint {
  date: string
  value: number
  group?: string
}

export interface Annotation {
  id: string
  date: string
  label: string
}

interface Props {
  data: DataPoint[]
  metric?: string
  /** Previous-period series, aligned to `data` by position (compare mode). */
  compareData?: DataPoint[]
  /** Vertical markers drawn at matching dates. */
  annotations?: Annotation[]
}

// Palette for grouped (broken-down) series.
const SERIES_COLORS = ['#0052F2', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2', '#65A30D', '#DC2626']

export function SegmentationChart({ data, metric = 'Events', compareData, annotations }: Props) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-80 type-body-15 text-[var(--color-text-subtle)]">
      No events found for this date range
    </div>
  )

  const grouped = data.some(d => d.group)

  let chartData: Record<string, unknown>[]
  let seriesKeys: string[]

  if (grouped) {
    // Pivot [{date, value, group}] → [{date, groupA, groupB, ...}]
    const byDate = new Map<string, Record<string, unknown>>()
    const keys = new Set<string>()
    for (const d of data) {
      const g = d.group || '(none)'
      keys.add(g)
      const row = byDate.get(d.date) ?? { date: d.date }
      row[g] = d.value
      byDate.set(d.date, row)
    }
    chartData = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    seriesKeys = Array.from(keys).slice(0, 8)
  } else {
    chartData = data.map((d, i) => ({
      date: d.date,
      value: d.value,
      // Align the previous period by position so both lines share an x-axis.
      ...(compareData ? { prev: compareData[i]?.value ?? null } : {}),
    }))
    seriesKeys = ['value']
  }

  const showCompare = !grouped && !!compareData?.length

  // Only draw annotations that land on a date present in the current series.
  const chartDates = new Set(chartData.map(d => String(d.date)))
  const visibleAnnotations = (annotations ?? []).filter(a => chartDates.has(a.date))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={40} />
        {visibleAnnotations.map(a => (
          <ReferenceLine
            key={a.id}
            x={a.date}
            stroke="#0052F2"
            strokeDasharray="4 3"
            label={{ value: a.label, position: 'top', fontSize: 10, fill: '#0052F2' }}
          />
        ))}
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }}
          labelStyle={{ fontWeight: 600, color: '#18181B' }}
        />
        {(grouped || seriesKeys.length > 1 || showCompare) && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {seriesKeys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            name={grouped ? k : metric}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
        {showCompare && (
          <Line
            type="monotone"
            dataKey="prev"
            name="Previous period"
            stroke="#9AA1B2"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 3 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

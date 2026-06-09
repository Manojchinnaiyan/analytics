'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface RetentionRow {
  cohort_date: string
  cohort_size: number
  periods: number[]
}

interface Props {
  data: RetentionRow[]
  unit?: string // Day | Week | Month
}

function pctColor(val: number): string {
  if (val >= 0.5)  return 'bg-[#0052F2] text-white'
  if (val >= 0.3)  return 'bg-blue-400 text-white'
  if (val >= 0.15) return 'bg-blue-200 text-blue-900'
  if (val >= 0.05) return 'bg-blue-100 text-blue-800'
  return 'bg-[#f1f5f9] text-[#94a3b8]'
}

export function RetentionChart({ data, unit = 'Day' }: Props) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-40 type-body-15 text-[#94a3b8]">No data</div>
  )

  const maxPeriods = Math.max(...data.map(r => r.periods.length))

  // Overall retention curve: size-weighted average % retained at each period
  // across cohorts (the line vendors show above the cohort triangle).
  const curve = Array.from({ length: maxPeriods }, (_, i) => {
    let num = 0, den = 0
    for (const r of data) {
      if (i < r.periods.length) { num += r.cohort_size * r.periods[i]; den += r.cohort_size }
    }
    return { period: `${unit} ${i}`, value: den ? (num / den) * 100 : 0 }
  })

  return (
    <div className="space-y-6">
      {/* Retention curve */}
      <div>
        <h3 className="type-body-13 text-[var(--color-text-muted)] mb-2">Overall retention curve</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={curve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={40} unit="%" domain={[0, 100]} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Line type="monotone" dataKey="value" name="Retention" stroke="#0052F2" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort heatmap */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 type-caption text-[#64748b] whitespace-nowrap">Cohort</th>
              <th className="text-right py-2 pr-4 type-caption text-[#64748b]">Users</th>
              {Array.from({ length: maxPeriods }, (_, i) => (
                <th key={i} className="text-center py-2 px-1 type-caption text-[#64748b] min-w-[52px]">
                  {unit} {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.cohort_date} className="border-t border-[#e2e8f0]">
                <td className="py-2 pr-4 type-small-body text-[#0f172a] whitespace-nowrap">{row.cohort_date}</td>
                <td className="py-2 pr-4 text-right type-body-13 text-[#64748b]">{row.cohort_size.toLocaleString()}</td>
                {row.periods.map((val, i) => (
                  <td key={i} className="py-2 px-1">
                    <div className={`rounded-lg px-1 py-1 text-center type-caption ${pctColor(val)}`}>
                      {(val * 100).toFixed(0)}%
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

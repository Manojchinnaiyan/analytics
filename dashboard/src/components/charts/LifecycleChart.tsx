'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'

export interface LifecycleRow {
  date: string
  new: number
  current: number
  resurrected: number
  dormant: number // negative
}

export function LifecycleChart({ data }: { data: LifecycleRow[] }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-80 type-body-15 text-[var(--color-text-subtle)]">
      No activity in this range
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }}
          labelStyle={{ fontWeight: 600, color: '#18181B' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#DEDFE2" />
        <Bar dataKey="new"         name="New"         stackId="a" fill="#059669" radius={[2, 2, 0, 0]} />
        <Bar dataKey="current"     name="Current"     stackId="a" fill="#0052F2" />
        <Bar dataKey="resurrected" name="Resurrected" stackId="a" fill="#7C3AED" />
        <Bar dataKey="dormant"     name="Dormant"     stackId="a" fill="#DC2626" radius={[0, 0, 2, 2]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

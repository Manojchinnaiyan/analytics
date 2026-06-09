'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export interface HistBucket { label: string; from: number; to: number; count: number }

export function FunnelHistogram({ buckets }: { buckets: HistBucket[] }) {
  if (!buckets.length || buckets.every(b => b.count === 0)) {
    return (
      <div className="h-72 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">
        Not enough completed conversions to show a distribution
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8A8E99' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: '#8A8E99' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }}
          formatter={(v: number) => [`${v.toLocaleString()} users`, 'converted in']}
        />
        <Bar dataKey="count" name="Users" fill="#0052F2" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

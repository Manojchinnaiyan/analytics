import { Play } from 'lucide-react'

const box = 'rounded-xl border border-[var(--color-border)] bg-[#FBFCFE] p-3 h-[120px] overflow-hidden'

/** Funnels — descending bars with conversion %. */
export function FunnelPreview() {
  const steps = [{ h: 100, l: 'Visit' }, { h: 64, l: 'Cart' }, { h: 41, l: 'Checkout' }, { h: 23, l: 'Paid' }]
  return (
    <div className={box}>
      <div className="flex items-end justify-between gap-2 h-[78px]">
        {steps.map((s, i) => (
          <div key={s.l} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[9px] text-[var(--color-text-subtle)] mb-1">{s.h}%</span>
            <div className="iu-bar w-full rounded-t-md" style={{ height: `${s.h}%`, background: 'linear-gradient(180deg,#6BA0F7,#0052F2)', animationDelay: `${i * 100}ms` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5">{steps.map((s) => <span key={s.l} className="text-[8px] text-[var(--color-text-subtle)] flex-1 text-center">{s.l}</span>)}</div>
    </div>
  )
}

/** Retention — a cohort heatmap. */
export function RetentionPreview() {
  const shades = ['#0052F2', '#3B74F5', '#6B97F8', '#A7C2FB', '#D6E2FD', '#EEF3FD']
  return (
    <div className={box}>
      <div className="space-y-1">
        {[0, 1, 2, 3, 4].map((r) => (
          <div key={r} className="flex gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((c) => {
              const idx = Math.min(5, Math.max(0, c + r - 1))
              return <span key={c} className="iu-bar flex-1 h-3.5 rounded-[3px]" style={{ background: c < r ? 'transparent' : shades[idx], animationDelay: `${(r * 7 + c) * 18}ms` }} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Session replay — a scrubber + cursor. */
export function ReplayPreview() {
  return (
    <div className={`${box} relative`}>
      <div className="absolute inset-3 rounded-lg bg-gradient-to-br from-[#EEF3FD] to-white border border-[var(--color-border)]">
        <span className="absolute left-1/2 top-1/2 grid place-items-center h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-brand)] text-white iu-ring"><Play className="h-4 w-4 ml-0.5" /></span>
        {/* moving cursor */}
        <span className="absolute h-2 w-2 rounded-full bg-[#18181B] iu-rise" style={{ left: '22%', top: '28%' }} />
      </div>
      <div className="absolute left-3 right-3 bottom-3 flex items-center gap-2">
        <span className="h-1.5 flex-1 rounded-full bg-[var(--color-surface-muted)] overflow-hidden"><span className="block h-full w-2/5 rounded-full bg-[var(--color-brand)]" /></span>
        <span className="text-[8px] text-[var(--color-text-subtle)]">0:42</span>
      </div>
    </div>
  )
}

/** Revenue — area chart + figure. */
export function RevenuePreview() {
  return (
    <div className={box}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-[var(--color-text)]">$48,210</span>
        <span className="text-[9px] font-medium text-[#16A34A]">▲ 18%</span>
      </div>
      <svg viewBox="0 0 200 56" className="w-full h-[64px] mt-1" preserveAspectRatio="none">
        <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16A34A" stopOpacity=".22" /><stop offset="100%" stopColor="#16A34A" stopOpacity="0" /></linearGradient></defs>
        <path d="M0,48 C30,44 45,26 70,30 C95,34 110,14 140,18 C170,22 185,8 200,6 L200,56 L0,56 Z" fill="url(#rev)" />
        <path d="M0,48 C30,44 45,26 70,30 C95,34 110,14 140,18 C170,22 185,8 200,6" fill="none" stroke="#16A34A" strokeWidth="2" className="iu-path-draw" />
      </svg>
    </div>
  )
}

/** Segmentation — multi-series lines. */
export function SegmentPreview() {
  return (
    <div className={box}>
      <svg viewBox="0 0 200 92" className="w-full h-full" preserveAspectRatio="none">
        <path d="M0,70 C40,64 60,40 100,46 C140,52 160,24 200,20" fill="none" stroke="#0052F2" strokeWidth="2.5" className="iu-path-draw" />
        <path d="M0,82 C40,78 60,62 100,66 C140,70 160,52 200,48" fill="none" stroke="#8B5CF6" strokeWidth="2" className="iu-path-draw" style={{ animationDelay: '.2s' }} />
        <path d="M0,60 C40,58 60,52 100,50 C140,48 160,40 200,34" fill="none" stroke="#22C55E" strokeWidth="2" className="iu-path-draw" style={{ animationDelay: '.4s' }} />
      </svg>
    </div>
  )
}

/** Web vitals — a score gauge. */
export function VitalsPreview() {
  const score = 96, r = 30, circ = 2 * Math.PI * r
  return (
    <div className={`${box} grid place-items-center`}>
      <div className="relative h-[84px] w-[84px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-surface-muted)" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="#16A34A" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * 0.04} style={{ animation: 'iu-draw 1.6s ease forwards' }} />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[20px] font-semibold text-[var(--color-text)]">{score}</span>
      </div>
    </div>
  )
}

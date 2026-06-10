import {
  LayoutGrid, BarChart3, Filter, Repeat, DollarSign, PlayCircle, Route, Settings, Search,
} from 'lucide-react'

/** A high-fidelity, self-animating preview of the InspectUser dashboard. Pure CSS+SVG. */
export function DashboardPreview({ className = '' }: { className?: string }) {
  const nav = [
    { icon: LayoutGrid, label: 'Overview', active: true },
    { icon: BarChart3, label: 'Charts' },
    { icon: Filter, label: 'Funnels' },
    { icon: Repeat, label: 'Retention' },
    { icon: DollarSign, label: 'Revenue' },
    { icon: PlayCircle, label: 'Replay' },
    { icon: Route, label: 'Paths' },
    { icon: Settings, label: 'Settings' },
  ]
  const kpis = [
    { k: 'Revenue', v: '$48.2k', d: '+18%' },
    { k: 'Active users', v: '12,408', d: '+9%' },
    { k: 'Conversion', v: '4.7%', d: '+0.6pt' },
    { k: 'Avg session', v: '3m 12s', d: '+11s' },
  ]
  const funnel = [100, 72, 54, 38, 21]
  const sources = [
    { n: 'WhatsApp', v: 38, c: '#25D366' },
    { n: 'Google', v: 27, c: '#4285F4' },
    { n: 'Instagram', v: 19, c: '#E1306C' },
    { n: 'Direct', v: 16, c: '#94A3B8' },
  ]
  return (
    <div className={`rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_40px_90px_-30px_rgba(16,24,40,.28)] overflow-hidden ${className}`}>
      {/* window bar */}
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-[var(--color-border)] bg-[#FBFBFD]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <div className="mx-auto flex items-center gap-1.5 px-3 h-5 rounded bg-white border border-[var(--color-border)] text-[10px] text-[var(--color-text-subtle)]">app.inspectuser.com</div>
      </div>

      <div className="flex h-[420px] text-left">
        {/* sidebar */}
        <aside className="hidden sm:flex flex-col w-[148px] flex-shrink-0 border-r border-[var(--color-border)] bg-[#FAFBFC] p-3">
          <div className="flex items-center gap-2 px-1 mb-4">
            <span className="grid place-items-center h-6 w-6 rounded-md iu-aurora text-white text-[12px] font-bold">i</span>
            <span className="text-[13px] font-semibold text-[var(--color-text)]">InspectUser</span>
          </div>
          <nav className="space-y-0.5">
            {nav.map((n) => (
              <div key={n.label} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] ${n.active ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium' : 'text-[var(--color-text-muted)]'}`}>
                <n.icon className="h-3.5 w-3.5" />{n.label}
              </div>
            ))}
          </nav>
        </aside>

        {/* main */}
        <div className="flex-1 min-w-0 p-4 bg-white overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[14px] font-semibold text-[var(--color-text)]">Overview</div>
              <div className="text-[11px] text-[var(--color-text-subtle)]">Acme Store · production</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-2.5 h-7 rounded-lg border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]"><Search className="h-3 w-3" /> Last 30 days</span>
              <span className="h-7 w-7 rounded-full iu-aurora" />
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
            {kpis.map((s) => (
              <div key={s.k} className="rounded-xl border border-[var(--color-border)] p-2.5">
                <div className="text-[10px] text-[var(--color-text-subtle)]">{s.k}</div>
                <div className="text-[16px] font-semibold text-[var(--color-text)] leading-tight">{s.v}</div>
                <div className="text-[10px] font-medium text-[#16A34A]">▲ {s.d}</div>
              </div>
            ))}
          </div>

          {/* area chart */}
          <div className="rounded-xl border border-[var(--color-border)] p-3 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-[var(--color-text)]">Revenue & active users</span>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-subtle)]">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />Revenue</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />Users</span>
              </div>
            </div>
            <svg viewBox="0 0 480 110" className="w-full h-[92px]" preserveAspectRatio="none">
              <defs>
                <linearGradient id="ar1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052F2" stopOpacity=".22" /><stop offset="100%" stopColor="#0052F2" stopOpacity="0" /></linearGradient>
              </defs>
              <path d="M0,86 C50,78 80,44 130,50 C180,56 210,22 260,28 C310,34 340,14 390,18 C430,21 460,10 480,8 L480,110 L0,110 Z" fill="url(#ar1)" />
              <path d="M0,86 C50,78 80,44 130,50 C180,56 210,22 260,28 C310,34 340,14 390,18 C430,21 460,10 480,8" fill="none" stroke="#0052F2" strokeWidth="2.5" strokeLinecap="round" className="iu-path-draw" />
              <path d="M0,96 C50,92 80,70 130,74 C180,78 210,56 260,60 C310,64 340,46 390,50 C430,53 460,42 480,40" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" className="iu-path-draw" style={{ animationDelay: '.3s' }} />
            </svg>
          </div>

          {/* funnel + sources */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[var(--color-border)] p-3">
              <span className="text-[11px] font-medium text-[var(--color-text)]">Funnel</span>
              <div className="mt-2 flex items-end gap-1.5 h-[52px]">
                {funnel.map((h, i) => (
                  <div key={i} className="iu-bar flex-1 rounded-t-[2px]" style={{ height: `${h}%`, background: 'linear-gradient(180deg,#4C85F5,#0052F2)', animationDelay: `${i * 90}ms` }} />
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] p-3">
              <span className="text-[11px] font-medium text-[var(--color-text)]">Top sources</span>
              <div className="mt-2 space-y-1.5">
                {sources.map((s) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-text-muted)] w-14 truncate">{s.n}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${s.v * 2.4}%`, background: s.c }} />
                    </span>
                    <span className="text-[10px] text-[var(--color-text-subtle)]">{s.v}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

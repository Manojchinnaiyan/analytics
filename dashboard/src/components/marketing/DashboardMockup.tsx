/**
 * DashboardMockup — a stylized, self-animating "screenshot" of the product:
 * a browser chrome wrapping a fake analytics dashboard with an area chart that
 * draws itself, growing bars, and live stat cards. Pure SVG + CSS (no JS).
 */
export function DashboardMockup({ className = '' }: { className?: string }) {
  const bars = [38, 52, 47, 63, 58, 74, 69, 86, 79, 92, 88, 100]
  return (
    <div className={`relative rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_30px_80px_-20px_rgba(0,82,242,.30)] overflow-hidden ${className}`}>
      {/* browser chrome */}
      <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[var(--color-border)] bg-[#FBFBFD]">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <div className="mx-auto flex items-center gap-2 px-3 h-6 rounded-md bg-white border border-[var(--color-border)] text-[11px] text-[var(--color-text-subtle)]">
          <span className="h-2 w-2 rounded-full bg-[#28C840]" /> app.inspectuser.com/overview
        </div>
      </div>

      <div className="p-5 bg-gradient-to-b from-white to-[#F7F9FF]">
        {/* stat cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { k: 'Revenue', v: '$48.2k', d: '+18%' },
            { k: 'Paying users', v: '1,204', d: '+9%' },
            { k: 'Conversion', v: '4.7%', d: '+0.6pt' },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div className="text-[11px] text-[var(--color-text-subtle)]">{s.k}</div>
              <div className="text-[18px] font-semibold text-[var(--color-text)] leading-tight mt-0.5">{s.v}</div>
              <div className="text-[11px] font-medium text-[#16A34A]">{s.d}</div>
            </div>
          ))}
        </div>

        {/* area chart */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[var(--color-text)]">Revenue by source</span>
            <span className="text-[11px] text-[var(--color-text-subtle)]">Last 30 days</span>
          </div>
          <svg viewBox="0 0 320 96" className="w-full h-24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="iuArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0052F2" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0052F2" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,78 C30,70 50,40 80,44 C110,48 130,20 160,26 C190,32 210,12 240,16 C270,20 295,8 320,6 L320,96 L0,96 Z" fill="url(#iuArea)" />
            <path
              d="M0,78 C30,70 50,40 80,44 C110,48 130,20 160,26 C190,32 210,12 240,16 C270,20 295,8 320,6"
              fill="none" stroke="#0052F2" strokeWidth="2.5" strokeLinecap="round" className="iu-path-draw"
            />
          </svg>
        </div>

        {/* bar chart */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium text-[var(--color-text)]">Funnel conversions</span>
            <span className="text-[11px] text-[#16A34A] font-medium">▲ 12.4%</span>
          </div>
          <div className="flex items-end gap-1.5 h-16">
            {bars.map((h, i) => (
              <div
                key={i}
                className="iu-bar flex-1 rounded-t-[3px]"
                style={{
                  height: `${h}%`,
                  background: 'linear-gradient(180deg,#4C85F5,#0052F2)',
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { Check, TrendingUp } from 'lucide-react'
import { brand } from '@/config/brand'

/**
 * AuthShell — clean, light split-screen auth: a soft branded panel on the left
 * (mini dashboard preview + value props) and the form on the right. Responsive:
 * the panel is hidden on mobile and the form centers.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* Brand panel (light) */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 bg-gradient-to-br from-[#EFF4FE] via-white to-[#F4F0FE]">
        <div className="absolute inset-0 iu-grid opacity-70" aria-hidden />
        <div className="absolute -top-24 -left-24 h-96 w-96 iu-blob bg-[#4C85F5] opacity-25 iu-float-slow" aria-hidden />

        <a href="/" className="relative flex items-center gap-2">
          <span className="grid place-items-center h-9 w-9 rounded-lg iu-aurora text-white font-bold">i</span>
          <span className="text-[19px] font-semibold text-[var(--color-text)]">{brand.name}</span>
        </a>

        <div className="relative max-w-md">
          <h2 className="text-[32px] font-semibold leading-tight tracking-tight text-[var(--color-text)]">See exactly what <span className="iu-gradient-text">drives growth.</span></h2>
          <p className="mt-3 text-[16px] text-[var(--color-text-muted)]">{brand.tagline}</p>

          {/* clean mini preview */}
          <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_24px_60px_-30px_rgba(16,24,40,.25)] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] text-[var(--color-text-subtle)]">Revenue</div>
                <div className="text-[20px] font-semibold text-[var(--color-text)] leading-tight">$48,210</div>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#16A34A] bg-[#16A34A]/10 px-2 py-1 rounded-full"><TrendingUp className="h-3.5 w-3.5" /> +18%</span>
            </div>
            <svg viewBox="0 0 300 70" className="w-full h-16" preserveAspectRatio="none">
              <defs><linearGradient id="auth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052F2" stopOpacity=".18" /><stop offset="100%" stopColor="#0052F2" stopOpacity="0" /></linearGradient></defs>
              <path d="M0,58 C40,52 60,26 100,30 C140,34 160,12 200,16 C240,20 270,6 300,4 L300,70 L0,70 Z" fill="url(#auth)" />
              <path d="M0,58 C40,52 60,26 100,30 C140,34 160,12 200,16 C240,20 270,6 300,4" fill="none" stroke="#0052F2" strokeWidth="2.5" strokeLinecap="round" className="iu-path-draw" />
            </svg>
          </div>

          <ul className="mt-8 space-y-2.5">
            {['Product analytics, replay & revenue in one', 'Self-hosted — own your data', 'Live in minutes, no data team'].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[15px] text-[var(--color-text)]">
                <span className="grid place-items-center h-5 w-5 rounded-full bg-[#16A34A]/10 text-[#16A34A]"><Check className="h-3.5 w-3.5" /></span>{t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-[var(--color-text-subtle)]">© {brand.name}. Self-hosted product analytics.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <a href="/" className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <span className="grid place-items-center h-8 w-8 rounded-lg iu-aurora text-white font-bold">i</span>
            <span className="text-[18px] font-semibold text-[var(--color-text)]">{brand.name}</span>
          </a>
          {children}
        </div>
      </div>
    </div>
  )
}

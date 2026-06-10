import { Check } from 'lucide-react'
import { brand } from '@/config/brand'

/**
 * AuthShell — split-screen auth layout: an animated brand panel on the left
 * (value props + a self-drawing mini chart) and the form on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden iu-aurora text-white p-12">
        <div className="absolute inset-0 iu-dots opacity-25" aria-hidden />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl iu-float" aria-hidden />

        <a href="/" className="relative flex items-center gap-2">
          <span className="grid place-items-center h-9 w-9 rounded-lg bg-white/15 backdrop-blur font-bold">i</span>
          <span className="text-[20px] font-semibold">{brand.name}</span>
        </a>

        <div className="relative max-w-md">
          <h2 className="text-[34px] font-semibold leading-tight tracking-tight">See exactly what drives growth.</h2>
          <p className="mt-3 text-[16px] text-white/85">{brand.tagline}</p>

          {/* mini self-drawing chart */}
          <div className="mt-8 rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-5">
            <div className="flex items-center justify-between text-[12px] text-white/80 mb-2">
              <span>Revenue by source</span><span>▲ 18%</span>
            </div>
            <svg viewBox="0 0 300 70" className="w-full h-16" preserveAspectRatio="none">
              <path d="M0,60 C40,52 60,24 100,30 C140,36 160,12 200,16 C240,20 270,6 300,4"
                fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" className="iu-path-draw" />
            </svg>
            <div className="mt-3 flex items-end gap-1.5 h-10">
              {[40, 60, 50, 72, 64, 85, 78, 96].map((h, i) => (
                <div key={i} className="iu-bar flex-1 rounded-t bg-white/70" style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>

          <ul className="mt-8 space-y-2.5">
            {['Product analytics, replay & revenue in one', 'Self-hosted — own your data', 'Live in minutes, no data team'].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[15px] text-white/90">
                <span className="grid place-items-center h-5 w-5 rounded-full bg-white/20"><Check className="h-3.5 w-3.5" /></span>{t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-white/70">© {brand.name}. Self-hosted product analytics.</p>
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

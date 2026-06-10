import {
  BarChart3, Filter, Repeat, PlayCircle, DollarSign, Link2, MapPin, Gauge,
  ArrowRight, Check, Sparkles, Zap, ShieldCheck, Globe, MousePointerClick,
} from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { DashboardMockup } from '@/components/marketing/DashboardMockup'
import { brand } from '@/config/brand'

const FEATURES = [
  { icon: BarChart3, title: 'Product analytics', desc: 'Events, segmentation, paths and breakdowns — the full picture of how people use your product.' },
  { icon: Filter, title: 'Funnels', desc: 'See exactly where users drop off, step by step, and what to fix to lift conversion.' },
  { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, who churns, and which behaviors predict a loyal, paying customer.' },
  { icon: PlayCircle, title: 'Session replay', desc: 'Watch real sessions like a video — every click, scroll and rage-click, with inputs masked.' },
  { icon: DollarSign, title: 'Revenue attribution', desc: 'Tie money to behavior. See revenue by source, AOV, ARPU and LTV — not just clicks.' },
  { icon: Gauge, title: 'Web vitals', desc: 'Core Web Vitals tied to conversion — because slow pages quietly kill your funnel.' },
]

const SHOWCASE = [
  {
    tag: 'Funnels', icon: Filter,
    title: 'Find the leak. Fix the funnel.',
    desc: 'Drop your steps in and watch conversion fall away in real time. Click any stage to see who dropped, then jump straight into their session replay to understand why.',
    points: ['Step-by-step drop-off', 'Time-to-convert windows', 'Breakdown by source & device'],
  },
  {
    tag: 'Revenue', icon: DollarSign,
    title: 'Revenue by source — not just clicks.',
    desc: 'Most tools show you traffic. We tie every order to the channel and campaign that drove it, server-side. Know your true ROI per source, AOV and ARPU at a glance.',
    points: ['Source-attributed revenue', 'AOV · ARPU · ARPPU · LTV', 'Stripe & Shopify-ready'],
  },
  {
    tag: 'Replay', icon: PlayCircle,
    title: 'Watch what really happened.',
    desc: 'Session replay is built into the SDK — one line, no separate tool. Rage-clicks, dead-clicks and JS errors surface automatically, with all inputs masked for privacy.',
    points: ['One-line install', 'Rage & dead-click detection', 'PII masked by default'],
  },
]

const COMPARE = [
  ['Product analytics', true, false, true],
  ['Session replay', true, true, false],
  ['Revenue attribution', true, false, false],
  ['Smart links on your domain', true, false, false],
  ['Self-hosted / own your data', true, false, false],
  ['One flat price', true, false, false],
]

export default function HomePage() {
  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div className="absolute inset-0 iu-grid" aria-hidden />
        <div className="absolute -top-24 -left-24 h-[420px] w-[420px] iu-blob bg-[#4C85F5] iu-float-slow" aria-hidden />
        <div className="absolute top-20 -right-32 h-[460px] w-[460px] iu-blob bg-[#8B5CF6] iu-float" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-5">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <Reveal as="div" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-white/70 backdrop-blur text-[13px] text-[var(--color-text-muted)] mb-6">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand)]" /> Self-hosted · Privacy-first · Blazing fast
              </Reveal>
              <Reveal as="h1" delay={60} className="text-[40px] sm:text-[58px] leading-[1.05] font-semibold tracking-tight">
                See exactly what <span className="iu-gradient-text">drives growth.</span>
              </Reveal>
              <Reveal as="p" delay={140} className="mt-5 text-[18px] leading-relaxed text-[var(--color-text-muted)] max-w-xl">
                {brand.name} unifies <b className="text-[var(--color-text)] font-medium">product analytics, session replay</b> and{' '}
                <b className="text-[var(--color-text)] font-medium">revenue-by-source attribution</b> in one fast, self-hosted platform — so you stop guessing and start growing.
              </Reveal>
              <Reveal as="div" delay={220} className="mt-8 flex flex-wrap items-center gap-3">
                <a href="/signup" className="relative overflow-hidden group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium shadow-lg shadow-[rgba(0,82,242,.25)] hover:bg-[var(--color-brand-hover)] transition-colors">
                  <span className="absolute inset-0 iu-sheen pointer-events-none" aria-hidden />
                  Start free <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a href="/#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-border)] bg-white text-[15px] font-medium text-[var(--color-text)] hover:border-[var(--color-brand)] transition-colors">
                  Explore features
                </a>
              </Reveal>
              <Reveal as="div" delay={300} className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-subtle)]">
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> 1-line SDK install</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> No credit card</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> Own your data</span>
              </Reveal>
            </div>

            <Reveal as="div" delay={120} className="relative">
              <div className="absolute -inset-6 iu-aurora opacity-20 blur-2xl rounded-[2rem]" aria-hidden />
              <DashboardMockup className="relative iu-float" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────── Trust strip ───────── */}
      <section className="border-y border-[var(--color-border)] bg-[#FAFAFC]">
        <div className="mx-auto max-w-7xl px-5 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { v: '< 50ms', k: 'Query latency' },
            { v: '2.4B+', k: 'Events / day capacity' },
            { v: '1 line', k: 'To install the SDK' },
            { v: '100%', k: 'Your data, self-hosted' },
          ].map((s, i) => (
            <Reveal key={s.k} delay={i * 80}>
              <div className="text-[30px] font-semibold iu-gradient-text">{s.v}</div>
              <div className="text-[13px] text-[var(--color-text-subtle)] mt-1">{s.k}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="max-w-2xl mx-auto text-center mb-14">
            <span className="text-[13px] font-semibold tracking-wide uppercase text-[var(--color-brand)]">Everything in one place</span>
            <h2 className="mt-3 text-[34px] sm:text-[42px] font-semibold tracking-tight">The analytics stack, unified</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Stop stitching three tools together. Product analytics, replay and revenue — one platform, one source of truth.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="group h-full rounded-2xl border border-[var(--color-border)] bg-white p-6 hover:shadow-[0_24px_60px_-24px_rgba(0,82,242,.28)] hover:-translate-y-1 transition-all">
                  <span className="grid place-items-center h-11 w-11 rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)] group-hover:iu-aurora group-hover:text-white transition-all">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-[18px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Product showcase ───────── */}
      <section id="products" className="py-12 space-y-28">
        {SHOWCASE.map((s, i) => (
          <div key={s.tag} className="mx-auto max-w-7xl px-5">
            <div className={`grid lg:grid-cols-2 gap-12 items-center ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <Reveal>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)] text-[13px] font-medium">
                  <s.icon className="h-3.5 w-3.5" /> {s.tag}
                </span>
                <h2 className="mt-4 text-[32px] sm:text-[38px] font-semibold tracking-tight leading-tight">{s.title}</h2>
                <p className="mt-4 text-[17px] text-[var(--color-text-muted)] leading-relaxed">{s.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-[15px] text-[var(--color-text)]">
                      <span className="grid place-items-center h-5 w-5 rounded-full bg-[#16A34A]/10 text-[#16A34A]"><Check className="h-3.5 w-3.5" /></span>{p}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={120} className="relative">
                <div className="absolute -inset-5 iu-aurora opacity-[0.14] blur-2xl rounded-3xl" aria-hidden />
                <DashboardMockup className="relative" />
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* ───────── How it works ───────── */}
      <section className="py-24 bg-[#FAFAFC] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[34px] sm:text-[42px] font-semibold tracking-tight">Live in minutes</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">No data team required. Drop in one line and the insights start flowing.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Zap, n: '01', t: 'Install the SDK', d: 'Add one script — autocapture records pageviews, clicks, scroll, sessions and errors automatically.' },
              { icon: MousePointerClick, n: '02', t: 'Ship & track', d: 'Add revenue() at checkout, share smart links on your own domain, and let events stream in.' },
              { icon: BarChart3, n: '03', t: 'Find what grows', d: 'Funnels, retention, revenue-by-source and replays — answers, not dashboards to babysit.' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="relative h-full rounded-2xl border border-[var(--color-border)] bg-white p-7">
                  <span className="absolute top-6 right-6 text-[40px] font-bold text-[var(--color-brand-soft)]">{s.n}</span>
                  <span className="grid place-items-center h-11 w-11 rounded-xl iu-aurora text-white"><s.icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-[19px] font-semibold">{s.t}</h3>
                  <p className="mt-2 text-[14px] text-[var(--color-text-muted)] leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Comparison ───────── */}
      <section id="compare" className="py-24">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="text-center mb-12">
            <h2 className="text-[34px] sm:text-[42px] font-semibold tracking-tight">One tool instead of three</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Replace your analytics + replay + attribution stack — and own the data.</p>
          </Reveal>
          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-[#FAFAFC]">
                    <th className="text-left font-medium text-[var(--color-text-muted)] px-5 py-4">Capability</th>
                    <th className="px-4 py-4 font-semibold text-[var(--color-brand)]">{brand.name}</th>
                    <th className="px-4 py-4 font-medium text-[var(--color-text-subtle)]">Replay tools</th>
                    <th className="px-4 py-4 font-medium text-[var(--color-text-subtle)]">Analytics SaaS</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map(([label, a, b, c]) => (
                    <tr key={label as string} className="border-t border-[var(--color-border)]">
                      <td className="px-5 py-3.5 text-[var(--color-text)]">{label}</td>
                      {[a, b, c].map((v, j) => (
                        <td key={j} className="px-4 py-3.5 text-center">
                          {v ? <Check className="inline h-5 w-5 text-[#16A34A]" /> : <span className="text-[var(--color-text-subtle)]">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Pricing teaser ───────── */}
      <section id="pricing" className="py-24 bg-[#FAFAFC] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center mb-14">
            <h2 className="text-[34px] sm:text-[42px] font-semibold tracking-tight">Simple, honest pricing</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Self-host free, or let us run it. No surprise usage bills.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {[
              { name: 'Self-hosted', price: 'Free', sub: 'Run it on your own server', cta: 'Get started', highlight: false,
                feats: ['Unlimited events', 'All features', 'Your infrastructure', 'Community support'] },
              { name: 'Cloud', price: '$49', sub: 'per month, flat', cta: 'Start free trial', highlight: true,
                feats: ['Fully managed', 'Session replay included', 'Revenue attribution', 'Email support'] },
              { name: 'Scale', price: 'Custom', sub: 'For high-volume teams', cta: 'Talk to us', highlight: false,
                feats: ['SSO & roles', 'Data warehouse export', 'SLA & priority support', 'Onboarding'] },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <div className={`h-full rounded-2xl p-7 border ${p.highlight ? 'border-transparent iu-aurora text-white shadow-xl shadow-[rgba(0,82,242,.3)]' : 'border-[var(--color-border)] bg-white'}`}>
                  <div className={`text-[14px] font-medium ${p.highlight ? 'text-white/90' : 'text-[var(--color-text-muted)]'}`}>{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[38px] font-semibold">{p.price}</span>
                    {p.price !== 'Custom' && p.price !== 'Free' && <span className={`text-[14px] ${p.highlight ? 'text-white/80' : 'text-[var(--color-text-subtle)]'}`}>/mo</span>}
                  </div>
                  <div className={`text-[13px] ${p.highlight ? 'text-white/80' : 'text-[var(--color-text-subtle)]'}`}>{p.sub}</div>
                  <a href="/signup" className={`mt-5 block text-center px-4 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${p.highlight ? 'bg-white text-[var(--color-brand)] hover:bg-white/90' : 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]'}`}>{p.cta}</a>
                  <ul className="mt-6 space-y-2.5">
                    {p.feats.map((f) => (
                      <li key={f} className={`flex items-center gap-2 text-[14px] ${p.highlight ? 'text-white/90' : 'text-[var(--color-text)]'}`}>
                        <Check className={`h-4 w-4 ${p.highlight ? 'text-white' : 'text-[#16A34A]'}`} /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl iu-aurora px-8 py-16 sm:px-16 text-center text-white">
              <div className="absolute inset-0 iu-dots opacity-30" aria-hidden />
              <div className="relative">
                <h2 className="text-[34px] sm:text-[46px] font-semibold tracking-tight">Start seeing what drives growth</h2>
                <p className="mt-4 text-[18px] text-white/85 max-w-xl mx-auto">Install in minutes. Own your data. Replace three tools with one.</p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <a href="/signup" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-[var(--color-brand)] text-[16px] font-semibold hover:bg-white/90 transition-colors">
                    Start free <ArrowRight className="h-4 w-4" />
                  </a>
                  <a href="/login" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/40 text-white text-[16px] font-medium hover:bg-white/10 transition-colors">
                    Log in
                  </a>
                </div>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-white/80">
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> GDPR-friendly</span>
                  <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4" /> Self-hosted</span>
                  <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4" /> Blazing fast</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

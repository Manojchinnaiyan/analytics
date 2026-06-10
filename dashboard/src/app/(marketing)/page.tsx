import {
  BarChart3, Filter, Repeat, PlayCircle, DollarSign, Gauge,
  ArrowRight, Check, Sparkles, Zap, ShieldCheck, Globe, MousePointerClick, TrendingUp, Users,
} from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { CountUp } from '@/components/marketing/CountUp'
import { DashboardMockup } from '@/components/marketing/DashboardMockup'
import { brand } from '@/config/brand'

const SHOWCASE = [
  {
    tag: 'Funnels', icon: Filter,
    title: 'Find the leak. Fix the funnel.',
    desc: 'Drop your steps in and watch conversion fall away in real time. Click any stage to see who dropped — then jump straight into their session replay to understand why.',
    points: ['Step-by-step drop-off', 'Time-to-convert windows', 'Breakdown by source & device'],
  },
  {
    tag: 'Revenue', icon: DollarSign,
    title: 'Revenue by source — not just clicks.',
    desc: 'Most tools show traffic. We tie every order to the channel and campaign that drove it, server-side. Know your true ROI per source, AOV and ARPU at a glance.',
    points: ['Source-attributed revenue', 'AOV · ARPU · ARPPU · LTV', 'Stripe & Shopify-ready'],
  },
  {
    tag: 'Replay', icon: PlayCircle,
    title: 'Watch what really happened.',
    desc: 'Session replay is built into the SDK — one line, no separate tool. Rage-clicks, dead-clicks and JS errors surface automatically, with every input masked for privacy.',
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
      {/* ───────── Hero (dark) ───────── */}
      <section className="relative overflow-hidden iu-hero-dark text-white pt-32 pb-28 sm:pt-44 sm:pb-36">
        <div className="iu-mesh-blob h-[520px] w-[520px] bg-[#0052F2]" style={{ top: '-120px', left: '-80px' }} aria-hidden />
        <div className="iu-mesh-blob h-[560px] w-[560px] bg-[#8B5CF6]" style={{ top: '40px', right: '-140px', animationDelay: '4s' }} aria-hidden />
        <div className="iu-mesh-blob h-[420px] w-[420px] bg-[#22D3EE]" style={{ bottom: '-160px', left: '40%', animationDelay: '8s', opacity: .3 }} aria-hidden />
        <div className="absolute inset-0 iu-noise opacity-60" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-5">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Reveal as="div" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full iu-glass text-[13px] text-white/85 mb-7">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-75 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#22D3EE]" /></span>
                Analytics · Replay · Revenue — one platform
              </Reveal>
              <Reveal as="h1" delay={60} className="text-[44px] sm:text-[64px] leading-[1.03] font-semibold tracking-tight">
                See exactly what<br /><span className="iu-gradient-text">drives growth.</span>
              </Reveal>
              <Reveal as="p" delay={140} className="mt-6 text-[18px] sm:text-[19px] leading-relaxed text-white/70 max-w-xl">
                {brand.name} unifies product analytics, session replay and revenue-by-source attribution in one blazing-fast, self-hosted platform. Stop guessing. Start growing.
              </Reveal>
              <Reveal as="div" delay={220} className="mt-9 flex flex-wrap items-center gap-3">
                <a href="/signup" className="relative overflow-hidden group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-[#07070D] text-[15px] font-semibold shadow-[0_0_40px_-6px_rgba(99,102,241,.6)] hover:shadow-[0_0_60px_-4px_rgba(99,102,241,.9)] transition-shadow">
                  <span className="absolute inset-0 iu-sheen pointer-events-none" aria-hidden />
                  Start free <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a href="/#features" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl iu-glass text-[15px] font-medium text-white hover:bg-white/10 transition-colors">
                  Explore the platform
                </a>
              </Reveal>
              <Reveal as="div" delay={300} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/55">
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#22D3EE]" /> 1-line SDK install</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#22D3EE]" /> No credit card</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#22D3EE]" /> Own your data</span>
              </Reveal>
            </div>

            <Reveal as="div" delay={120} className="relative">
              <div className="relative rounded-2xl iu-conic-ring">
                <DashboardMockup className="relative iu-rise" />
              </div>
              {/* floating glass accent cards */}
              <div className="absolute -left-6 sm:-left-10 top-16 iu-glass rounded-2xl px-4 py-3 text-white iu-rise" style={{ animationDelay: '1.5s' }}>
                <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#22D3EE]" /><span className="text-[12px] text-white/70">Revenue</span></div>
                <div className="text-[18px] font-semibold">+18.4%</div>
              </div>
              <div className="absolute -right-4 sm:-right-8 bottom-12 iu-glass rounded-2xl px-4 py-3 text-white iu-rise" style={{ animationDelay: '3s' }}>
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#8B5CF6]" /><span className="text-[12px] text-white/70">Live now</span></div>
                <div className="text-[18px] font-semibold">1,204</div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* logo marquee */}
        <div className="relative mt-20 max-w-7xl mx-auto px-5">
          <p className="text-center text-[12px] uppercase tracking-widest text-white/40 mb-6">Built for data-driven teams</p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_15%,#000_85%,transparent)]">
            <div className="flex w-max iu-marquee gap-12 text-white/35 text-[20px] font-semibold">
              {[...Array(2)].map((_, k) => (
                <div key={k} className="flex gap-12 pr-12">
                  {['NorthPeak', 'Cratejoy', 'Lumen', 'Hyperdrive', 'Orbit', 'Foundry', 'Mercury', 'Vanta'].map((n) => (
                    <span key={n + k} className="whitespace-nowrap">{n}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Stats (count-up) ───────── */}
      <section className="relative -mt-8">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden bg-[var(--color-border)] shadow-[0_30px_80px_-30px_rgba(0,82,242,.4)]">
              {[
                { v: <CountUp to={50} suffix="ms" />, pre: '<', k: 'Query latency' },
                { v: <CountUp to={2.4} decimals={1} suffix="B+" />, k: 'Events / day capacity' },
                { v: <CountUp to={1} suffix=" line" />, k: 'To install the SDK' },
                { v: <CountUp to={100} suffix="%" />, k: 'Your data, self-hosted' },
              ].map((s, i) => (
                <div key={i} className="bg-white p-7 text-center">
                  <div className="text-[32px] font-semibold iu-gradient-text">{s.pre}{s.v}</div>
                  <div className="text-[13px] text-[var(--color-text-subtle)] mt-1">{s.k}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Bento features ───────── */}
      <section id="features" className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="max-w-2xl mx-auto text-center mb-14">
            <span className="text-[13px] font-semibold tracking-wide uppercase text-[var(--color-brand)]">Everything in one place</span>
            <h2 className="mt-3 text-[36px] sm:text-[46px] font-semibold tracking-tight">The analytics stack, unified</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Stop stitching three tools together. Product analytics, replay and revenue — one platform, one source of truth.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 auto-rows-fr">
            {/* big feature */}
            <Reveal className="md:col-span-2">
              <div className="iu-gborder iu-card-glow h-full rounded-3xl p-8 flex flex-col sm:flex-row gap-8 items-center">
                <div className="flex-1">
                  <span className="grid place-items-center h-12 w-12 rounded-2xl iu-aurora text-white"><BarChart3 className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-[24px] font-semibold">Product analytics that answers, not dashboards to babysit</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-text-muted)]">Events, segmentation, paths, funnels and retention — ask any question about how people use your product and get the answer in milliseconds.</p>
                </div>
                <div className="w-full sm:w-64 flex-shrink-0"><DashboardMockup /></div>
              </div>
            </Reveal>

            {[
              { icon: PlayCircle, title: 'Session replay', desc: 'Watch real sessions like a video — every click, scroll and rage-click, inputs masked.' },
              { icon: DollarSign, title: 'Revenue attribution', desc: 'Tie money to behavior. Revenue by source, AOV, ARPU and LTV — not just clicks.' },
              { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, who churns, and which behaviors predict a loyal customer.' },
              { icon: Filter, title: 'Funnels', desc: 'Exactly where users drop off, step by step — and what to fix to lift conversion.' },
              { icon: Gauge, title: 'Web vitals', desc: 'Core Web Vitals tied to conversion — slow pages quietly kill your funnel.' },
              { icon: Globe, title: 'Geo & web analytics', desc: 'Privacy-first traffic stats and where in the world your users convert.' },
            ].map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="iu-gborder iu-card-glow group h-full rounded-3xl p-7">
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
                <h2 className="mt-4 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight">{s.title}</h2>
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
                <div className="absolute -inset-6 iu-aurora opacity-[0.16] blur-3xl rounded-[2rem]" aria-hidden />
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
            <h2 className="text-[36px] sm:text-[46px] font-semibold tracking-tight">Live in minutes</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">No data team required. Drop in one line and the insights start flowing.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Zap, n: '01', t: 'Install the SDK', d: 'Add one script — autocapture records pageviews, clicks, scroll, sessions and errors automatically.' },
              { icon: MousePointerClick, n: '02', t: 'Ship & track', d: 'Add revenue() at checkout, share smart links on your own domain, and let events stream in.' },
              { icon: BarChart3, n: '03', t: 'Find what grows', d: 'Funnels, retention, revenue-by-source and replays — answers, not dashboards to babysit.' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="relative h-full rounded-3xl iu-gborder iu-card-glow p-7">
                  <span className="absolute top-6 right-6 text-[44px] font-bold text-[var(--color-brand-soft)]">{s.n}</span>
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
            <h2 className="text-[36px] sm:text-[46px] font-semibold tracking-tight">One tool instead of three</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Replace your analytics + replay + attribution stack — and own the data.</p>
          </Reveal>
          <Reveal>
            <div className="overflow-hidden rounded-3xl iu-gborder shadow-[0_30px_70px_-32px_rgba(0,82,242,.3)]">
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

      {/* ───────── Pricing ───────── */}
      <section id="pricing" className="py-24 bg-[#FAFAFC] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center mb-14">
            <h2 className="text-[36px] sm:text-[46px] font-semibold tracking-tight">Simple, honest pricing</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Self-host free, or let us run it. No surprise usage bills.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto items-center">
            {[
              { name: 'Self-hosted', price: 'Free', sub: 'Run it on your own server', cta: 'Get started', highlight: false,
                feats: ['Unlimited events', 'All features', 'Your infrastructure', 'Community support'] },
              { name: 'Cloud', price: '$49', sub: 'per month, flat', cta: 'Start free trial', highlight: true,
                feats: ['Fully managed', 'Session replay included', 'Revenue attribution', 'Email support'] },
              { name: 'Scale', price: 'Custom', sub: 'For high-volume teams', cta: 'Talk to us', highlight: false,
                feats: ['SSO & roles', 'Data warehouse export', 'SLA & priority support', 'Onboarding'] },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <div className={`relative h-full rounded-3xl p-7 ${p.highlight ? 'iu-conic-ring iu-aurora text-white shadow-[0_30px_80px_-24px_rgba(99,102,241,.6)] md:scale-105' : 'iu-gborder'}`}>
                  {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-[var(--color-brand)] text-[12px] font-semibold">Most popular</span>}
                  <div className={`text-[14px] font-medium ${p.highlight ? 'text-white/90' : 'text-[var(--color-text-muted)]'}`}>{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[40px] font-semibold">{p.price}</span>
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

      {/* ───────── Final CTA (dark) ───────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] iu-hero-dark px-8 py-20 sm:px-16 text-center text-white">
              <div className="iu-mesh-blob h-80 w-80 bg-[#0052F2]" style={{ top: '-60px', left: '10%' }} aria-hidden />
              <div className="iu-mesh-blob h-80 w-80 bg-[#8B5CF6]" style={{ bottom: '-80px', right: '10%', animationDelay: '4s' }} aria-hidden />
              <div className="absolute inset-0 iu-noise opacity-50" aria-hidden />
              <div className="relative">
                <h2 className="text-[36px] sm:text-[52px] font-semibold tracking-tight">Start seeing what <span className="iu-gradient-text">drives growth</span></h2>
                <p className="mt-5 text-[18px] text-white/70 max-w-xl mx-auto">Install in minutes. Own your data. Replace three tools with one.</p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                  <a href="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-[#07070D] text-[16px] font-semibold shadow-[0_0_50px_-6px_rgba(99,102,241,.7)] hover:shadow-[0_0_70px_-4px_rgba(99,102,241,1)] transition-shadow">
                    Start free <ArrowRight className="h-4 w-4" />
                  </a>
                  <a href="/login" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl iu-glass text-white text-[16px] font-medium hover:bg-white/10 transition-colors">Log in</a>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-white/55">
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#22D3EE]" /> GDPR-friendly</span>
                  <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4 text-[#22D3EE]" /> Self-hosted</span>
                  <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#22D3EE]" /> Blazing fast</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

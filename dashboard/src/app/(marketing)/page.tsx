import {
  BarChart3, Filter, Repeat, PlayCircle, DollarSign, Gauge,
  ArrowRight, Check, Sparkles, Zap, ShieldCheck, Globe, MousePointerClick, TrendingUp, Users,
} from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { CountUp } from '@/components/marketing/CountUp'
import { DashboardPreview } from '@/components/marketing/DashboardPreview'
import {
  FunnelPreview, RetentionPreview, ReplayPreview, RevenuePreview, SegmentPreview, VitalsPreview,
} from '@/components/marketing/FeaturePreviews'
import { Logo } from '@/components/Logo'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'
import { brand } from '@/config/brand'

const FEATURES = [
  { icon: BarChart3, title: 'Product analytics', desc: 'Events, segmentation and breakdowns — ask anything about how people use your product.', Preview: SegmentPreview },
  { icon: Filter, title: 'Funnels', desc: 'See exactly where users drop off, step by step, and what to fix to lift conversion.', Preview: FunnelPreview },
  { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, who churns, and which behaviors predict a loyal customer.', Preview: RetentionPreview },
  { icon: PlayCircle, title: 'Session replay', desc: 'Watch real sessions like a video — clicks, scrolls and rage-clicks, inputs masked.', Preview: ReplayPreview },
  { icon: DollarSign, title: 'Revenue attribution', desc: 'Tie money to behavior. Revenue by source, AOV, ARPU and LTV — not just clicks.', Preview: RevenuePreview },
  { icon: Gauge, title: 'Web vitals', desc: 'Core Web Vitals tied to conversion — because slow pages quietly kill your funnel.', Preview: VitalsPreview },
]

const SHOWCASE = [
  { tag: 'Funnels', icon: Filter, title: 'Find the leak. Fix the funnel.',
    desc: 'Drop your steps in and watch conversion fall away in real time. Click any stage to see who dropped — then jump straight into their session replay to understand why.',
    points: ['Step-by-step drop-off', 'Time-to-convert windows', 'Breakdown by source & device'] },
  { tag: 'Revenue', icon: DollarSign, title: 'Revenue by source — not just clicks.',
    desc: 'Most tools show traffic. We tie every order to the channel and campaign that drove it, server-side. Know your true ROI per source, AOV and ARPU at a glance.',
    points: ['Source-attributed revenue', 'AOV · ARPU · ARPPU · LTV', 'Stripe & Shopify-ready'] },
]

// Named-competitor comparison. 1 = yes, 2 = soon, 0.5 = partial, 0 = no.
const RIVALS = [
  { name: 'InspectUser', us: true },
  { name: 'Amplitude', domain: 'amplitude.com' },
  { name: 'Mixpanel', domain: 'mixpanel.com' },
  { name: 'PostHog', domain: 'posthog.com' },
  { name: 'Plausible', domain: 'plausible.io' },
]
const MATRIX: [string, number, number, number, number, number][] = [
  ['Product analytics', 1, 1, 1, 1, 0.5],
  ['Session replay', 1, 1, 0, 1, 0],
  ['Revenue attribution', 1, 1, 0.5, 0.5, 0],
  ['Real-time analytics', 1, 1, 1, 1, 1],
  ['Core Web Vitals', 1, 0.5, 0, 1, 0],
  ['Identify users · visitor-level', 1, 1, 1, 1, 0],
  ['GDPR & privacy controls', 1, 1, 0.5, 1, 1],
  ['Smart links on your domain', 1, 0, 0, 0, 0],
  ['Chat with your data', 2, 1, 0, 1, 0],
  ['Public dashboards', 1, 1, 0.5, 1, 1],
  ['Starts at', -1, -1, -1, -1, -1], // price row, rendered specially
]
const PRICES = ['$9/mo', '$49+/mo', '$25+/mo', '$0–pay-as-you-go', '$9/mo']

export default function HomePage() {
  return (
    <>
      <RedirectIfAuthed />
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-20 bg-white">
        <div className="absolute inset-0 iu-grid" aria-hidden />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[420px] w-[820px] iu-blob bg-[#4C85F5] opacity-20" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <Reveal as="div" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-white text-[13px] text-[var(--color-text-muted)] mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand)]" /> Analytics · Replay · Revenue — one platform
          </Reveal>
          <Reveal as="h1" delay={60} className="text-[42px] sm:text-[60px] leading-[1.05] font-semibold tracking-tight text-[var(--color-text)]">
            See exactly what <span className="iu-gradient-text">drives growth.</span>
          </Reveal>
          <Reveal as="p" delay={140} className="mt-5 text-[18px] sm:text-[19px] leading-relaxed text-[var(--color-text-muted)] max-w-2xl mx-auto">
            {brand.name} unifies product analytics, session replay and revenue-by-source attribution in one blazing-fast platform — priced simply by events. Stop guessing. Start growing.
          </Reveal>
          <Reveal as="div" delay={220} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/signup" data-iu-event="Get Started Clicked" data-iu-location="hero" className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium shadow-lg shadow-[rgba(0,82,242,.22)] hover:bg-[var(--color-brand-hover)] transition-colors">
              Start free <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a href="/features" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-border)] bg-white text-[15px] font-medium text-[var(--color-text)] hover:border-[var(--color-brand)] transition-colors">
              Explore features
            </a>
          </Reveal>
          <Reveal as="div" delay={300} className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-subtle)]">
            <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> 1-line install</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#16A34A]" /> GDPR-ready</span>
          </Reveal>
        </div>

        {/* dashboard preview */}
        <Reveal delay={160} className="relative mx-auto max-w-5xl px-5 mt-14">
          <div className="absolute -inset-4 sm:-inset-8 iu-aurora opacity-[0.12] blur-3xl rounded-[2.5rem]" aria-hidden />
          <div className="relative">
            <DashboardPreview />
            <div className="absolute -left-4 sm:-left-8 top-24 hidden sm:block bg-white rounded-2xl border border-[var(--color-border)] shadow-xl px-4 py-3 iu-float">
              <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#16A34A]" /><span className="text-[12px] text-[var(--color-text-subtle)]">Revenue</span></div>
              <div className="text-[18px] font-semibold text-[var(--color-text)]">+18.4%</div>
            </div>
            <div className="absolute -right-3 sm:-right-7 bottom-20 hidden sm:block bg-white rounded-2xl border border-[var(--color-border)] shadow-xl px-4 py-3 iu-float" style={{ animationDelay: '2s' }}>
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[var(--color-brand)]" /><span className="text-[12px] text-[var(--color-text-subtle)]">Live now</span></div>
              <div className="text-[18px] font-semibold text-[var(--color-text)]">1,204</div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────── Stats ───────── */}
      <section className="border-y border-[var(--color-border)] bg-[#FAFBFD]">
        <div className="mx-auto max-w-6xl px-5 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: <><span>&lt;</span><CountUp to={50} suffix="ms" /></>, k: 'Query latency' },
            { v: <CountUp to={2.4} decimals={1} suffix="B+" />, k: 'Events / day capacity' },
            { v: <CountUp to={1} suffix=" line" />, k: 'To install the SDK' },
            { v: <CountUp to={10} suffix="k" />, k: 'Free events / month' },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="text-[30px] sm:text-[34px] font-semibold iu-gradient-text">{s.v}</div>
              <div className="text-[13px] text-[var(--color-text-subtle)] mt-1">{s.k}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Features (each with its own preview) ───────── */}
      <section id="features" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="max-w-2xl mx-auto text-center mb-14">
            <span className="text-[13px] font-semibold tracking-wide uppercase text-[var(--color-brand)]">Everything in one place</span>
            <h2 className="mt-3 text-[34px] sm:text-[44px] font-semibold tracking-tight text-[var(--color-text)]">The analytics stack, unified</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Stop stitching three tools together. Each capability comes with a view built for it.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="group h-full rounded-2xl border border-[var(--color-border)] bg-white p-5 hover:shadow-[0_24px_60px_-28px_rgba(0,82,242,.3)] hover:border-[var(--color-brand-light)] hover:-translate-y-1 transition-all">
                  <f.Preview />
                  <div className="mt-4 flex items-center gap-2.5">
                    <span className="grid place-items-center h-9 w-9 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)] group-hover:iu-aurora group-hover:text-white transition-all">
                      <f.icon className="h-[18px] w-[18px]" />
                    </span>
                    <h3 className="text-[17px] font-semibold text-[var(--color-text)]">{f.title}</h3>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Product showcase ───────── */}
      <section id="products" className="py-12 space-y-24 bg-white">
        {SHOWCASE.map((s, i) => (
          <div key={s.tag} className="mx-auto max-w-7xl px-5">
            <div className={`grid lg:grid-cols-2 gap-12 items-center ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <Reveal>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)] text-[13px] font-medium">
                  <s.icon className="h-3.5 w-3.5" /> {s.tag}
                </span>
                <h2 className="mt-4 text-[30px] sm:text-[38px] font-semibold tracking-tight leading-tight text-[var(--color-text)]">{s.title}</h2>
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
                <div className="absolute -inset-6 iu-aurora opacity-[0.10] blur-3xl rounded-[2rem]" aria-hidden />
                <DashboardPreview className="relative" />
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* ───────── How it works ───────── */}
      <section className="py-24 bg-[#FAFBFD] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-tight text-[var(--color-text)]">Live in minutes</h2>
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
                  <h3 className="mt-4 text-[19px] font-semibold text-[var(--color-text)]">{s.t}</h3>
                  <p className="mt-2 text-[14px] text-[var(--color-text-muted)] leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Comparison vs named competitors ───────── */}
      <section id="compare" className="py-24 bg-white">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal className="text-center mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-tight text-[var(--color-text)]">How {brand.name} compares</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">One platform for what usually takes three — at a fraction of the price.</p>
          </Reveal>
          <Reveal>
            <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] shadow-[0_24px_60px_-32px_rgba(16,24,40,.25)]">
              <table className="w-full min-w-[660px] text-[14px] sm:text-[15px]">
                <thead>
                  <tr className="bg-[#FAFBFD]">
                    <th className="text-left font-medium text-[var(--color-text-muted)] px-5 py-4">Capability</th>
                    {RIVALS.map((r) => (
                      <th key={r.name} className={`px-3 py-4 ${r.us ? 'bg-[var(--color-brand-soft)]' : ''}`}>
                        <div className="flex flex-col items-center gap-1.5">
                          {r.us
                            ? <Logo className="h-7 w-7" />
                            : <img src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=64`} alt={r.name} width={22} height={22} className="h-[22px] w-[22px] rounded" loading="lazy" />}
                          <span className={`text-[12px] font-semibold ${r.us ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-muted)]'}`}>{r.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row) => {
                    const label = row[0] as string
                    const vals = row.slice(1) as number[]
                    const isPrice = label === 'Starts at'
                    return (
                      <tr key={label} className={`border-t border-[var(--color-border)] ${isPrice ? 'bg-[#FAFBFD]' : ''}`}>
                        <td className="px-5 py-3 text-[var(--color-text)] whitespace-nowrap font-medium">{label}</td>
                        {isPrice
                          ? PRICES.map((p, i) => <td key={p + i} className={`px-3 py-3 text-center text-[13px] font-semibold ${i === 0 ? 'text-[var(--color-brand)] bg-[var(--color-brand-soft)]' : 'text-[var(--color-text-muted)]'}`}>{p}</td>)
                          : vals.map((v, i) => (
                            <td key={label + i} className={`px-3 py-3 text-center ${i === 0 ? 'bg-[var(--color-brand-soft)]' : ''}`}>
                              {v === 1 ? <Check className="inline h-5 w-5 text-[#16A34A]" />
                                : v === 2 ? <span className="inline-block text-[10px] font-semibold text-[var(--color-brand)] bg-[var(--color-brand-soft)] px-2 py-0.5 rounded-full">Soon</span>
                                : v === 0.5 ? <span className="text-[#F59E0B] text-[16px] font-bold leading-none" title="Partial / add-on">~</span>
                                : <span className="text-[var(--color-text-subtle)]">—</span>}
                            </td>
                          ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-center text-[12px] text-[var(--color-text-subtle)] mt-3">✓ included · Soon = on the roadmap · ~ partial or paid add-on · — not offered. Competitor capabilities as of 2026; logos belong to their owners.</p>
          </Reveal>
        </div>
      </section>

      {/* ───────── Pricing ───────── */}
      <section id="pricing" className="py-24 bg-[#FAFBFD] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="text-center mb-14">
            <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-tight text-[var(--color-text)]">Simple, honest pricing</h2>
            <p className="mt-4 text-[17px] text-[var(--color-text-muted)]">Priced by events — start free, scale as you grow. No surprise bills.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto items-center">
            {[
              { name: 'Free', price: 'Free', sub: '10k events / month', cta: 'Start free', highlight: false, feats: ['Core analytics & funnels', 'Real-time + Web Vitals', '1 project', 'Community support'] },
              { name: 'Starter', price: '$9', sub: '100k events / month', cta: 'Start free', highlight: true, feats: ['Everything in Free', 'Session replay', 'Revenue attribution', 'Smart links', 'Email support'] },
              { name: 'Growth', price: '$29', sub: '1M events / month', cta: 'Start free', highlight: false, feats: ['Everything in Starter', 'Unlimited projects', 'Team roles', 'Priority support'] },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <div className={`relative h-full rounded-2xl p-7 border ${p.highlight ? 'border-[var(--color-brand)] bg-white shadow-[0_30px_70px_-26px_rgba(0,82,242,.4)] md:scale-105' : 'border-[var(--color-border)] bg-white'}`}>
                  {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full iu-aurora text-white text-[12px] font-semibold">Most popular</span>}
                  <div className="text-[14px] font-medium text-[var(--color-text-muted)]">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[40px] font-semibold text-[var(--color-text)]">{p.price}</span>
                    {p.price !== 'Custom' && p.price !== 'Free' && <span className="text-[14px] text-[var(--color-text-subtle)]">/mo</span>}
                  </div>
                  <div className="text-[13px] text-[var(--color-text-subtle)]">{p.sub}</div>
                  <a href="/signup" className={`mt-5 block text-center px-4 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${p.highlight ? 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-brand)]'}`}>{p.cta}</a>
                  <ul className="mt-6 space-y-2.5">
                    {p.feats.map((f) => <li key={f} className="flex items-center gap-2 text-[14px] text-[var(--color-text)]"><Check className="h-4 w-4 text-[#16A34A]" /> {f}</li>)}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-gradient-to-br from-white to-[#F2F6FE] px-8 py-16 sm:px-16 text-center">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-[700px] iu-blob bg-[#4C85F5] opacity-20" aria-hidden />
              <div className="relative">
                <h2 className="text-[34px] sm:text-[48px] font-semibold tracking-tight text-[var(--color-text)]">Start seeing what <span className="iu-gradient-text">drives growth</span></h2>
                <p className="mt-4 text-[18px] text-[var(--color-text-muted)] max-w-xl mx-auto">Install in minutes. Priced by events. Replace three tools with one.</p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <a href="/signup" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[var(--color-brand)] text-white text-[16px] font-semibold hover:bg-[var(--color-brand-hover)] transition-colors shadow-lg shadow-[rgba(0,82,242,.25)]">Start free <ArrowRight className="h-4 w-4" /></a>
                  <a href="/login" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text)] text-[16px] font-medium hover:border-[var(--color-brand)] transition-colors">Log in</a>
                </div>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-subtle)]">
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#16A34A]" /> GDPR-friendly</span>
                  <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4 text-[#16A34A]" /> Real-time</span>
                  <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-[#16A34A]" /> Blazing fast</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

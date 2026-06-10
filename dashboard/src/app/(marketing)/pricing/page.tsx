import type { Metadata } from 'next'
import { Check, ArrowRight } from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { PageHero } from '@/components/marketing/PageHero'

export const metadata: Metadata = { title: 'Pricing', description: 'Priced simply by events. Start free, scale as you grow — no per-seat fees, no surprise overage bills.' }

const PLANS = [
  { name: 'Free', price: '$0', per: '', sub: '10k events / month', cta: 'Start free', highlight: false,
    feats: ['Core analytics & funnels', 'Real-time + Web Vitals', '1 project', 'Community support'] },
  { name: 'Starter', price: '$9', per: '/mo', sub: '100k events / month', cta: 'Start free', highlight: true,
    feats: ['Everything in Free', 'Session replay', 'Revenue attribution', 'Smart links', 'Email support'] },
  { name: 'Growth', price: '$29', per: '/mo', sub: '1M events / month', cta: 'Start free', highlight: false,
    feats: ['Everything in Starter', 'Unlimited projects', 'Team roles & invites', 'Priority support'] },
  { name: 'Scale', price: 'Custom', per: '', sub: '10M+ events / month', cta: 'Talk to us', highlight: false,
    feats: ['Everything in Growth', 'SSO & RBAC', 'Warehouse export', 'SLA · audit logs · onboarding'] },
]
const FAQ = [
  ['How does event-based pricing work?', 'You pay for the volume of events you send each month — not per seat. Start free at 10k events; upgrade only as you grow.'],
  ['What counts as an event?', 'Any tracked action: a pageview, click, custom event or a revenue event. Session-replay snapshots don’t count toward your event total.'],
  ['What if I go over my limit?', 'We never drop your data. We’ll let you know you’re close and you can upgrade — no surprise overage charges.'],
  ['Is session replay included?', 'Yes, from the Starter plan and up — it’s built into the SDK, not a separate add-on.'],
  ['Can I export my data?', 'Always. Export to your warehouse anytime; it’s your data.'],
]

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Priced by events. Nothing hidden." subtitle="Start free, scale as you grow. No per-seat fees, no surprise overage bills." />
      <section className="pb-20 bg-white">
        <div className="mx-auto max-w-6xl px-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 80}>
              <div className={`relative h-full rounded-2xl p-6 border ${p.highlight ? 'border-[var(--color-brand)] bg-white shadow-[0_30px_70px_-26px_rgba(0,82,242,.4)]' : 'border-[var(--color-border)] bg-white'}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full iu-aurora text-white text-[12px] font-semibold whitespace-nowrap">Most popular</span>}
                <div className="text-[14px] font-medium text-[var(--color-text-muted)]">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-[34px] font-semibold text-[var(--color-text)]">{p.price}</span>
                  {p.per && <span className="text-[14px] text-[var(--color-text-subtle)]">{p.per}</span>}
                </div>
                <div className="text-[13px] text-[var(--color-text-subtle)]">{p.sub}</div>
                <a href="/signup" className={`mt-5 block text-center px-4 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${p.highlight ? 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-brand)]'}`}>{p.cta}</a>
                <ul className="mt-5 space-y-2">
                  {p.feats.map((f) => <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--color-text)]"><Check className="h-4 w-4 text-[#16A34A] mt-0.5 flex-shrink-0" /> {f}</li>)}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-center text-[13px] text-[var(--color-text-subtle)] mt-6">All plans include unlimited team members on paid tiers and full data export.</p>
      </section>
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-[24px] font-semibold text-[var(--color-text)] text-center mb-8">Frequently asked</h2>
          <div className="space-y-3">
            {FAQ.map(([q, a]) => (
              <Reveal key={q}>
                <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
                  <h3 className="text-[15px] font-semibold text-[var(--color-text)]">{q}</h3>
                  <p className="mt-1.5 text-[14px] text-[var(--color-text-muted)] leading-relaxed">{a}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="text-center mt-10">
            <a href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors">Start free <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>
    </>
  )
}

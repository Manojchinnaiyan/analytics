import type { Metadata } from 'next'
import { Check, ArrowRight } from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { PageHero } from '@/components/marketing/PageHero'

export const metadata: Metadata = { title: 'Pricing', description: 'Self-host free, or let us run it. Simple flat pricing, no surprise usage bills.' }

const PLANS = [
  { name: 'Self-hosted', price: 'Free', sub: 'Run it on your own server', cta: 'Get started', highlight: false, feats: ['Unlimited events', 'All features', 'Session replay', 'Your infrastructure', 'Community support'] },
  { name: 'Cloud', price: '$49', sub: 'per month, flat', cta: 'Start free trial', highlight: true, feats: ['Fully managed', 'Session replay included', 'Revenue attribution', 'Smart links', 'Email support'] },
  { name: 'Scale', price: 'Custom', sub: 'For high-volume teams', cta: 'Talk to us', highlight: false, feats: ['SSO & roles', 'Warehouse export', 'SLA & priority support', 'Dedicated onboarding', 'Audit logs'] },
]
const FAQ = [
  ['Is it really free self-hosted?', 'Yes. Run the full platform on your own server with every feature and no event caps. You only pay if you want us to host and manage it for you.'],
  ['Do you bill per event?', 'No surprise usage bills. Cloud is a flat monthly price; self-hosted is free regardless of volume.'],
  ['Can I move my data out?', 'Always. It is your data — export to your warehouse anytime, or just keep it on your own infrastructure.'],
  ['Is session replay included?', 'Yes, on every plan — it is built into the SDK, not a separate add-on.'],
]

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple, honest pricing" subtitle="Self-host free, or let us run it. No surprise usage bills." />
      <section className="pb-20 bg-white">
        <div className="mx-auto max-w-5xl px-5 grid md:grid-cols-3 gap-5 items-center">
          {PLANS.map((p, i) => (
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

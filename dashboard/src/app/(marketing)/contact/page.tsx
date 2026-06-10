import type { Metadata } from 'next'
import { Mail, MessageSquare, Building2 } from 'lucide-react'
import { PageHero } from '@/components/marketing/PageHero'
import { Reveal } from '@/components/marketing/Reveal'

export const metadata: Metadata = { title: 'Contact', description: 'Talk to the team.' }

const inputCls = 'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the team" subtitle="Questions, demos, or enterprise needs — we’re happy to help." />
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-5xl px-5 grid md:grid-cols-2 gap-10">
          <Reveal>
            <div className="space-y-4">
              {[[Mail, 'Email', 'hello@inspectuser.com'], [MessageSquare, 'Support', 'Get help in-app from any dashboard'], [Building2, 'Enterprise', 'SSO, SLAs and onboarding for larger teams']].map(([Icon, t, d]) => {
                const I = Icon as React.ElementType
                return (
                  <div key={t as string} className="flex gap-3 rounded-xl border border-[var(--color-border)] p-4">
                    <span className="grid place-items-center h-10 w-10 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><I className="h-5 w-5" /></span>
                    <div><div className="text-[15px] font-semibold text-[var(--color-text)]">{t as string}</div><div className="text-[14px] text-[var(--color-text-muted)]">{d as string}</div></div>
                  </div>
                )
              })}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <form className="rounded-2xl border border-[var(--color-border)] p-6 space-y-4" action="mailto:hello@inspectuser.com" method="post">
              <div><label className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Name</label><input className={inputCls} placeholder="Your name" required /></div>
              <div><label className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Email</label><input type="email" className={inputCls} placeholder="you@company.com" required /></div>
              <div><label className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Message</label><textarea className={`${inputCls} min-h-28`} placeholder="How can we help?" required /></div>
              <button className="w-full py-2.5 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors">Send message</button>
            </form>
          </Reveal>
        </div>
      </section>
    </>
  )
}

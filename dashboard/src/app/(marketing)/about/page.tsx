import type { Metadata } from 'next'
import { Reveal } from '@/components/marketing/Reveal'
import { PageHero } from '@/components/marketing/PageHero'
import { brand } from '@/config/brand'

export const metadata: Metadata = { title: 'About', description: `Why we built ${brand.name}.` }

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="Own your analytics" subtitle={`${brand.name} exists so teams can understand their product and revenue without renting their data to three different vendors.`} />
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-3xl px-5 space-y-6 text-[16px] leading-relaxed text-[var(--color-text-muted)]">
          <p>Most teams stitch together a product-analytics tool, a session-replay tool and an attribution tool — three bills, three SDKs, and data siloed across all of them. We thought that was backwards.</p>
          <p><b className="text-[var(--color-text)] font-medium">{brand.name}</b> unifies analytics, replay and revenue-by-source attribution into a single, fast, privacy-first platform. Your costs stay flat, and your team gets one source of truth.</p>
          <div className="grid sm:grid-cols-3 gap-4 pt-4">
            {[['Privacy-first', 'Inputs masked, GDPR-friendly, your data on your servers.'], ['Blazing fast', 'Sub-50ms queries on a columnar engine built for events.'], ['Open by default', 'Export to your warehouse anytime — no lock-in.']].map(([t, d]) => (
              <Reveal key={t}><div className="rounded-xl border border-[var(--color-border)] p-5"><h3 className="text-[15px] font-semibold text-[var(--color-text)]">{t}</h3><p className="mt-1.5 text-[14px]">{d}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

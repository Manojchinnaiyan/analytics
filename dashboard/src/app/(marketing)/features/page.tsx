import type { Metadata } from 'next'
import { BarChart3, Filter, Repeat, PlayCircle, DollarSign, Gauge, ArrowRight, Check } from 'lucide-react'
import { Reveal } from '@/components/marketing/Reveal'
import { PageHero } from '@/components/marketing/PageHero'
import { FunnelPreview, RetentionPreview, ReplayPreview, RevenuePreview, SegmentPreview, VitalsPreview } from '@/components/marketing/FeaturePreviews'

export const metadata: Metadata = { title: 'Features', description: 'Product analytics, funnels, retention, session replay, revenue attribution and web vitals — one platform.' }

const FEATURES = [
  { icon: BarChart3, title: 'Product analytics', desc: 'Events, segmentation, paths and breakdowns. Ask any question about how people use your product and get the answer in milliseconds.', Preview: SegmentPreview },
  { icon: Filter, title: 'Funnels', desc: 'See exactly where users drop off step by step, with time-to-convert windows and breakdowns by source and device.', Preview: FunnelPreview },
  { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, who churns, and which behaviors predict a loyal, paying customer — visualized as cohort heatmaps.', Preview: RetentionPreview },
  { icon: PlayCircle, title: 'Session replay', desc: 'Watch real sessions like a video. Rage-clicks, dead-clicks and JS errors surface automatically, inputs masked for privacy.', Preview: ReplayPreview },
  { icon: DollarSign, title: 'Revenue attribution', desc: 'Tie money to behavior. Revenue by source, AOV, ARPU, ARPPU and LTV — server-side, so it is accurate.', Preview: RevenuePreview },
  { icon: Gauge, title: 'Web vitals', desc: 'Core Web Vitals tied to conversion, so you can see how performance affects your funnel.', Preview: VitalsPreview },
]

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="Everything you need to understand growth" subtitle="Product analytics, session replay and revenue attribution — unified, fast and self-hosted." />
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-7xl px-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-2xl border border-[var(--color-border)] bg-white p-5 hover:shadow-[0_24px_60px_-28px_rgba(0,82,242,.3)] hover:border-[var(--color-brand-light)] hover:-translate-y-1 transition-all">
                <f.Preview />
                <div className="mt-4 flex items-center gap-2.5">
                  <span className="grid place-items-center h-9 w-9 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)] group-hover:iu-aurora group-hover:text-white transition-all"><f.icon className="h-[18px] w-[18px]" /></span>
                  <h3 className="text-[17px] font-semibold text-[var(--color-text)]">{f.title}</h3>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="text-center mt-14">
          <a href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors">Start free <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>
    </>
  )
}

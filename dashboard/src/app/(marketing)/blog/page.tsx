import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { PageHero } from '@/components/marketing/PageHero'
import { Reveal } from '@/components/marketing/Reveal'

export const metadata: Metadata = { title: 'Blog', description: 'Product analytics, attribution and growth — guides and updates.' }

const POSTS = [
  { tag: 'Guide', title: 'Revenue attribution: stop counting clicks, start counting dollars', date: 'Coming soon', read: '6 min' },
  { tag: 'Playbook', title: 'The 4 funnel leaks killing e-commerce conversion', date: 'Coming soon', read: '5 min' },
  { tag: 'Engineering', title: 'How we run sub-50ms analytics queries on a single box', date: 'Coming soon', read: '8 min' },
  { tag: 'Privacy', title: 'Session replay without leaking PII — how masking works', date: 'Coming soon', read: '4 min' },
]

export default function BlogPage() {
  return (
    <>
      <PageHero eyebrow="Blog" title="Guides on growth, analytics & attribution" subtitle="Deep dives and playbooks. New posts landing soon." />
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-4xl px-5 grid sm:grid-cols-2 gap-5">
          {POSTS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 90}>
              <div className="group h-full rounded-2xl border border-[var(--color-border)] bg-white p-6 hover:shadow-[0_24px_60px_-28px_rgba(0,82,242,.3)] hover:-translate-y-1 transition-all">
                <span className="inline-block text-[12px] font-medium px-2.5 py-1 rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">{p.tag}</span>
                <h3 className="mt-3 text-[18px] font-semibold text-[var(--color-text)] leading-snug">{p.title}</h3>
                <div className="mt-4 flex items-center justify-between text-[13px] text-[var(--color-text-subtle)]">
                  <span>{p.date} · {p.read}</span>
                  <ArrowRight className="h-4 w-4 text-[var(--color-brand)] group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}

import { Reveal } from './Reveal'

export function PageHero({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <section className="relative overflow-hidden pt-36 pb-14 bg-white text-center">
      <div className="absolute inset-0 iu-grid" aria-hidden />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-72 w-[680px] iu-blob bg-[#4C85F5] opacity-20" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5">
        {eyebrow && <Reveal as="div" className="text-[13px] font-semibold tracking-wide uppercase text-[var(--color-brand)] mb-3">{eyebrow}</Reveal>}
        <Reveal as="h1" delay={50} className="text-[38px] sm:text-[52px] leading-[1.06] font-semibold tracking-tight text-[var(--color-text)]">{title}</Reveal>
        {subtitle && <Reveal as="p" delay={120} className="mt-5 text-[18px] text-[var(--color-text-muted)] max-w-2xl mx-auto">{subtitle}</Reveal>}
      </div>
    </section>
  )
}

/** Simple prose/legal page shell. */
export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <>
      <PageHero title={title} subtitle={updated ? `Last updated ${updated}` : undefined} />
      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-3xl px-5 space-y-6 text-[15px] leading-relaxed text-[var(--color-text-muted)]">{children}</div>
      </section>
    </>
  )
}

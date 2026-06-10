'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3, Filter, Repeat, PlayCircle, DollarSign, Link2, MapPin, Gauge,
  ChevronDown, Menu, X,
} from 'lucide-react'
import { brand } from '@/config/brand'

const FEATURES = [
  { icon: BarChart3, title: 'Product analytics', desc: 'Events, segmentation, paths', href: '/features' },
  { icon: Filter, title: 'Funnels', desc: 'Find where users drop off', href: '/features' },
  { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, and why', href: '/features' },
  { icon: PlayCircle, title: 'Session replay', desc: 'Watch real user sessions', href: '/features' },
  { icon: DollarSign, title: 'Revenue attribution', desc: 'Money tied to behavior', href: '/features' },
  { icon: Gauge, title: 'Web vitals', desc: 'Performance that converts', href: '/features' },
]
const PRODUCTS = [
  { icon: Link2, title: 'Smart Links', desc: 'Branded links on your domain', href: '/#products' },
  { icon: MapPin, title: 'GeoIP insights', desc: 'Where your users are', href: '/#products' },
  { icon: BarChart3, title: 'Web Analytics', desc: 'Privacy-first traffic stats', href: '/#products' },
  { icon: DollarSign, title: 'E-commerce', desc: 'Shopify-ready analytics', href: '/#products' },
]

function Dropdown({ label, items }: { label: string; items: typeof FEATURES }) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-1 px-3 py-2 text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
        {label} <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
      </button>
      {/* anchored left so it never overflows the viewport */}
      <div className="absolute left-0 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200">
        <div className="w-[420px] max-w-[calc(100vw-2rem)] grid grid-cols-2 gap-1 p-2 rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_24px_60px_-18px_rgba(16,24,40,.28)]">
          {items.map((it) => (
            <a key={it.title} href={it.href} className="flex gap-2.5 p-2.5 rounded-xl hover:bg-[var(--color-brand-soft)] transition-colors">
              <span className="flex-shrink-0 grid place-items-center h-9 w-9 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><it.icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[var(--color-text)] truncate">{it.title}</span>
                <span className="block text-[12px] text-[var(--color-text-subtle)] truncate">{it.desc}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed top-3 sm:top-4 inset-x-0 z-50 px-3">
      <nav className={`mx-auto max-w-5xl flex items-center justify-between rounded-full border px-3 sm:px-4 h-14 transition-all duration-300
        ${scrolled
          ? 'border-[var(--color-border)] bg-white/80 backdrop-blur-xl shadow-[0_10px_40px_-12px_rgba(16,24,40,.25)]'
          : 'border-white/70 bg-white/60 backdrop-blur-xl shadow-[0_8px_30px_-12px_rgba(16,24,40,.18)]'}`}>
        <a href="/" className="flex items-center gap-2 pl-1">
          <span className="grid place-items-center h-8 w-8 rounded-lg iu-aurora text-white font-bold">i</span>
          <span className="text-[17px] font-semibold text-[var(--color-text)]">{brand.name}</span>
        </a>

        <div className="hidden lg:flex items-center gap-0.5">
          <Dropdown label="Features" items={FEATURES} />
          <Dropdown label="Products" items={PRODUCTS} />
          <a href="/pricing" className="px-3 py-2 text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Pricing</a>
          <a href="/#compare" className="px-3 py-2 text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Why us</a>
        </div>

        <div className="hidden lg:flex items-center gap-1.5">
          <a href="/login" className="px-3.5 py-2 text-[14px] font-medium text-[var(--color-text)] hover:text-[var(--color-brand)] transition-colors">Log in</a>
          <a href="/signup" className="px-4 py-2 text-[14px] font-medium rounded-full bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors shadow-sm">Start free</a>
        </div>

        <button onClick={() => setOpen(v => !v)} className="lg:hidden grid place-items-center h-9 w-9 rounded-full text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* mobile floating glass panel */}
      {open && (
        <div className="lg:hidden mx-auto max-w-5xl mt-2 rounded-3xl border border-[var(--color-border)] bg-white/90 backdrop-blur-xl shadow-[0_24px_60px_-18px_rgba(16,24,40,.3)] p-3">
          <div className="grid grid-cols-2 gap-1">
            {[...FEATURES.slice(0, 4), ...PRODUCTS.slice(0, 2)].map((it) => (
              <a key={it.title} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-[var(--color-surface-muted)]">
                <it.icon className="h-[18px] w-[18px] text-[var(--color-brand)] flex-shrink-0" />
                <span className="text-[14px] text-[var(--color-text)] truncate">{it.title}</span>
              </a>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <a href="/pricing" onClick={() => setOpen(false)} className="flex-1 text-center px-3 py-2 rounded-xl text-[14px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">Pricing</a>
            <a href="/login" onClick={() => setOpen(false)} className="flex-1 text-center px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-[14px] font-medium">Log in</a>
            <a href="/signup" onClick={() => setOpen(false)} className="flex-1 text-center px-3 py-2.5 rounded-xl bg-[var(--color-brand)] text-white text-[14px] font-medium">Start free</a>
          </div>
        </div>
      )}
    </header>
  )
}

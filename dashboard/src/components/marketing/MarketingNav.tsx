'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3, Filter, Repeat, PlayCircle, DollarSign, Link2, MapPin, Gauge,
  ChevronDown, Menu, X,
} from 'lucide-react'
import { brand } from '@/config/brand'

const FEATURES = [
  { icon: BarChart3, title: 'Product analytics', desc: 'Events, segmentation, paths', href: '/#features' },
  { icon: Filter, title: 'Funnels', desc: 'Find where users drop off', href: '/#features' },
  { icon: Repeat, title: 'Retention & cohorts', desc: 'Who comes back, and why', href: '/#features' },
  { icon: PlayCircle, title: 'Session replay', desc: 'Watch real user sessions', href: '/#features' },
  { icon: DollarSign, title: 'Revenue attribution', desc: 'Money tied to behavior', href: '/#features' },
  { icon: Gauge, title: 'Web vitals', desc: 'Performance that converts', href: '/#features' },
]
const PRODUCTS = [
  { icon: Link2, title: 'Smart Links', desc: 'Branded links on your domain', href: '/#products' },
  { icon: MapPin, title: 'GeoIP insights', desc: 'Where your users are', href: '/#products' },
  { icon: BarChart3, title: 'Web Analytics', desc: 'Privacy-first traffic stats', href: '/#products' },
  { icon: DollarSign, title: 'E-commerce', desc: 'Shopify-ready revenue analytics', href: '/#products' },
]

function Dropdown({ label, items }: { label: string; items: typeof FEATURES }) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-1 px-3 py-2 text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
        {label} <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
      </button>
      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200">
        <div className="w-[460px] grid grid-cols-2 gap-1 p-2 rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_24px_60px_-18px_rgba(16,24,40,.22)]">
          {items.map((it) => (
            <a key={it.title} href={it.href} className="flex gap-3 p-3 rounded-xl hover:bg-[var(--color-brand-soft)] transition-colors">
              <span className="flex-shrink-0 grid place-items-center h-9 w-9 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <it.icon className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-[14px] font-medium text-[var(--color-text)]">{it.title}</span>
                <span className="block text-[12px] text-[var(--color-text-subtle)]">{it.desc}</span>
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
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? 'bg-white/80 backdrop-blur-xl border-b border-[var(--color-border)]' : 'bg-transparent'}`}>
      <nav className="mx-auto max-w-7xl px-5 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <span className="grid place-items-center h-8 w-8 rounded-lg iu-aurora text-white font-bold">i</span>
          <span className="text-[18px] font-semibold text-[var(--color-text)]">{brand.name}</span>
        </a>

        <div className="hidden lg:flex items-center gap-1">
          <Dropdown label="Features" items={FEATURES} />
          <Dropdown label="Products" items={PRODUCTS} />
          <a href="/#pricing" className="px-3 py-2 text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Pricing</a>
          <a href="/#compare" className="px-3 py-2 text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Why us</a>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <a href="/login" className="px-4 py-2 text-[15px] font-medium text-[var(--color-text)] hover:text-[var(--color-brand)] transition-colors">Log in</a>
          <a href="/signup" className="px-4 py-2 text-[15px] font-medium text-white rounded-lg bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] transition-colors shadow-sm">Start free</a>
        </div>

        <button onClick={() => setOpen(v => !v)} className="lg:hidden grid place-items-center h-10 w-10 rounded-lg text-[var(--color-text)]" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="lg:hidden border-t border-[var(--color-border)] bg-white px-5 py-4 space-y-1">
          {[...FEATURES, ...PRODUCTS].slice(0, 8).map((it) => (
            <a key={it.title} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--color-surface-muted)]">
              <it.icon className="h-[18px] w-[18px] text-[var(--color-brand)]" />
              <span className="text-[15px] text-[var(--color-text)]">{it.title}</span>
            </a>
          ))}
          <div className="flex gap-2 pt-3">
            <a href="/login" className="flex-1 text-center px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-[15px] font-medium">Log in</a>
            <a href="/signup" className="flex-1 text-center px-4 py-2.5 rounded-lg bg-[var(--color-brand)] text-white text-[15px] font-medium">Start free</a>
          </div>
        </div>
      )}
    </header>
  )
}

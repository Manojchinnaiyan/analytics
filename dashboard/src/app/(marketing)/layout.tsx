import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { Logo } from '@/components/Logo'
import { brand } from '@/config/brand'

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inspectuser.com'
const TITLE = `${brand.name} — Product analytics, session replay & revenue attribution`
const DESC =
  'One platform for product analytics, funnels, retention, session replay and revenue-by-source attribution. Privacy-first and blazing fast. See exactly what drives growth.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: `%s — ${brand.name}` },
  description: DESC,
  keywords: [
    'product analytics', 'session replay', 'funnel analysis', 'retention',
    'revenue attribution', 'web analytics', 'self-hosted analytics', 'Amplitude alternative',
    'Mixpanel alternative', 'shopify analytics', brand.name,
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', url: SITE, siteName: brand.name, title: TITLE, description: DESC,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
  robots: { index: true, follow: true },
}

const FOOTER = {
  Product: [['Features', '/features'], ['Pricing', '/pricing'], ['Why us', '/#compare'], ['Sign up', '/signup']],
  Solutions: [['E-commerce', '/features'], ['SaaS', '/features'], ['Marketing', '/features'], ['Session replay', '/features']],
  Company: [['About', '/about'], ['Blog', '/blog'], ['Contact', '/contact'], ['Log in', '/login']],
  Legal: [['Privacy', '/privacy'], ['Terms', '/terms'], ['Security', '/security'], ['GDPR', '/privacy']],
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESC,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }
  return (
    <div className="bg-white text-[var(--color-text)] antialiased overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav />
      <main>{children}</main>

      <footer className="border-t border-[var(--color-border)] bg-[#FAFAFC]">
        <div className="mx-auto max-w-7xl px-5 py-14 grid grid-cols-2 md:grid-cols-6 gap-8">
          <div className="col-span-2">
            <a href="/" className="flex items-center mb-3" aria-label={brand.name}>
              <Logo className="h-9 w-9" />
            </a>
            <p className="text-[14px] text-[var(--color-text-subtle)] max-w-xs">{brand.tagline}</p>
          </div>
          {Object.entries(FOOTER).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-[13px] font-semibold text-[var(--color-text)] mb-3">{group}</h4>
              <ul className="space-y-2">
                {links.map(([label, href]) => (
                  <li key={label}><a href={href} className="text-[14px] text-[var(--color-text-subtle)] hover:text-[var(--color-brand)] transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-7xl px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[13px] text-[var(--color-text-subtle)]">
            <span>© {brand.name}. All-in-one product analytics.</span>
            <span>Analytics · replay · revenue — priced by events.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

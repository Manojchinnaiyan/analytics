import type { Metadata } from 'next'
import { ProsePage } from '@/components/marketing/PageHero'
import { brand } from '@/config/brand'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy Policy" updated="June 2026">
      <p>{brand.name} is built privacy-first. When self-hosted, your event data never leaves your infrastructure. This policy explains what we collect for the managed Cloud service.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">What we collect</h2>
      <p>Account details you provide (name, email, organization) and the product-analytics events your application sends. Session replay masks all input values by default; you control what is captured.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">How we use it</h2>
      <p>Only to provide the service: storing, querying and displaying your analytics. We never sell your data or use it to train shared models.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Your rights</h2>
      <p>Export or delete your data at any time. For GDPR/CCPA requests, contact <a className="text-[var(--color-brand)]" href="/contact">our team</a>.</p>
      <p className="text-[13px] text-[var(--color-text-subtle)]">This template is provided for convenience and is not legal advice.</p>
    </ProsePage>
  )
}

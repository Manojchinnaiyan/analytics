import type { Metadata } from 'next'
import { ProsePage } from '@/components/marketing/PageHero'
import { brand } from '@/config/brand'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <ProsePage title="Terms of Service" updated="June 2026">
      <p>By using {brand.name} you agree to these terms. The self-hosted edition is provided as-is; the managed Cloud service is governed by the agreement below.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Use of the service</h2>
      <p>You’re responsible for the data you send and for complying with applicable privacy laws when collecting analytics from your users.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Accounts</h2>
      <p>Keep your credentials secure. You’re responsible for activity under your account and organization.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Availability</h2>
      <p>We aim for high availability on Cloud; enterprise plans include an SLA. Self-hosted availability is your responsibility.</p>
      <p className="text-[13px] text-[var(--color-text-subtle)]">This template is provided for convenience and is not legal advice.</p>
    </ProsePage>
  )
}

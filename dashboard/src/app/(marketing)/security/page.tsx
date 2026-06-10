import type { Metadata } from 'next'
import { ProsePage } from '@/components/marketing/PageHero'

export const metadata: Metadata = { title: 'Security' }

export default function SecurityPage() {
  return (
    <ProsePage title="Security" updated="June 2026">
      <p>Security is foundational, not a feature. Here’s how we protect your data.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Data ownership</h2>
      <p>Self-host and your data never leaves your servers. On Cloud, data is encrypted in transit (TLS) and at rest, isolated per organization.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">PII protection</h2>
      <p>Session replay masks all input values by default. You can redact any element with a CSS class, and the SDK respects opt-out and Do-Not-Track.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Access control</h2>
      <p>JWT-authenticated dashboard, scoped API keys for ingestion, role-based access and SSO on enterprise plans, plus audit logs.</p>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Infrastructure</h2>
      <p>Data stores are never exposed publicly; ingestion is rate-limited and bot-filtered, and the origin sits behind a hardened edge.</p>
    </ProsePage>
  )
}

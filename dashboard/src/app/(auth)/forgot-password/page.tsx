'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { authApi } from '@/lib/auth'
import { AuthShell } from '@/components/marketing/AuthShell'

const inputCls =
  'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch {
      /* always show the same confirmation — never reveal whether the email exists */
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-text)]">Reset your password</h1>
      <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      {sent ? (
        <div className="mt-8 space-y-5">
          <p className="text-[15px] text-[var(--color-text)] bg-[var(--color-brand-soft)] px-4 py-3 rounded-xl">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way. Check your inbox (and spam).
          </p>
          <a href="/login" className="block text-center text-[14px] font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">← Back to sign in</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Email</label>
            <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
          </div>
          <button type="submit" disabled={loading} className="group w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
            {loading ? 'Sending…' : <>Send reset link <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>}
          </button>
          <a href="/login" className="block text-center text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)]">← Back to sign in</a>
        </form>
      )}
    </AuthShell>
  )
}

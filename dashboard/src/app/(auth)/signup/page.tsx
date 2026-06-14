'use client'

import { useState } from 'react'
import { ArrowRight, MailCheck } from 'lucide-react'
import { track } from '@/lib/inspectuser.mjs'
import { authApi } from '@/lib/auth'
import { AuthShell } from '@/components/marketing/AuthShell'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'

const FIELDS = [
  { label: 'Full name',    field: 'name',     type: 'text',     placeholder: 'Manoj Chinnaiyan' },
  { label: 'Email',        field: 'email',    type: 'email',    placeholder: 'you@company.com' },
  { label: 'Password',     field: 'password', type: 'password', placeholder: '••••••••' },
  { label: 'Company name', field: 'org_name', type: 'text',     placeholder: 'Acme Inc' },
  { label: 'Company slug', field: 'org_slug', type: 'text',     placeholder: 'acme' },
] as const

type FormState = { name: string; email: string; password: string; org_name: string; org_slug: string }

const inputCls =
  'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function SignupPage() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', org_name: '', org_slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resent, setResent] = useState(false)

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.signup(form)
      track('Signed Up', { org: form.org_name })
      // No session yet — the user must verify their email first.
      setSent(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to create account')
    }
    setLoading(false)
  }

  async function resend() {
    try { await authApi.resendVerification(form.email) } catch { /* generic */ }
    setResent(true)
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-brand-soft)]">
          <MailCheck className="h-7 w-7 text-[var(--color-brand)]" />
        </div>
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--color-text)]">Verify your email</h1>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)] leading-relaxed">
          We sent a verification link to <strong className="text-[var(--color-text)]">{form.email}</strong>. Click it to activate your account and open your dashboard.
        </p>
        <div className="mt-7 space-y-3">
          <p className="text-[14px] text-[var(--color-text-subtle)]">Didn&apos;t get it? Check spam, or resend below.</p>
          <button onClick={resend} disabled={resent} className="w-full py-2.5 border border-[var(--color-border)] rounded-xl text-[15px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50 transition-colors">
            {resent ? 'Verification email re-sent ✓' : 'Resend verification email'}
          </button>
          <a href="/login" className="block text-center text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)]">← Back to sign in</a>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <RedirectIfAuthed />
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-text)]">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">Free to start — no credit card.</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        {FIELDS.map(({ label, field, type, placeholder }) => (
          <div key={field}>
            <label htmlFor={field} className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">{label}</label>
            <input id={field} type={type} required value={form[field]} onChange={set(field)} className={inputCls} placeholder={placeholder} />
          </div>
        ))}
        {error && <p className="text-[14px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button type="submit" disabled={loading} className="group w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2 mt-1">
          {loading ? 'Creating account…' : <>Create account <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-[var(--color-text-muted)]">
        Already have an account? <a href="/login" className="font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Sign in</a>
      </p>
    </AuthShell>
  )
}

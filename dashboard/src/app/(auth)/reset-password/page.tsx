'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { authApi } from '@/lib/auth'
import { AuthShell } from '@/components/marketing/AuthShell'

const inputCls =
  'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function ResetPasswordPage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Read the one-time token from the URL (avoids needing a Suspense boundary).
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch {
      setError('This reset link is invalid or has expired. Please request a new one.')
    }
    setLoading(false)
  }

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-text)]">Choose a new password</h1>

      {done ? (
        <div className="mt-8 space-y-5">
          <p className="text-[15px] text-[var(--color-text)] bg-[var(--color-brand-soft)] px-4 py-3 rounded-xl">
            Your password has been reset. You can now sign in with your new password.
          </p>
          <a href="/login" className="block text-center text-[14px] font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Go to sign in →</a>
        </div>
      ) : !token ? (
        <div className="mt-8 space-y-5">
          <p className="text-[15px] text-red-600 bg-red-50 px-4 py-3 rounded-xl">
            This reset link is missing its token. Please use the link from your email, or request a new one.
          </p>
          <a href="/forgot-password" className="block text-center text-[14px] font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Request a new link</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="password" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">New password</label>
            <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
          </div>
          <div>
            <label htmlFor="confirm" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Confirm password</label>
            <input id="confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>
          {error && <p className="text-[14px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className="group w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
            {loading ? 'Resetting…' : <>Reset password <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>}
          </button>
          <a href="/login" className="block text-center text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)]">← Back to sign in</a>
        </form>
      )}
    </AuthShell>
  )
}

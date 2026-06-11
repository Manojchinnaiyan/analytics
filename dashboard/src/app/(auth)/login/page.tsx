'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { track, identify } from '@/lib/inspectuser.mjs'
import { authApi, saveToken } from '@/lib/auth'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'
import { useProjectStore } from '@/stores/project'
import { AuthShell } from '@/components/marketing/AuthShell'

const inputCls =
  'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function LoginPage() {
  const setProject = useProjectStore(s => s.setProject)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoMode, setSsoMode] = useState(false)
  const [orgSlug, setOrgSlug] = useState('')

  function startSSO(e: React.FormEvent) {
    e.preventDefault()
    if (!orgSlug.trim()) return
    const base = process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001'
    window.location.href = `${base}/v1/auth/sso/start?org=${encodeURIComponent(orgSlug.trim())}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      saveToken(res.token)
      setProject({
        projectId: res.project_id ?? '', apiKey: res.api_key ?? '', orgId: res.org_id,
        userName: res.name ?? '', email: res.email ?? email, projectName: res.project_name ?? '',
      })
      identify(res.user_id, { email: res.email ?? email })
      track('Logged In', { method: 'password' })
      // Hard navigation: the dashboard boots fresh with the token already in
      // localStorage. Avoids the SPA race where the first click didn't navigate
      // (router.push interrupted by the re-render / auth guard).
      window.location.href = '/overview'
    } catch {
      setError('Invalid email or password')
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <RedirectIfAuthed />
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-text)]">Welcome back</h1>
      <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">Sign in to your dashboard.</p>

      {ssoMode ? (
        <form onSubmit={startSSO} className="mt-8 space-y-5">
          <div>
            <label htmlFor="org" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Organization</label>
            <input id="org" required value={orgSlug} onChange={e => setOrgSlug(e.target.value)} className={inputCls} placeholder="your-org-slug" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors">Continue with SSO</button>
          <button type="button" onClick={() => setSsoMode(false)} className="w-full text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)]">← Back to password sign-in</button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Email</label>
            <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="password" className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">Password</label>
            <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>
          {error && <p className="text-[14px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className="group w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
            {loading ? 'Signing in…' : <>Sign in <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>}
          </button>
          <button type="button" onClick={() => setSsoMode(true)} className="w-full text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-brand)]">Sign in with SSO</button>
        </form>
      )}

      <p className="mt-7 text-center text-[14px] text-[var(--color-text-muted)]">
        No account? <a href="/signup" className="font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Start free</a>
      </p>
    </AuthShell>
  )
}

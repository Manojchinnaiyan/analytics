'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, saveToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { brand } from '@/config/brand'

export default function LoginPage() {
  const router = useRouter()
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
        projectId:   res.project_id ?? '',
        apiKey:      res.api_key ?? '',
        orgId:       res.org_id,
        userName:    res.name ?? '',
        email:       res.email ?? email,
        projectName: res.project_name ?? '',
      })
      router.push('/overview')
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="type-h3-16 text-[#0052F2]">{brand.name}</span>
          <p className="type-body-13 text-[#64748b] mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm p-8">
          {ssoMode ? (
            <form onSubmit={startSSO} className="space-y-5">
              <div>
                <label htmlFor="org" className="type-caption text-[#0f172a] block mb-1.5">Organization</label>
                <input
                  id="org"
                  required
                  value={orgSlug}
                  onChange={e => setOrgSlug(e.target.value)}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent transition-all"
                  placeholder="your-org-slug"
                />
              </div>
              <button type="submit" className="w-full py-2.5 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] transition-colors">
                Continue with SSO
              </button>
              <button type="button" onClick={() => setSsoMode(false)} className="w-full type-body-13 text-[#64748b] hover:text-[#0052F2]">
                ← Back to password sign-in
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="type-caption text-[#0f172a] block mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent transition-all"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="type-caption text-[#0f172a] block mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="type-body-13 text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setSsoMode(true)} className="w-full type-body-13 text-[#64748b] hover:text-[#0052F2]">
              Sign in with SSO
            </button>
          </form>
          )}
        </div>

        <p className="text-center type-body-13 text-[#64748b] mt-5">
          No account?{' '}
          <a href="/signup" className="type-link text-[#0052F2] hover:text-blue-700">Sign up</a>
        </p>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { saveToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { brand } from '@/config/brand'

function AcceptInviteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const setProject = useProjectStore(s => s.setProject)

  const [invite, setInvite] = useState<{ email: string; name: string; role: string; org_name: string } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    api.getInvite(token)
      .then(d => { setInvite(d); setName(d.name ?? ''); setStatus('ready') })
      .catch(() => setStatus('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSubmitting(true)
    try {
      const res = await api.acceptInvite(token, { name, password })
      saveToken(res.token)
      setProject({
        projectId:   res.project_id ?? '',
        apiKey:      res.api_key ?? '',
        orgId:       res.org_id,
        userName:    res.name ?? '',
        email:       res.email ?? '',
        projectName: res.project_name ?? '',
        role:        res.role ?? '',
      })
      router.push('/overview')
    } catch {
      setError('Could not accept the invite. It may have expired.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="type-h3-16 text-[#0052F2]">{brand.name}</span>
        </div>

        <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm p-8">
          {status === 'loading' && (
            <p className="type-body-15 text-[#64748b] text-center py-6">Checking your invite…</p>
          )}

          {status === 'invalid' && (
            <div className="text-center py-4">
              <p className="type-h3-16 text-[#0f172a] mb-1">Invite not valid</p>
              <p className="type-body-13 text-[#64748b]">This invite link is invalid or has expired. Ask your admin to resend it.</p>
              <a href="/login" className="type-link text-[#0052F2] inline-block mt-4">Go to sign in</a>
            </div>
          )}

          {status === 'ready' && invite && (
            <>
              <div className="mb-6">
                <p className="type-h3-16 text-[#0f172a]">Join {invite.org_name}</p>
                <p className="type-body-13 text-[#64748b] mt-1">
                  Invited as <strong className="text-[#0f172a] capitalize">{invite.role}</strong> · {invite.email}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="name" className="type-caption text-[#0f172a] block mb-1.5">Your name</label>
                  <input
                    id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="type-caption text-[#0f172a] block mb-1.5">Set a password</label>
                  <input
                    id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent"
                    placeholder="At least 8 characters"
                  />
                </div>

                {error && <p className="type-body-13 text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Setting up…' : 'Accept invite & continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  )
}

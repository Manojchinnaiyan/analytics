'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MailX } from 'lucide-react'
import { track, identify } from '@/lib/inspectuser.mjs'
import { authApi, saveToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { AuthShell } from '@/components/marketing/AuthShell'

export default function VerifyEmailPage() {
  const setProject = useProjectStore(s => s.setProject)
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    if (!token) { setStatus('error'); return }

    authApi.verifyEmail(token)
      .then(res => {
        saveToken(res.token)
        setProject({
          projectId: res.project_id ?? '', apiKey: res.api_key ?? '', orgId: res.org_id,
          userName: res.name ?? '', email: res.email ?? '', projectName: res.project_name ?? '',
        })
        identify(res.user_id, { email: res.email ?? '' })
        track('Email Verified', {})
        // Verified + logged in → start onboarding. Hard nav so the app boots fresh.
        window.location.href = '/welcome'
      })
      .catch(() => setStatus('error'))
  }, [setProject])

  return (
    <AuthShell>
      {status === 'verifying' ? (
        <div className="text-center py-6">
          <Loader2 className="mx-auto h-8 w-8 text-[var(--color-brand)] animate-spin" />
          <h1 className="mt-5 text-[22px] font-semibold text-[var(--color-text)]">Verifying your email…</h1>
          <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">Hang tight — signing you in.</p>
        </div>
      ) : (
        <div className="text-center py-2">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-50">
            <MailX className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Link invalid or expired</h1>
          <p className="mt-2 text-[15px] text-[var(--color-text-muted)] leading-relaxed">
            This verification link is no longer valid. They expire after 24 hours — request a fresh one from the sign-in page.
          </p>
          <a href="/login" className="mt-6 inline-block text-[14px] font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Go to sign in →</a>
        </div>
      )}
    </AuthShell>
  )
}

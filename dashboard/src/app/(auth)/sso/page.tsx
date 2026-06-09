'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveToken } from '@/lib/auth'

function SSOLanding() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setError('No session token returned'); return }
    saveToken(token)
    // DashboardShell hydrates the project store from /v1/me on load.
    router.replace('/overview')
  }, [params, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <p className="type-body-15 text-[#64748b]">{error || 'Signing you in…'}</p>
    </div>
  )
}

export default function SSOPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SSOLanding />
    </Suspense>
  )
}

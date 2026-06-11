'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'

/**
 * On public pages (landing, login, signup) send an already-logged-in visitor
 * straight to the dashboard instead of showing the marketing page.
 * If the token turns out to be invalid/expired, the dashboard's own 401 handler
 * bounces them back to /login.
 */
export function RedirectIfAuthed() {
  const router = useRouter()
  useEffect(() => {
    if (getToken()) router.replace('/overview')
  }, [router])
  return null
}

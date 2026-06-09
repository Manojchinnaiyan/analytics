'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, clearToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'

/**
 * Guards a route — redirects to /login if no token.
 * Returns `ready` once the client-side auth check has run (avoids SSR flash).
 */
export function useRequireAuth() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [router])

  return ready
}

/** Returns a logout function that clears token + store and redirects to /login. */
export function useLogout() {
  const router = useRouter()
  const clear = useProjectStore(s => s.clear)

  return () => {
    clearToken()
    clear()
    router.replace('/login')
  }
}

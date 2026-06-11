import { Analytics } from '@/components/Analytics'

// Auth pages are part of the public website funnel — keep analytics here so the
// Signed Up / Logged In conversion events fire. The logged-in app (the
// (dashboard) group) deliberately has NO analytics.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Analytics />
      {children}
    </>
  )
}

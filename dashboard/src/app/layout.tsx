import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from '@/components/layout/Providers'
import { brand } from '@/config/brand'

// Self-hosted IBM Plex (woff2 in ./fonts) instead of next/font/google. The
// Google loader fetches fonts at BUILD time, which intermittently failed the
// server-side build (flaky deploys). Local files build offline and reliably.
const ibmPlexSans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter-tight',
  display: 'swap',
})

const ibmPlexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.description}`,
  description: brand.description,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        {/* Runs before the page renders: if a logged-in visitor hits a public
            page, bounce them to the dashboard instantly — no waiting for the
            marketing bundle to download + hydrate. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;if((p==='/'||p==='/login'||p==='/signup')&&localStorage.getItem('amp_token')){location.replace('/overview')}}catch(e){}})();`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

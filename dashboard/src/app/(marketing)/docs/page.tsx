import type { Metadata } from 'next'
import { Rocket, KeyRound, Package, MousePointerClick, Activity, UserCheck, DollarSign, PlayCircle, Server, CheckCircle2 } from 'lucide-react'
import { CodeBlock } from '@/components/marketing/CodeBlock'
import { brand } from '@/config/brand'

export const metadata: Metadata = {
  title: 'Docs — Installation',
  description: `Install the ${brand.name} SDK and start capturing analytics, replay and revenue in minutes.`,
}

const TOC = [
  ['quickstart', 'Quick start', Rocket],
  ['key', 'Get your API key', KeyRound],
  ['install', 'Install the SDK', Package],
  ['autocapture', 'Autocapture', MousePointerClick],
  ['events', 'Track events', Activity],
  ['identify', 'Identify users', UserCheck],
  ['revenue', 'Revenue', DollarSign],
  ['replay', 'Session replay', PlayCircle],
  ['server', 'Server-side (Node)', Server],
  ['verify', 'Verify it works', CheckCircle2],
] as const

function H({ id, icon: Icon, children }: { id: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 flex items-center gap-2.5 text-[24px] font-semibold text-[var(--color-text)] mt-12 mb-4 first:mt-0">
      <span className="grid place-items-center h-8 w-8 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Icon className="h-[18px] w-[18px]" /></span>
      {children}
    </h2>
  )
}

export default function DocsPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-36 pb-10 bg-white text-center">
        <div className="absolute inset-0 iu-grid" aria-hidden />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-72 w-[680px] iu-blob bg-[#4C85F5] opacity-20" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5">
          <div className="text-[13px] font-semibold tracking-wide uppercase text-[var(--color-brand)] mb-3">Documentation</div>
          <h1 className="text-[40px] sm:text-[52px] leading-[1.06] font-semibold tracking-tight text-[var(--color-text)]">Install in minutes</h1>
          <p className="mt-5 text-[18px] text-[var(--color-text-muted)] max-w-2xl mx-auto">Drop in one line. Autocapture starts recording pageviews, clicks, sessions and errors automatically — then add revenue and identify when you’re ready.</p>
        </div>
      </section>

      <section className="pb-24 bg-white">
        <div className="mx-auto max-w-6xl px-5 grid lg:grid-cols-[220px_1fr] gap-10">
          {/* TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-28 space-y-1">
              {TOC.map(([id, label, Icon]) => (
                <a key={id} href={`#${id}`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors">
                  <Icon className="h-4 w-4 text-[var(--color-text-subtle)]" /> {label}
                </a>
              ))}
            </nav>
          </aside>

          {/* content */}
          <div className="min-w-0 max-w-2xl">
            <H id="quickstart" icon={Rocket}>Quick start</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Three steps to live analytics:</p>
            <ol className="mt-3 space-y-2 text-[15px] text-[var(--color-text)]">
              <li><b>1.</b> Sign up and copy your <b>write key</b> from onboarding.</li>
              <li><b>2.</b> Install the SDK and call <code className="px-1 py-0.5 rounded bg-[var(--color-surface-muted)] text-[13px]">init()</code> once.</li>
              <li><b>3.</b> Watch events stream into <b>Live Events</b>.</li>
            </ol>

            <H id="key" icon={KeyRound}>Get your API key</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">
              Create an account at <a href="/signup" className="text-[var(--color-brand)]">{brand.name}</a>. The onboarding wizard gives you a <b>write key</b> (safe to ship in your browser bundle — it can only send events, never read them). You’ll point the SDK at the ingestion endpoint:
            </p>
            <CodeBlock lang="text" code={`Write key:    amp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Ingest URL:   https://ingest.inspectuser.com`} />

            <H id="install" icon={Package}>Install the SDK</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">For any bundled app (React, Vue, Svelte, plain JS):</p>
            <CodeBlock lang="bash" code={`npm install @inspectuser/browser`} />
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed mt-4">Initialise once, as early as possible:</p>
            <CodeBlock lang="ts" code={`import { init } from '@inspectuser/browser'

init({
  apiKey: 'YOUR_WRITE_KEY',
  serverUrl: 'https://ingest.inspectuser.com',
})`} />
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed mt-4">No build step? Use a module script tag:</p>
            <CodeBlock lang="html" code={`<script type="module">
  import { init } from 'https://esm.sh/@inspectuser/browser'
  init({
    apiKey: 'YOUR_WRITE_KEY',
    serverUrl: 'https://ingest.inspectuser.com',
  })
</script>`} />

            <H id="autocapture" icon={MousePointerClick}>Autocapture</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Turn on automatic tracking — no manual events needed. Pageviews, clicks, scroll depth, rage/dead clicks, Web Vitals and JS errors are captured for you:</p>
            <CodeBlock lang="ts" code={`init({
  apiKey: 'YOUR_WRITE_KEY',
  serverUrl: 'https://ingest.inspectuser.com',
  autoCapture: {
    pageViews: true,
    clicks: true,
    scrollDepth: true,
    rageClicks: true,
    deadClicks: true,
    webVitals: true,
    errors: true,
  },
})`} />

            <H id="events" icon={Activity}>Track custom events</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">For the moments that matter to your business:</p>
            <CodeBlock lang="ts" code={`import { track } from '@inspectuser/browser'

track('Signup Completed', { plan: 'pro', referrer: 'producthunt' })
track('Project Created', { template: 'blank' })`} />

            <H id="identify" icon={UserCheck}>Identify users</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Attach a stable user id (e.g. after login) so sessions across devices stitch into one person:</p>
            <CodeBlock lang="ts" code={`import { identify } from '@inspectuser/browser'

identify('user_123', { email: 'ada@acme.com', name: 'Ada', plan: 'pro' })`} />

            <H id="revenue" icon={DollarSign}>Revenue</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Send revenue at checkout to unlock revenue-by-source, AOV, ARPU and LTV:</p>
            <CodeBlock lang="ts" code={`import { revenue } from '@inspectuser/browser'

revenue({
  price: 49,
  quantity: 1,
  productId: 'pro_monthly',
  currency: 'USD',
  transactionId: 'txn_abc123', // dedups repeats
})`} />

            <H id="replay" icon={PlayCircle}>Session replay</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">One flag adds session replay — inputs are masked by default for privacy. rrweb is lazy-loaded so it never blocks page render:</p>
            <CodeBlock lang="ts" code={`init({
  apiKey: 'YOUR_WRITE_KEY',
  serverUrl: 'https://ingest.inspectuser.com',
  sessionReplay: {
    enabled: true,
    sampleRate: 1,        // 0..1 — fraction of sessions to record
    maskAllInputs: true,  // never record input values
  },
})`} />

            <H id="server" icon={Server}>Server-side (Node.js)</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Track backend events (webhooks, jobs, server-side purchases):</p>
            <CodeBlock lang="bash" code={`npm install @inspectuser/node`} />
            <CodeBlock lang="ts" code={`import { NodeClient } from '@inspectuser/node'

const client = new NodeClient({
  apiKey: 'YOUR_WRITE_KEY',
  serverUrl: 'https://ingest.inspectuser.com',
})

client.track('Order Shipped', { orderId: 'A1', total: 49 }, { userId: 'user_123' })
client.identify('user_123', { plan: 'pro' })

// flushes automatically on exit; or force it:
await client.flush()`} />

            <H id="verify" icon={CheckCircle2}>Verify it works</H>
            <p className="text-[15px] text-[var(--color-text-muted)] leading-relaxed">Load your site, then open <b>Live Events</b> in {brand.name} — your events appear within a second or two. Recordings show up under <b>Session Replay</b>, and any checkout calls land in <b>Revenue</b>.</p>
            <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[#FAFBFD] p-5">
              <p className="text-[14px] text-[var(--color-text)] font-medium">Next steps</p>
              <ul className="mt-2 space-y-1.5 text-[14px] text-[var(--color-text-muted)]">
                <li>→ Build a <a href="/features" className="text-[var(--color-brand)]">funnel</a> from your events</li>
                <li>→ Share a <b>public dashboard</b> from the Dashboards page</li>
                <li>→ Create a <b>smart link</b> on your own domain for campaign attribution</li>
              </ul>
            </div>
            <div className="mt-8">
              <a href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors">Get your API key</a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

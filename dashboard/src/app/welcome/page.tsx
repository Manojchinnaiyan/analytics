'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Copy, Check, Loader2, Zap,
  BarChart2, GitMerge, RefreshCw, ArrowRight, Terminal,
} from 'lucide-react'
import { getToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { brand } from '@/config/brand'
import axios from 'axios'

const QUERY_URL = process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001'

type Platform = 'browser' | 'react' | 'node' | 'python'
type CodeTab  = 'install' | 'initialize' | 'track'

const PLATFORMS = [
  { id: 'browser' as Platform,  label: 'JavaScript',  desc: 'Vanilla JS or any framework', icon: '🌐' },
  { id: 'react'   as Platform,  label: 'React',        desc: 'React or Next.js apps',        icon: '⚛️' },
  { id: 'node'    as Platform,  label: 'Node.js',      desc: 'Server-side tracking',         icon: '🟢' },
  { id: 'python'  as Platform,  label: 'Python',       desc: 'Python apps & scripts',        icon: '🐍' },
]

// Brand-aware SDK snippets. `__KEY__` is swapped for the real API key at render.
const { object: SDK, browserPkg: BROWSER_PKG, nodePkg: NODE_PKG } = brand.sdk

function buildCode(platform: Platform, tab: CodeTab): string {
  const CODE: Record<Platform, Record<CodeTab, string>> = {
    browser: {
      install:    `npm install ${BROWSER_PKG}`,
      initialize: `import ${SDK} from '${BROWSER_PKG}'\n\n${SDK}.init({\n  apiKey: '__KEY__',\n  serverUrl: 'http://localhost:4000',\n  autoCapture: { pageViews: true },\n})`,
      track:      `${SDK}.track('Button Clicked', { page: '/pricing' })\n\n// Identify a user\n${SDK}.identify('user_123', { name: 'Manoj', plan: 'pro' })`,
    },
    react: {
      install:    `npm install ${BROWSER_PKG}`,
      initialize: `// src/main.tsx\nimport ${SDK} from '${BROWSER_PKG}'\n\n${SDK}.init({\n  apiKey: '__KEY__',\n  serverUrl: 'http://localhost:4000',\n})`,
      track:      `import ${SDK} from '${BROWSER_PKG}'\n\nfunction SignupButton() {\n  return (\n    <button onClick={() => ${SDK}.track('Sign Up Clicked')}>\n      Sign Up\n    </button>\n  )\n}`,
    },
    node: {
      install:    `npm install ${NODE_PKG}`,
      initialize: `import ${SDK} from '${NODE_PKG}'\n\n${SDK}.init({\n  apiKey: '__KEY__',\n  serverUrl: 'http://localhost:4000',\n})`,
      track:      `${SDK}.track('Order Completed', {\n  order_id: 'ord_123',\n  revenue: 49.99,\n}, { userId: 'user_456' })\n\nawait ${SDK}.shutdown()`,
    },
    python: {
      install:    'pip install requests',
      initialize: `import requests\n\nAPI_KEY = '__KEY__'\nURL = 'http://localhost:4000/v2/httpapi'\n\ndef track(event, user_id, props=None):\n    requests.post(URL, json={\n        'api_key': API_KEY,\n        'events': [{'event_type': event, 'user_id': user_id, 'event_properties': props or {}}]\n    })`,
      track:      `track('User Signed Up', 'user_123', {'plan': 'pro'})\ntrack('Purchase Completed', 'user_123', {'amount': 49.99})`,
    },
  }
  return CODE[platform][tab]
}

const STEPS = [
  { id: 0, label: 'Welcome',         sub: 'Your project is ready' },
  { id: 1, label: 'Choose platform', sub: 'Pick your SDK' },
  { id: 2, label: 'Install & setup', sub: 'Add code to your app' },
  { id: 3, label: 'Send first event',sub: 'Verify connection' },
]

// ── Clipboard hook ────────────────────────────────────────────────────────────
function useClipboard() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])
  return { copied, copy }
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const { copied, copy } = useClipboard()
  return (
    <div className="rounded-lg overflow-hidden border border-white/5">
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5 border-b border-white/5">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <span className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <span className="type-caption-12-400 text-[#64748b]">{lang}</span>
        <button onClick={() => copy(code)} className="flex items-center gap-1.5 type-body-13 text-[#64748b] hover:text-white transition-colors">
          {copied ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
        </button>
      </div>
      <pre className="bg-[#1e1e2e] text-[#e2e8f0] px-4 py-4 overflow-x-auto">
        <code className="type-caption-12-400 leading-relaxed">{code}</code>
      </pre>
    </div>
  )
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
function WelcomeStep({ userName, projectName, apiKey, onNext }: {
  userName: string; projectName: string; apiKey: string; onNext: () => void
}) {
  const { copied, copy } = useClipboard()
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 type-caption px-3 py-1 rounded-full">
          <CheckCircle2 className="h-3.5 w-3.5" /> Account created successfully
        </div>
        <h1 className="type-h3 text-[#0f172a]">
          Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="type-body-15 text-[#64748b]">
          Your project <span className="type-small-body text-[#0f172a]">{projectName}</span> is ready.
          Let's connect your app to start tracking events.
        </p>
      </div>

      {/* API Key */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-5">
        <p className="type-small-10-500 text-[#0052F2] uppercase mb-3 tracking-widest">Your API Key</p>
        <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-blue-100">
          <Terminal className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <code className="type-caption-12-400 text-[#0f172a] flex-1 truncate">{apiKey || 'Loading…'}</code>
          <button onClick={() => copy(apiKey)} className="flex-shrink-0 type-link text-[#0052F2] hover:text-blue-800 flex items-center gap-1">
            {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
          </button>
        </div>
        <p className="type-body-13 text-blue-500 mt-2">You'll need this key to initialize the SDK in your app.</p>
      </div>

      {/* Feature preview */}
      <div>
        <p className="type-caption text-[#64748b] mb-3">After setup, you'll unlock:</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: BarChart2, label: 'Event Segmentation', color: 'text-blue-500 bg-blue-50' },
            { icon: GitMerge,  label: 'Funnel Analysis',    color: 'text-purple-500 bg-purple-50' },
            { icon: RefreshCw, label: 'Retention Cohorts',  color: 'text-green-500 bg-green-50' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-3 bg-[#f8fafc] rounded-xl text-center border border-[#e2e8f0]">
              <div className={`p-2 rounded-lg ${color}`}><Icon className="h-4 w-4" /></div>
              <span className="type-body-12-400 text-[#0f172a]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onNext} className="w-full py-3 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] active:scale-[0.99] transition-all flex items-center justify-center gap-2">
        Get started <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Step 1: Platform ──────────────────────────────────────────────────────────
function PlatformStep({ selected, onSelect, onNext, onBack }: {
  selected: Platform; onSelect: (p: Platform) => void; onNext: () => void; onBack: () => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-h3 text-[#0f172a]">Choose your platform</h2>
        <p className="type-body-15 text-[#64748b] mt-1">Select where you want to track events from</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              selected === p.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-[#e2e8f0] hover:border-[#cbd5e1] bg-white'
            }`}
          >
            <span className="text-2xl leading-none">{p.icon}</span>
            <div>
              <p className="type-h3-16 text-[#0f172a]">{p.label}</p>
              <p className="type-body-12-400 text-[#94a3b8] mt-0.5">{p.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 border border-[#e2e8f0] type-small-body text-[#64748b] rounded-xl hover:bg-[#f8fafc] transition-colors">
          ← Back
        </button>
        <button onClick={onNext} className="flex-[2] py-3 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] transition-colors flex items-center justify-center gap-2">
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Install ───────────────────────────────────────────────────────────
function InstallStep({ platform, apiKey, onNext, onBack }: {
  platform: Platform; apiKey: string; onNext: () => void; onBack: () => void
}) {
  const [tab, setTab] = useState<CodeTab>('install')
  const tabs: { id: CodeTab; label: string }[] = [
    { id: 'install',    label: '1. Install' },
    { id: 'initialize', label: '2. Initialize' },
    { id: 'track',      label: '3. Track' },
  ]
  const hints: Record<CodeTab, string> = {
    install:    'Run this in your project directory terminal.',
    initialize: 'Add this once at your app entry point. Your API key is pre-filled.',
    track:      'Call track() anywhere in your app when something meaningful happens.',
  }
  const langs: Record<CodeTab, string> = { install: 'bash', initialize: 'typescript', track: 'typescript' }
  const code = buildCode(platform, tab).replaceAll('__KEY__', apiKey)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-h3 text-[#0f172a]">Install & set up</h2>
        <p className="type-body-15 text-[#64748b] mt-1">Add the SDK to your app in 3 steps</p>
      </div>

      <div className="flex gap-1 bg-[#f1f5f9] p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 type-caption rounded-lg transition-all ${
              tab === t.id ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <CodeBlock code={code} lang={langs[tab]} />

      <div className="flex items-start gap-2 type-body-13 text-[#64748b] bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-3">
        <span className="mt-0.5">💡</span>
        <span>{hints[tab]}</span>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 border border-[#e2e8f0] type-small-body text-[#64748b] rounded-xl hover:bg-[#f8fafc] transition-colors">
          ← Back
        </button>
        <button onClick={onNext} className="flex-[2] py-3 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] transition-colors flex items-center justify-center gap-2">
          I've added the code <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Waiting ───────────────────────────────────────────────────────────
function WaitingStep({ projectId, onFinish }: { projectId: string; onFinish: () => void }) {
  const [received, setReceived] = useState(false)
  const [eventName, setEventName] = useState('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const token = getToken()
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(
          `${QUERY_URL}/v1/projects/${projectId}/events/first`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.data.received) {
          setReceived(true)
          setEventName(res.data.event_type)
          clearInterval(pollRef.current!)
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(pollRef.current!)
  }, [projectId])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-h3 text-[#0f172a]">
          {received ? 'Event received! 🎉' : 'Waiting for your first event'}
        </h2>
        <p className="type-body-15 text-[#64748b] mt-1">
          {received
            ? 'Your app is connected. You\'re ready to start analyzing.'
            : 'Run your app and trigger an event — we\'ll detect it automatically.'}
        </p>
      </div>

      {!received ? (
        <>
          <div className="flex flex-col items-center py-10 gap-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-blue-400 opacity-15 animate-ping [animation-delay:0.4s]" />
              <div className="relative w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="type-h3-16 text-[#0f172a]">Listening for events</p>
              <p className="type-body-13 text-[#94a3b8] mt-1">Checking every 2 seconds…</p>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { label: 'SDK installed',               done: true },
              { label: 'SDK initialized with API key', done: true },
              { label: 'Trigger an event in your app', done: false },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-3 py-2.5 px-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-100' : 'bg-[#e2e8f0]'}`}>
                  {done
                    ? <Check className="h-3 w-3 text-green-600" />
                    : <div className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />
                  }
                </div>
                <span className={`type-body-15 ${done ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>{label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <Zap className="h-10 w-10 text-green-600" />
            </div>
          </div>

          <div className="border border-green-200 bg-green-50 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-green-200 bg-green-100">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="type-caption text-green-800">Live events</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-green-600" />
                <span className="type-h3-16 text-[#0f172a]">{eventName}</span>
              </div>
              <span className="type-body-13 text-[#94a3b8]">just now</span>
            </div>
          </div>

          <button onClick={onFinish} className="w-full py-3 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] transition-all flex items-center justify-center gap-2">
            Go to Dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {!received && (
        <button onClick={onFinish} className="w-full type-body-15 text-[#94a3b8] hover:text-[#64748b] py-2 transition-colors">
          Skip for now →
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const { projectId, apiKey, userName, projectName } = useProjectStore()
  const [step, setStep] = useState(0)
  const [platform, setPlatform] = useState<Platform>('browser')

  useEffect(() => {
    if (!projectId || !apiKey) router.replace('/signup')
  }, [projectId, apiKey, router])

  function finish() {
    router.push('/overview')
  }

  return (
    <div className="min-h-screen flex bg-[#f8fafc]">
      {/* Sidebar */}
      <div className="w-72 bg-[#0f172a] flex flex-col flex-shrink-0">
        <div className="px-8 py-7 border-b border-white/10">
          <span className="type-h3-16 text-white">{brand.name}</span>
          <p className="type-body-13 text-[#64748b] mt-1">Getting started</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {STEPS.map(s => {
            const done   = step > s.id
            const active = step === s.id
            return (
              <button
                key={s.id}
                onClick={() => done && setStep(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                  active ? 'bg-white/10' : done ? 'opacity-60 hover:opacity-80 cursor-pointer' : 'opacity-30 cursor-default'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  done ? 'bg-green-500' : active ? 'bg-blue-500' : 'bg-white/10'
                }`}>
                  {done
                    ? <Check className="h-3.5 w-3.5 text-white" />
                    : <span className="type-caption text-white">{s.id + 1}</span>
                  }
                </div>
                <div>
                  <p className={`type-small-body ${active || done ? 'text-white' : 'text-[#64748b]'}`}>{s.label}</p>
                  <p className="type-body-13 text-[#475569]">{s.sub}</p>
                </div>
              </button>
            )
          })}
        </nav>

        <div className="px-8 py-5 border-t border-white/10">
          <p className="type-body-13 text-[#475569]">Need help?</p>
          <a href="#" className="type-link text-blue-400 hover:text-blue-300 mt-0.5 block">View docs →</a>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-xl">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <span className="type-body-13 text-[#64748b]">Step {step + 1} of {STEPS.length}</span>
              <span className="type-body-13 text-[#64748b]">{Math.round(((step + 1) / STEPS.length) * 100)}% complete</span>
            </div>
            <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm p-8">
            {step === 0 && <WelcomeStep userName={userName} projectName={projectName} apiKey={apiKey} onNext={() => setStep(1)} />}
            {step === 1 && <PlatformStep selected={platform} onSelect={setPlatform} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
            {step === 2 && <InstallStep platform={platform} apiKey={apiKey} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
            {step === 3 && <WaitingStep projectId={projectId} onFinish={finish} />}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Check, KeyRound, FolderKanban, Code2, CheckCircle2, AlertCircle, Plug, Clock, ShieldCheck } from 'lucide-react'
import { useProjectStore, usePermission } from '@/stores/project'
import { api } from '@/lib/api'
import { brand } from '@/config/brand'
import { Select } from '@/components/ui/Select'
import { TeamSection } from '@/components/TeamSection'

// Reporting timezone — day boundaries (DAU, daily trends) use this.
function TimezoneSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const can = usePermission()
  const editable = can('settings.manage')
  const [saving, setSaving] = useState(false)
  const { data } = useQuery({ queryKey: ['project', projectId], queryFn: () => api.project(projectId), enabled: !!projectId })
  const tz = data?.timezone ?? 'UTC'

  let zones: string[] = []
  try { zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [] } catch { /* older browser */ }
  if (zones.length === 0) zones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']
  const options = zones.map(z => ({ value: z, label: z }))

  async function save(v: string) {
    setSaving(true)
    try {
      await api.setTimezone(projectId, v)
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['product-overview', projectId] })
    } finally { setSaving(false) }
  }

  return (
    <section className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-4 w-4 text-[#0052F2]" />
        <h2 className="type-h3-16 text-[#18181B]">Reporting timezone</h2>
      </div>
      <p className="type-body-13 text-[#6F7480] mb-3">Day boundaries for DAU and daily trends use this timezone. Current: <b>{tz}</b>.</p>
      {editable
        ? <div className="flex items-center gap-2"><Select value={tz} onChange={save} options={options} className="w-[280px]" />{saving && <span className="type-body-12-400 text-[var(--color-text-subtle)]">Saving…</span>}</div>
        : <p className="type-body-13 text-[var(--color-text-subtle)]">Only settings managers can change this.</p>}
    </section>
  )
}

// SSO (OIDC) — org admins point InspectUser at their identity provider.
function SSOSection() {
  const qc = useQueryClient()
  const can = usePermission()
  const editable = can('settings.manage')
  const [saving, setSaving] = useState(false)
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [err, setErr] = useState('')

  const { data } = useQuery({ queryKey: ['sso'], queryFn: () => api.ssoConfig(), enabled: editable })
  const configured = data?.configured ?? false

  async function save() {
    setErr(''); setSaving(true)
    try {
      await api.setSSO({ issuer: issuer || data?.issuer, client_id: clientId || data?.client_id, client_secret: clientSecret || undefined })
      setClientSecret('')
      qc.invalidateQueries({ queryKey: ['sso'] })
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      setErr(ax.response?.data?.error ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  if (!editable) return null

  return (
    <section className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-4 w-4 text-[#0052F2]" />
        <h2 className="type-h3-16 text-[#18181B]">Single sign-on (OIDC)</h2>
        {configured && data?.enabled && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 type-body-12-400">Active</span>}
      </div>
      <p className="type-body-13 text-[#6F7480] mb-3">
        Connect your identity provider (Okta, Auth0, Azure AD, Google). Users sign in via <code>/login → Sign in with SSO</code> using your org slug. Set the provider redirect URI to <code>{(process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001') + '/v1/auth/sso/callback'}</code>.
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Issuer URL</span>
          <input className="ctrl w-full" defaultValue={data?.issuer} onChange={e => setIssuer(e.target.value)} placeholder="https://your-org.okta.com" />
        </div>
        <div>
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Client ID</span>
          <input className="ctrl w-full" defaultValue={data?.client_id} onChange={e => setClientId(e.target.value)} />
        </div>
        <div>
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Client secret {configured && <span className="text-[var(--color-text-subtle)]">(leave blank to keep)</span>}</span>
          <input className="ctrl w-full" type="password" onChange={e => setClientSecret(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {err && <p className="type-body-13 text-[#DE0202] mt-2">{err}</p>}
      <button onClick={save} disabled={saving} className="btn-brand px-4 py-2 type-caption rounded-md mt-3 disabled:opacity-50">{saving ? 'Saving…' : 'Save SSO config'}</button>
    </section>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type Platform = 'browser' | 'react' | 'node' | 'python'

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'browser', label: 'JavaScript' },
  { id: 'react',   label: 'React' },
  { id: 'node',    label: 'Node.js' },
  { id: 'python',  label: 'Python' },
]

function snippet(platform: Platform, apiKey: string): string {
  const { object: SDK, browserPkg, nodePkg } = brand.sdk
  switch (platform) {
    case 'browser':
    case 'react':
      return `import ${SDK} from '${browserPkg}'

${SDK}.init({
  apiKey: '${apiKey}',
  serverUrl: 'http://localhost:4000',
  autoCapture: { pageViews: true },
})

${SDK}.track('Button Clicked', { page: '/home' })`
    case 'node':
      return `import ${SDK} from '${nodePkg}'

${SDK}.init({
  apiKey: '${apiKey}',
  serverUrl: 'http://localhost:4000',
})

${SDK}.track('Order Completed', { revenue: 49.99 }, { userId: 'user_123' })`
    case 'python':
      return `import requests

requests.post('http://localhost:4000/v2/httpapi', json={
  'api_key': '${apiKey}',
  'events': [{ 'event_type': 'App Started', 'user_id': 'user_123' }]
})`
  }
}

function useClipboard() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])
  return { copied, copy }
}

// Change the signed-in user's password.
function PasswordSection() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (next.length < 8) { setMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return }
    if (next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return }
    setSaving(true)
    try {
      await api.changePassword(cur, next)
      setMsg({ ok: true, text: 'Password updated.' })
      setCur(''); setNext(''); setConfirm('')
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      setMsg({ ok: false, text: ax.response?.data?.error ?? 'Failed to update password.' })
    } finally { setSaving(false) }
  }

  return (
    <section className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-4 w-4 text-[#0052F2]" />
        <h2 className="type-h3-16 text-[#18181B]">Change password</h2>
      </div>
      <p className="type-body-13 text-[#6F7480] mb-4">Update the password you use to sign in.</p>
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <input type="password" className="ctrl w-full" placeholder="Current password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" required />
        <input type="password" className="ctrl w-full" placeholder="New password (min 8 chars)" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required />
        <input type="password" className="ctrl w-full" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
        {msg && <p className={`type-body-13 ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 bg-[#0052F2] text-white rounded-lg type-body-13 font-medium hover:bg-[#0043c4] disabled:opacity-50 transition-colors">
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  )
}

export default function SettingsPage() {
  const { projectId, apiKey, projectName, userName, email } = useProjectStore()
  const [platform, setPlatform] = useState<Platform>('browser')
  const keyClip = useClipboard()
  const codeClip = useClipboard()

  const { data: ov } = useQuery({
    queryKey: ['overview', projectId],
    queryFn: () => api.overview(projectId),
    enabled: !!projectId,
    refetchInterval: 10_000,
  })
  const connected: boolean = ov?.connected ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-h3 text-[#0f172a]">Settings</h1>
        <p className="type-body-15 text-[#64748b] mt-1">Manage your project, API keys, and SDK setup</p>
      </div>

      {/* Connection status */}
      <section className={`glass rounded-lg p-6 ${connected ? 'ring-1 ring-emerald-200' : 'ring-1 ring-amber-200'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {connected ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-[#0052F2]" />
                <h2 className="type-h3-16 text-[#18181B]">Connection</h2>
              </div>
              <p className="type-body-15 text-[#18181B] mt-1">
                {connected ? 'Connected — receiving events' : 'Waiting for your first event'}
              </p>
              <p className="type-body-13 text-[#6F7480] mt-0.5">
                {connected
                  ? `Last event ${ov?.last_event_time ? timeAgo(ov.last_event_time) : 'recently'} · ${(ov?.total_events ?? 0).toLocaleString()} events received`
                  : 'Add the SDK with your API key below, then trigger an event to verify.'}
              </p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full type-caption ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {connected ? 'Live' : 'No data'}
          </span>
        </div>
      </section>

      {/* Project info */}
      <section className="glass rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderKanban className="h-4 w-4 text-[#0052F2]" />
          <h2 className="type-h3-16 text-[#0f172a]">Project</h2>
        </div>
        <dl className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-[#f1f5f9]">
            <dt className="type-body-15 text-[#64748b]">Project name</dt>
            <dd className="type-small-body text-[#0f172a]">{projectName || '—'}</dd>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#f1f5f9]">
            <dt className="type-body-15 text-[#64748b]">Project ID</dt>
            <dd className="type-caption-12-400 text-[#0f172a]">{projectId || '—'}</dd>
          </div>
          <div className="flex justify-between items-center py-2">
            <dt className="type-body-15 text-[#64748b]">Owner</dt>
            <dd className="type-small-body text-[#0f172a]">{userName || email || '—'}</dd>
          </div>
        </dl>
      </section>

      {/* Team */}
      <TimezoneSection projectId={projectId} />

      <PasswordSection />

      <SSOSection />

      <TeamSection />

      {/* API Key */}
      <section className="glass rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-[#0052F2]" />
          <h2 className="type-h3-16 text-[#0f172a]">API Key</h2>
        </div>
        <p className="type-body-13 text-[#64748b] mb-3">
          Use this key to initialize the SDK. Keep it secret in production.
        </p>
        <div className="flex items-center gap-3 glass-soft rounded-lg px-4 py-3 border border-[#e2e8f0]">
          <code className="flex-1 type-caption-12-400 text-[#0f172a] truncate">{apiKey || '—'}</code>
          <button
            onClick={() => keyClip.copy(apiKey)}
            className="flex-shrink-0 flex items-center gap-1.5 type-link text-[#0052F2] hover:text-blue-800"
          >
            {keyClip.copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>
      </section>

      {/* SDK install */}
      <section className="glass rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Code2 className="h-4 w-4 text-[#0052F2]" />
          <h2 className="type-h3-16 text-[#0f172a]">SDK Setup</h2>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1 bg-[#f1f5f9] p-1 rounded-xl mb-4">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`flex-1 py-2 type-caption rounded-lg transition-all ${
                platform === p.id ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Code */}
        <div className="rounded-xl overflow-hidden border border-white/5">
          <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5 border-b border-white/5">
            <span className="type-caption-12-400 text-[#64748b]">{platform === 'python' ? 'python' : 'typescript'}</span>
            <button
              onClick={() => codeClip.copy(snippet(platform, apiKey))}
              className="flex items-center gap-1.5 type-body-13 text-[#64748b] hover:text-white transition-colors"
            >
              {codeClip.copied ? <><Check className="h-3.5 w-3.5 text-green-400" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          </div>
          <pre className="bg-[#1e1e2e] text-[#e2e8f0] px-4 py-4 overflow-x-auto">
            <code className="type-caption-12-400 leading-relaxed">{snippet(platform, apiKey)}</code>
          </pre>
        </div>
      </section>
    </div>
  )
}

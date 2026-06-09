'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { PlayCircle, Clock, User, Copy, Check, ChevronRight, ChevronDown, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

interface Replay {
  session_id: string
  distinct_id: string
  started_at: string
  duration_ms: number
  chunks: number
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const QUERY_BASE = process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001'

function buildSnippet(apiKey: string, samplePct: number, mask: boolean): string {
  return `<!-- Klyra session-replay recorder — async, sampled, privacy-safe -->
<script>
(function () {
  var SAMPLE = ${(samplePct / 100).toFixed(2)};                 // record ${samplePct}% of sessions
  if (Math.random() > SAMPLE) return;            // 90%+ of users load NOTHING
  var start = function () {
    var s = document.createElement('script');
    s.async = true;                              // never blocks page render
    s.src = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.4/dist/rrweb.min.js';
    s.onload = function () {
      var SID = sessionStorage._rrSid || (sessionStorage._rrSid = crypto.randomUUID());
      var buf = [];
      rrweb.record({
        emit: function (e) { buf.push(e); },
        ${mask ? 'maskAllInputs: true,              // PII: input values never recorded' : 'maskAllInputs: false,'}
        maskTextSelector: '.mask',                 // add class="mask" to redact text
        blockSelector: '.no-record',               // add class="no-record" to skip elements
        sampling: { mousemove: 50, scroll: 150, input: 'last' }   // throttle high-freq events
      });
      var flush = function (beacon) {
        if (!buf.length) return;
        var body = JSON.stringify({ api_key: '${apiKey || 'YOUR_API_KEY'}', session_id: SID, distinct_id: window._distinctId || SID, events: buf });
        buf = [];
        if (beacon && navigator.sendBeacon) {
          navigator.sendBeacon('${QUERY_BASE}/replay', new Blob([body], { type: 'application/json' }));
        } else {
          fetch('${QUERY_BASE}/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
        }
      };
      setInterval(function () { flush(false); }, 8000);                       // batched upload
      document.addEventListener('visibilitychange', function () { if (document.hidden) flush(true); }); // flush on leave
    };
    document.head.appendChild(s);
  };
  (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(start);  // defer to idle
})();
</script>`
}

export default function ReplayPage() {
  const projectId = useProjectStore(s => s.projectId)
  const apiKey = useProjectStore(s => s.apiKey)
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)

  async function remove(sessionId: string) {
    if (!confirm('Delete this recording? This cannot be undone.')) return
    await api.deleteReplay(projectId, sessionId)
    qc.invalidateQueries({ queryKey: ['replays', projectId] })
  }
  const [showInstall, setShowInstall] = useState(false)
  const [samplePct, setSamplePct] = useState(10)
  const [mask, setMask] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['replays', projectId],
    queryFn: () => api.replays(projectId),
    enabled: !!projectId,
    refetchInterval: 15_000,
  })
  const replays: Replay[] = data?.replays ?? []
  const snippet = buildSnippet(apiKey, samplePct, mask)

  const installCard = (
    <Card>
      <button onClick={() => setShowInstall(v => !v)} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2 type-h3-16 text-[var(--color-text)]"><ShieldCheck className="h-4 w-4 text-[#0052F2]" /> Install the recorder</span>
        {showInstall ? <ChevronDown className="h-4 w-4 text-[var(--color-text-subtle)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" />}
      </button>
      {showInstall && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-6 mb-4">
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Sampling — record {samplePct}% of sessions</span>
              <input type="range" min={1} max={100} value={samplePct} onChange={e => setSamplePct(Number(e.target.value))} className="w-56 accent-[#0052F2]" />
            </div>
            <label className="flex items-center gap-2 type-body-13 text-[var(--color-text-muted)] cursor-pointer pb-1">
              <input type="checkbox" checked={mask} onChange={e => setMask(e.target.checked)} className="accent-[#0052F2] h-3.5 w-3.5" />
              Mask all inputs (PII-safe)
            </label>
          </div>
          <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
            <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2 border-b border-white/5">
              <span className="type-caption-12-400 text-[#94a3b8]">Paste before &lt;/body&gt; — loads async, never blocks your page</span>
              <button onClick={() => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="flex items-center gap-1.5 type-body-13 text-[#94a3b8] hover:text-white">
                {copied ? <><Check className="h-3.5 w-3.5 text-green-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <pre className="bg-[#1e1e2e] text-[#e2e8f0] px-4 py-3 overflow-x-auto max-h-80"><code className="type-caption-12-400 leading-relaxed">{snippet}</code></pre>
          </div>
          <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">
            Async + idle-loaded + {samplePct}% sampled + sendBeacon + throttled — the performance-safe pattern the real vendors use.
          </p>
        </div>
      )}
    </Card>
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Session Replay" subtitle="Watch real user sessions — every click, scroll and navigation, replayed" />
      {installCard}

      <Card padding={false}>
        {isLoading ? (
          <div className="py-14 text-center type-body-15 text-[var(--color-text-subtle)]">Loading…</div>
        ) : replays.length === 0 ? (
          <div className="py-14 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><PlayCircle className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text)]">No recordings yet</p>
            <p className="type-body-13 text-[var(--color-text-subtle)] mt-1">Add the recorder above and sampled sessions will appear here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] type-caption text-[var(--color-text-muted)]">
                <th className="text-left px-5 py-3">Session</th>
                <th className="text-left px-5 py-3">User</th>
                <th className="text-right px-5 py-3">Duration</th>
                <th className="text-right px-5 py-3">Recorded</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {replays.map(r => (
                <tr key={r.session_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
                  <td className="px-5 py-3"><Link href={`/replay/${encodeURIComponent(r.session_id)}`} className="type-small-body text-[#0052F2] hover:underline">{r.session_id.slice(0, 18)}…</Link></td>
                  <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 type-body-13 text-[var(--color-text-muted)]"><User className="h-3.5 w-3.5" />{r.distinct_id || 'anonymous'}</span></td>
                  <td className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1 type-body-13 text-[var(--color-text)]"><Clock className="h-3.5 w-3.5 text-[var(--color-text-subtle)]" />{fmtDur(r.duration_ms)}</span></td>
                  <td className="px-5 py-3 text-right type-body-13 text-[var(--color-text-subtle)]">{timeAgo(r.started_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => remove(r.session_id)} title="Delete recording" className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
                      <Link href={`/replay/${encodeURIComponent(r.session_id)}`} className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#0052F2]"><ChevronRight className="h-4 w-4" /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

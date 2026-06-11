'use client'

import { useState } from 'react'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FlaskConical, Trophy, BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { useTopEvents } from '@/hooks/useTopEvents'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EventSelect } from '@/components/EventSelect'

interface Variant { key: string; weight: number }
interface TargetRule { property: string; operator: string; value: string; variant: string }
interface Flag {
  id: string
  key: string
  name: string
  enabled: boolean
  rollout: number
  holdout: number
  variants: Variant[]
  goal_event: string
  targeting?: TargetRule[]
  exclusion_group?: string
  prereq_flag?: string
  prereq_variant?: string
}
interface VariantResult {
  variant: string
  exposed: number
  converted: number
  rate: number
  is_control: boolean
  lift: number
  z: number
  significant: boolean
  prob_beat_control: number
  ci_low: number
  ci_high: number
  sequential_significant: boolean
  sample_size: number
  sample_reached: boolean
  guardrail_rate: number
  guardrail_regression: boolean
}

// Required sample size per variant for a two-proportion test (95% conf, 80% power).
function sampleSizePerArm(baseline: number, mdeRel: number): number {
  const p1 = baseline
  const p2 = Math.min(0.9999, p1 * (1 + mdeRel))
  const d = Math.abs(p2 - p1)
  if (d === 0) return Infinity
  const z = 1.96 + 0.84
  return Math.ceil((z * z * (p1 * (1 - p1) + p2 * (1 - p2))) / (d * d))
}

function SampleSizeCalc() {
  const [baseline, setBaseline] = useState(10)
  const [mde, setMde] = useState(20)
  const n = sampleSizePerArm(baseline / 100, mde / 100)
  return (
    <Card>
      <h2 className="type-h3-16 text-[var(--color-text)] mb-3">Sample-size calculator</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Baseline conversion %</span>
          <input type="number" className="ctrl w-28" value={baseline} onChange={e => setBaseline(Math.max(0.1, Number(e.target.value)))} />
        </div>
        <div>
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Min. detectable effect %</span>
          <input type="number" className="ctrl w-28" value={mde} onChange={e => setMde(Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="pb-1">
          <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Needed per variant</span>
          <span className="type-h3 text-[#0052F2]">{Number.isFinite(n) ? n.toLocaleString() : '—'}</span>
        </div>
      </div>
      <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">95% confidence · 80% power. Detect a {mde}% relative lift on a {baseline}% baseline.</p>
    </Card>
  )
}

function ResultsPanel({ flag }: { flag: Flag }) {
  const projectId = useProjectStore(s => s.projectId)
  const [goal, setGoal] = useState(flag.goal_event)
  const [guardrail, setGuardrail] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['flag-results', projectId, flag.id, goal, guardrail],
    queryFn: () => api.flagResults(projectId, flag.id, goal || undefined, guardrail || undefined),
    enabled: !!projectId && !!goal,
  })
  const variants: VariantResult[] = data?.variants ?? []
  const winner = variants.filter(v => !v.is_control && v.prob_beat_control >= 0.95 && v.lift > 0).sort((a, b) => b.prob_beat_control - a.prob_beat_control)[0]
  const regression = variants.find(v => v.guardrail_regression)

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="type-caption text-[var(--color-text-muted)]">Goal event</span>
        <div className="w-56"><EventSelect value={goal} onChange={setGoal} placeholder="pick a conversion event" /></div>
        <span className="type-caption text-[var(--color-text-muted)] ml-2">Guardrail</span>
        <div className="w-56"><EventSelect value={guardrail} onChange={setGuardrail} placeholder="optional (e.g. Error)" /></div>
      </div>
      {!goal ? (
        <p className="type-body-13 text-[var(--color-text-subtle)]">Pick a goal event to measure conversion per variant.</p>
      ) : isLoading ? (
        <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
      ) : variants.length === 0 ? (
        <p className="type-body-13 text-[var(--color-text-subtle)]">No exposures yet — call the flag from your SDK so users get assigned.</p>
      ) : (
        <>
          {winner && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 type-body-13">
              <Trophy className="h-4 w-4" /> <b>{winner.variant}</b> is winning — {(winner.lift * 100).toFixed(1)}% lift, {(winner.prob_beat_control * 100).toFixed(1)}% probability to beat control
              {winner.sequential_significant && <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 type-body-12-400">sequential ✓ (safe to stop)</span>}
            </div>
          )}
          {regression && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-red-50 text-[#DE0202] type-body-13">
              ⚠ Guardrail regression: <b>{regression.variant}</b> shows significantly more “{guardrail}”. Don’t ship.
            </div>
          )}
          {data?.variance_reduction > 0.001 && (
            <p className="type-body-12-400 text-[var(--color-text-subtle)] mb-2">CUPED applied — {(data.variance_reduction * 100).toFixed(0)}% variance reduction using pre-experiment engagement.</p>
          )}
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] type-caption text-[var(--color-text-muted)]">
                <th className="text-left py-2">Variant</th>
                <th className="text-right py-2">Exposed</th>
                <th className="text-right py-2">Rate (95% CI)</th>
                <th className="text-right py-2">Lift</th>
                <th className="text-right py-2">P(beat ctrl)</th>
                <th className="text-right py-2">Sample</th>
                {guardrail && <th className="text-right py-2">Guardrail</th>}
              </tr>
            </thead>
            <tbody>
              {variants.map(v => (
                <tr key={v.variant} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 type-small-body text-[var(--color-text)]">{v.variant}{v.is_control && <span className="ml-1.5 type-body-12-400 text-[var(--color-text-subtle)]">(control)</span>}</td>
                  <td className="py-2 text-right type-body-13 text-[var(--color-text-muted)]">{v.exposed.toLocaleString()} · {v.converted.toLocaleString()}</td>
                  <td className="py-2 text-right type-small-body text-[var(--color-text)]">{(v.rate * 100).toFixed(1)}%<span className="type-body-12-400 text-[var(--color-text-subtle)]"> [{(v.ci_low * 100).toFixed(1)}–{(v.ci_high * 100).toFixed(1)}]</span></td>
                  <td className={`py-2 text-right type-body-13 ${v.is_control ? 'text-[var(--color-text-subtle)]' : v.lift >= 0 ? 'text-emerald-600' : 'text-[#DE0202]'}`}>{v.is_control ? '—' : `${v.lift >= 0 ? '+' : ''}${(v.lift * 100).toFixed(1)}%`}</td>
                  <td className="py-2 text-right type-body-12-400">{v.is_control ? '—' : <span className={v.prob_beat_control >= 0.95 ? 'text-emerald-600' : 'text-[var(--color-text-muted)]'}>{(v.prob_beat_control * 100).toFixed(1)}%</span>}</td>
                  <td className="py-2 text-right type-body-12-400 text-[var(--color-text-subtle)]">{v.is_control ? '—' : v.sample_size > 0 ? <span className={v.sample_reached ? 'text-emerald-600' : ''}>{v.exposed.toLocaleString()}/{v.sample_size.toLocaleString()}</span> : '—'}</td>
                  {guardrail && <td className={`py-2 text-right type-body-12-400 ${v.guardrail_regression ? 'text-[#DE0202]' : 'text-[var(--color-text-subtle)]'}`}>{(v.guardrail_rate * 100).toFixed(1)}%</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export default function ExperimentsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const { events } = useTopEvents()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [rollout, setRollout] = useState(100)
  const [holdout, setHoldout] = useState(0)
  const [goal, setGoal] = useState('')
  const [exclGroup, setExclGroup] = useState('')
  const [prereqFlag, setPrereqFlag] = useState('')
  const [prereqVariant, setPrereqVariant] = useState('')
  const [rules, setRules] = useState<TargetRule[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['flags', projectId],
    queryFn: () => api.flags(projectId),
    enabled: !!projectId,
  })
  const flags: Flag[] = data?.flags ?? []

  async function save() {
    if (!key.trim() || !name.trim()) return
    await api.createFlag(projectId, {
      key: key.trim(), name: name.trim(), rollout, holdout, goal_event: goal,
      targeting: rules.filter(r => r.property && r.value && r.variant),
      exclusion_group: exclGroup.trim(), prereq_flag: prereqFlag.trim(), prereq_variant: prereqVariant.trim(),
    })
    setCreating(false); setKey(''); setName(''); setRollout(100); setHoldout(0); setGoal('')
    setExclGroup(''); setPrereqFlag(''); setPrereqVariant(''); setRules([])
    qc.invalidateQueries({ queryKey: ['flags', projectId] })
  }
  async function toggle(f: Flag) {
    await api.updateFlag(projectId, f.id, { ...f, enabled: !f.enabled })
    qc.invalidateQueries({ queryKey: ['flags', projectId] })
  }
  async function setRolloutPct(f: Flag, pct: number) {
    await api.updateFlag(projectId, f.id, { ...f, rollout: pct })
    qc.invalidateQueries({ queryKey: ['flags', projectId] })
  }
  async function remove(id: string) {
    await api.deleteFlag(projectId, id)
    qc.invalidateQueries({ queryKey: ['flags', projectId] })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Experiments & Feature Flags"
        subtitle="Roll out features gradually and A/B test them — variants assigned deterministically, results measured against a goal"
        actions={<button onClick={() => setCreating(v => !v)} className="btn-brand px-4 py-2 type-caption rounded-md flex items-center gap-1.5"><Plus className="h-4 w-4" /> New flag</button>}
      />

      {creating && (
        <Card>
          <h2 className="type-h3-16 text-[var(--color-text)] mb-4">Create a flag / experiment</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Key</span><input className="ctrl w-44" value={key} onChange={e => setKey(e.target.value.replace(/\s/g, '-').toLowerCase())} placeholder="new-checkout" /></div>
            <div className="flex-1 min-w-[180px]"><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Name</span><input className="ctrl w-full" value={name} onChange={e => setName(e.target.value)} placeholder="New checkout flow" /></div>
            <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Rollout %</span><input type="number" min={0} max={100} className="ctrl w-24" value={rollout} onChange={e => setRollout(Math.max(0, Math.min(100, Number(e.target.value))))} /></div>
            <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Holdout %</span><input type="number" min={0} max={100} className="ctrl w-24" value={holdout} onChange={e => setHoldout(Math.max(0, Math.min(100, Number(e.target.value))))} /></div>
            <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Goal event</span><div className="w-52"><EventSelect value={goal} onChange={setGoal} placeholder="(optional)" /></div></div>
            <button onClick={save} disabled={!key.trim() || !name.trim()} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">Create</button>
          </div>
          <p className="type-body-13 text-[var(--color-text-subtle)] mt-3">Defaults to a 50/50 <b>control</b> / <b>treatment</b> split. Evaluate it from your SDK with the key above.</p>

          <button onClick={() => setShowAdvanced(v => !v)} className="type-link text-[#0052F2] mt-3">{showAdvanced ? '− Hide' : '+ Advanced'} targeting, exclusion & prerequisites</button>
          {showAdvanced && (
            <div className="mt-3 space-y-4 border-t border-[var(--color-border)] pt-4">
              {/* Targeting rules */}
              <div>
                <span className="type-caption text-[var(--color-text-muted)] block mb-2">Targeting rules (matched users always get the variant)</span>
                {rules.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input className="ctrl w-36" placeholder="property" value={r.property} onChange={e => { const n = [...rules]; n[i] = { ...r, property: e.target.value }; setRules(n) }} />
                    <Select value={r.operator || 'is'} onChange={v => { const n = [...rules]; n[i] = { ...r, operator: v }; setRules(n) }} options={[{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, { value: 'contains', label: 'contains' }]} className="w-[110px]" />
                    <input className="ctrl w-36" placeholder="value" value={r.value} onChange={e => { const n = [...rules]; n[i] = { ...r, value: e.target.value }; setRules(n) }} />
                    <span className="type-body-13 text-[var(--color-text-subtle)]">→</span>
                    <input className="ctrl w-32" placeholder="variant" value={r.variant} onChange={e => { const n = [...rules]; n[i] = { ...r, variant: e.target.value }; setRules(n) }} />
                    <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="p-1.5 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button onClick={() => setRules([...rules, { property: '', operator: 'is', value: '', variant: 'treatment' }])} className="flex items-center gap-1.5 type-link text-[#0052F2]"><Plus className="h-4 w-4" /> Add rule</button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Mutual-exclusion group</span><input className="ctrl w-44" value={exclGroup} onChange={e => setExclGroup(e.target.value)} placeholder="(none)" /></div>
                <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Prerequisite flag key</span><input className="ctrl w-44" value={prereqFlag} onChange={e => setPrereqFlag(e.target.value)} placeholder="(none)" /></div>
                <div><span className="type-caption text-[var(--color-text-muted)] block mb-1.5">…must equal variant</span><input className="ctrl w-36" value={prereqVariant} onChange={e => setPrereqVariant(e.target.value)} placeholder="treatment" /></div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={6} /></div>
        ) : flags.length === 0 ? (
          <div className="py-14 text-center">
            <div className="inline-flex p-3 rounded-lg bg-[#EEF3FD] mb-3"><FlaskConical className="h-6 w-6 text-[#0052F2]" /></div>
            <p className="type-body-15 text-[var(--color-text-subtle)]">No flags yet — create one to roll out or A/B test a feature.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {flags.map(f => (
              <div key={f.id} className="px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="type-small-body text-[var(--color-text)]">{f.name}</span>
                      <code className="type-body-12-400 text-[#0052F2] bg-[#EEF3FD] px-1.5 rounded">{f.key}</code>
                    </div>
                    <div className="type-body-12-400 text-[var(--color-text-subtle)] mt-0.5">
                      {f.variants.map(v => `${v.key} ${v.weight}%`).join(' · ')} · rollout {f.rollout}%
                    </div>
                  </div>
                  <input type="range" min={0} max={100} value={f.rollout} onChange={e => setRolloutPct(f, Number(e.target.value))} className="w-28 accent-[#0052F2]" title={`Rollout ${f.rollout}%`} />
                  <button onClick={() => toggle(f)} className={`px-2.5 py-1 type-body-12-400 rounded-full ${f.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)]'}`}>{f.enabled ? 'on' : 'off'}</button>
                  <button onClick={() => setExpanded(expanded === f.id ? null : f.id)} className="p-2 text-[var(--color-text-subtle)] hover:text-[#0052F2]" title="Results"><BarChart3 className="h-4 w-4" /></button>
                  <button onClick={() => remove(f.id)} className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]"><Trash2 className="h-4 w-4" /></button>
                </div>
                {expanded === f.id && <ResultsPanel flag={f} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <SampleSizeCalc />
    </div>
  )
}

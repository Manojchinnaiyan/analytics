'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Trash2, Copy, Check, ShieldCheck, Mail, SlidersHorizontal, X, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore, usePermission } from '@/stores/project'
import { Select } from '@/components/ui/Select'

interface PermDef { key: string; section: string; label: string }
interface Member {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
  overrides: Record<string, boolean>
  created_at: string
}
interface Invite {
  id: string
  email: string
  name: string
  role: string
  invite_url: string
  expires_at: string
}

const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member',  label: 'Member' },
  { value: 'viewer',  label: 'Viewer' },
]

const roleBadge: Record<string, string> = {
  owner:   'bg-[#EEF3FD] text-[#0052F2]',
  admin:   'bg-violet-50 text-violet-700',
  manager: 'bg-sky-50 text-sky-700',
  member:  'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
  viewer:  'bg-amber-50 text-amber-700',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center gap-1 type-link text-[#0052F2] hover:text-[#0C3FA7]"
    >
      {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
    </button>
  )
}

// Per-member permission matrix. Checkboxes show the member's EFFECTIVE perms;
// saving pins them as explicit overrides; reset clears back to role defaults.
function PermissionEditor({ member, catalog, onClose, onSaved }: {
  member: Member; catalog: PermDef[]; onClose: () => void; onSaved: () => void
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const d of catalog) init[d.key] = member.permissions.includes(d.key)
    return init
  })
  const [saving, setSaving] = useState(false)

  const sections = [...new Set(catalog.map(d => d.section))]
  const customized = Object.keys(member.overrides ?? {}).length > 0

  async function save() {
    setSaving(true)
    try {
      // Send a full explicit map so effective perms == exactly what's checked.
      await api.setMemberPermissions(member.id, checked)
      onSaved()
    } finally { setSaving(false) }
  }
  async function reset() {
    setSaving(true)
    try { await api.setMemberPermissions(member.id, {}); onSaved() } finally { setSaving(false) }
  }

  return (
    <div className="mt-2 mb-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#0052F2]" />
          <span className="type-small-body text-[var(--color-text)]">Permissions · {member.name || member.email}</span>
          {customized && <span className="type-body-12-400 text-[#0052F2] bg-[#EEF3FD] px-2 py-0.5 rounded-full">Customized</span>}
        </div>
        <button onClick={onClose} className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
        {sections.map(section => (
          <div key={section}>
            <p className="type-body-12-400 uppercase tracking-wide text-[var(--color-text-subtle)] mb-1.5">{section}</p>
            <div className="space-y-1.5">
              {catalog.filter(d => d.section === section).map(d => (
                <label key={d.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checked[d.key]}
                    onChange={e => setChecked(c => ({ ...c, [d.key]: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[#0052F2]"
                  />
                  <span className="type-body-13 text-[var(--color-text)]">{d.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">
          {saving ? 'Saving…' : 'Save permissions'}
        </button>
        {customized && (
          <button onClick={reset} disabled={saving} className="inline-flex items-center gap-1.5 type-caption text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to role default
          </button>
        )}
      </div>
    </div>
  )
}

export function TeamSection() {
  const role = useProjectStore(s => s.role)
  const email = useProjectStore(s => s.email)
  const can = usePermission()
  const qc = useQueryClient()
  const canManage = can('team.manage')

  const [inviting, setInviting] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [saving, setSaving] = useState(false)
  const [lastInvite, setLastInvite] = useState<{ email: string; url: string; emailSent: boolean } | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['team'], queryFn: () => api.team() })
  const { data: invData } = useQuery({ queryKey: ['team-invites'], queryFn: () => api.invites(), enabled: canManage })

  const members: Member[] = data?.members ?? []
  const catalog: PermDef[] = data?.catalog ?? []
  const invites: Invite[] = invData?.invites ?? []

  function refresh() {
    qc.invalidateQueries({ queryKey: ['team'] })
    qc.invalidateQueries({ queryKey: ['team-invites'] })
  }

  async function sendInvite() {
    setSaving(true); setError('')
    try {
      const res = await api.inviteMember({ email: newEmail.trim(), name: newName.trim(), role: newRole })
      setLastInvite({ email: res.email, url: res.invite_url, emailSent: res.email_sent })
      setNewEmail(''); setNewName(''); setNewRole('member'); setInviting(false)
      refresh()
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send invite')
    } finally { setSaving(false) }
  }

  async function changeRole(id: string, r: string) { await api.updateMemberRole(id, r); refresh() }
  async function remove(id: string) { await api.removeMember(id); refresh() }
  async function revoke(id: string) { await api.revokeInvite(id); refresh() }

  return (
    <section className="glass rounded-lg p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#0052F2]" />
          <h2 className="type-h3-16 text-[#0f172a]">Team & permissions</h2>
        </div>
        {canManage && (
          <button
            onClick={() => { setInviting(v => !v); setError('') }}
            className="inline-flex items-center gap-1.5 px-3 py-2 type-caption rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <UserPlus className="h-4 w-4" /> Invite member
          </button>
        )}
      </div>

      {!canManage && (
        <p className="type-body-13 text-[var(--color-text-subtle)] mb-3">
          You have <b className="capitalize">{role || 'member'}</b> access. Only members with team management permission can invite or edit the team.
        </p>
      )}

      {/* Invite result (link + email status) */}
      {lastInvite && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="type-body-13 text-emerald-800">
            Invite created for <b>{lastInvite.email}</b>.{' '}
            {lastInvite.emailSent ? 'An email with the set-password link was sent.' : 'Email isn’t configured — share this link so they can set a password:'}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <code className="flex-1 type-caption-12-400 text-emerald-900 bg-white rounded px-3 py-2 border border-emerald-200 truncate">{lastInvite.url}</code>
            <CopyButton text={lastInvite.url} />
          </div>
        </div>
      )}

      {/* Invite form */}
      {inviting && canManage && (
        <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Email</span>
              <input className="ctrl w-full" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="teammate@company.com" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Name</span>
              <input className="ctrl w-full" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <span className="type-caption text-[var(--color-text-muted)] block mb-1.5">Role</span>
              <Select value={newRole} onChange={setNewRole} options={ROLE_OPTIONS} className="w-[130px]" />
            </div>
            <button onClick={sendInvite} disabled={saving || !newEmail.trim()} className="btn-brand px-4 py-2 type-caption rounded-md disabled:opacity-50">
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          <p className="type-body-12-400 text-[var(--color-text-subtle)] mt-2">
            They’ll set their own password via the invite link. Fine-tune individual permissions after they join.
          </p>
          {error && <p className="type-body-13 text-[#DE0202] mt-2">{error}</p>}
        </div>
      )}

      {/* Pending invites */}
      {canManage && invites.length > 0 && (
        <div className="mb-4">
          <p className="type-body-12-400 uppercase tracking-wide text-[var(--color-text-subtle)] mb-2">Pending invites</p>
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5">
                <Mail className="h-4 w-4 text-[var(--color-text-subtle)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="type-body-13 text-[var(--color-text)] truncate">{inv.email}</div>
                  <div className="type-body-12-400 text-[var(--color-text-subtle)] capitalize">{inv.role} · pending</div>
                </div>
                <CopyButton text={inv.invite_url} />
                <button onClick={() => revoke(inv.id)} title="Revoke invite" className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      {isLoading ? (
        <p className="type-body-13 text-[var(--color-text-subtle)] py-3">Loading…</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {members.map(m => {
            const isOwner = m.role === 'owner'
            const isSelf = m.email === email
            const customized = Object.keys(m.overrides ?? {}).length > 0
            return (
              <div key={m.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0052F2] text-white flex items-center justify-center type-caption flex-shrink-0">
                    {(m.name || m.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="type-small-body text-[var(--color-text)] truncate">
                      {m.name || m.email} {isSelf && <span className="type-body-12-400 text-[var(--color-text-subtle)]">(you)</span>}
                      {customized && <span className="ml-2 type-body-12-400 text-[#0052F2] bg-[#EEF3FD] px-2 py-0.5 rounded-full">Custom perms</span>}
                    </div>
                    <div className="type-body-12-400 text-[var(--color-text-subtle)] truncate">{m.email}</div>
                  </div>

                  {canManage && !isOwner ? (
                    <Select value={m.role} onChange={(r) => changeRole(m.id, r)} options={ROLE_OPTIONS} className="w-[120px]" />
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full type-body-12-400 capitalize ${roleBadge[m.role] || roleBadge.member}`}>
                      {isOwner && <ShieldCheck className="h-3 w-3" />}{m.role}
                    </span>
                  )}

                  {canManage && !isOwner ? (
                    <button
                      onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                      title="Edit permissions"
                      className={`p-2 transition-colors ${editingId === m.id ? 'text-[#0052F2]' : 'text-[var(--color-text-subtle)] hover:text-[var(--color-text)]'}`}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                  ) : <span className="w-8" />}

                  {canManage && !isOwner && !isSelf ? (
                    <button onClick={() => remove(m.id)} title="Remove member" className="p-2 text-[var(--color-text-subtle)] hover:text-[#DE0202] transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : <span className="w-8" />}
                </div>

                {editingId === m.id && canManage && !isOwner && (
                  <PermissionEditor
                    member={m}
                    catalog={catalog}
                    onClose={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); refresh() }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

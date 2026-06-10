'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { authApi, saveToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { AuthShell } from '@/components/marketing/AuthShell'

const FIELDS = [
  { label: 'Full name',    field: 'name',     type: 'text',     placeholder: 'Manoj Chinnaiyan' },
  { label: 'Email',        field: 'email',    type: 'email',    placeholder: 'you@company.com' },
  { label: 'Password',     field: 'password', type: 'password', placeholder: '••••••••' },
  { label: 'Company name', field: 'org_name', type: 'text',     placeholder: 'Acme Inc' },
  { label: 'Company slug', field: 'org_slug', type: 'text',     placeholder: 'acme' },
] as const

type FormState = { name: string; email: string; password: string; org_name: string; org_slug: string }

const inputCls =
  'w-full border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)] transition-all'

export default function SignupPage() {
  const router = useRouter()
  const setProject = useProjectStore(s => s.setProject)
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', org_name: '', org_slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.signup(form)
      saveToken(res.token)
      setProject({
        projectId: res.project_id ?? '', apiKey: res.api_key ?? '', orgId: res.org_id,
        userName: res.name ?? form.name, email: res.email ?? form.email,
        projectName: res.project_name ?? (form.org_name + ' (Default)'),
      })
      router.push('/welcome')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-text)]">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">Free to start — no credit card.</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        {FIELDS.map(({ label, field, type, placeholder }) => (
          <div key={field}>
            <label htmlFor={field} className="text-[13px] font-medium text-[var(--color-text)] block mb-1.5">{label}</label>
            <input id={field} type={type} required value={form[field]} onChange={set(field)} className={inputCls} placeholder={placeholder} />
          </div>
        ))}
        {error && <p className="text-[14px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button type="submit" disabled={loading} className="group w-full py-2.5 bg-[var(--color-brand)] text-white rounded-xl text-[15px] font-medium hover:bg-[var(--color-brand-hover)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2 mt-1">
          {loading ? 'Creating account…' : <>Create account <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-[var(--color-text-muted)]">
        Already have an account? <a href="/login" className="font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]">Sign in</a>
      </p>
    </AuthShell>
  )
}

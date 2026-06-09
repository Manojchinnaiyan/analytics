'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, saveToken } from '@/lib/auth'
import { useProjectStore } from '@/stores/project'
import { brand } from '@/config/brand'

const FIELDS = [
  { label: 'Full name',    field: 'name',     type: 'text',     placeholder: 'Manoj Chinnaiyan' },
  { label: 'Email',        field: 'email',    type: 'email',    placeholder: 'you@company.com' },
  { label: 'Password',     field: 'password', type: 'password', placeholder: '••••••••' },
  { label: 'Company name', field: 'org_name', type: 'text',     placeholder: 'Acme Inc' },
  { label: 'Company slug', field: 'org_slug', type: 'text',     placeholder: 'acme' },
] as const

type FormState = { name: string; email: string; password: string; org_name: string; org_slug: string }

export default function SignupPage() {
  const router = useRouter()
  const setProject = useProjectStore(s => s.setProject)
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', org_name: '', org_slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.signup(form)
      saveToken(res.token)
      setProject({
        projectId:   res.project_id ?? '',
        apiKey:      res.api_key ?? '',
        orgId:       res.org_id,
        userName:    res.name ?? form.name,
        email:       res.email ?? form.email,
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
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="type-h3-16 text-[#0052F2]">{brand.name}</span>
          <p className="type-body-13 text-[#64748b] mt-1">Create your account — it's free</p>
        </div>

        <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {FIELDS.map(({ label, field, type, placeholder }) => (
              <div key={field}>
                <label htmlFor={field} className="type-caption text-[#0f172a] block mb-1.5">{label}</label>
                <input
                  id={field}
                  type={type}
                  required
                  value={form[field]}
                  onChange={set(field)}
                  className="w-full border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 type-body-15 text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-transparent transition-all"
                  placeholder={placeholder}
                />
              </div>
            ))}

            {error && <p className="type-body-13 text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0052F2] text-white rounded-xl type-small-body hover:bg-[#0C3FA7] disabled:opacity-50 transition-colors mt-2"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center type-body-13 text-[#64748b] mt-5">
          Already have an account?{' '}
          <a href="/login" className="type-link text-[#0052F2] hover:text-blue-700">Sign in</a>
        </p>
      </div>
    </div>
  )
}

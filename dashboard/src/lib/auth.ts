import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001',
})

export interface AuthResponse {
  token: string
  user_id: string
  org_id: string
  role?: string
  name?: string
  email?: string
  project_id?: string
  project_name?: string
  api_key?: string
}

export const authApi = {
  login: (email: string, password: string): Promise<AuthResponse> =>
    api.post('/v1/auth/login', { email, password }).then(r => r.data),

  // Signup no longer returns a session — it requires email verification first.
  signup: (body: {
    email: string
    password: string
    name: string
    org_name: string
    org_slug: string
  }): Promise<{ verification_required: boolean; email: string }> =>
    api.post('/v1/auth/signup', body).then(r => r.data),

  // Verify the email token → returns a full session (same shape as login).
  verifyEmail: (token: string): Promise<AuthResponse> =>
    api.post('/v1/auth/verify-email', { token }).then(r => r.data),

  resendVerification: (email: string): Promise<{ message: string }> =>
    api.post('/v1/auth/verify-email/resend', { email }).then(r => r.data),

  forgotPassword: (email: string): Promise<{ message: string }> =>
    api.post('/v1/auth/forgot', { email }).then(r => r.data),

  resetPassword: (token: string, password: string): Promise<{ message: string }> =>
    api.post('/v1/auth/reset', { token, password }).then(r => r.data),
}

const TOKEN_KEY = 'amp_token'

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  if (globalThis.window === undefined) return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

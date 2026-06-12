import axios from 'axios'
import { getToken, clearToken } from './auth'

const queryApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request — all /v1/query/* routes are protected.
queryApi.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, clear the stale token and bounce to login.
queryApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401 && globalThis.window !== undefined) {
      clearToken()
      globalThis.window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export interface Filter {
  property: string
  operator: 'is' | 'is_not' | 'contains' | 'greater_than' | 'less_than'
  value: string
  type?: 'event' | 'user' | 'system' | 'derived'
}

export interface SegmentationParams {
  project_id: string
  event_type: string
  start: string
  end: string
  granularity?: 'day' | 'week' | 'month'
  metric?: 'totals' | 'uniques' | 'frequency' | 'sum' | 'average' | 'median' | 'p90' | 'p95' | 'p99'
  property?: string
  group_by?: string
  filters?: Filter[]
  cohort_id?: string
  compare?: boolean
}

export interface FunnelParams {
  project_id: string
  steps: { event_type: string }[]
  start: string
  end: string
  window_days?: number
  window_value?: number
  window_unit?: 'minute' | 'hour' | 'day'
  mode?: 'ordered' | 'strict' | 'any'
  breakdown?: string
  counted_by?: 'users' | 'sessions'
  exclusions?: string[]
  filters?: Filter[]
  cohort_id?: string
}

export interface RetentionParams {
  project_id: string
  start_event: string
  return_event: string
  start: string
  end: string
  periods?: number
  mode?: 'nday' | 'unbounded'
  granularity?: 'day' | 'week' | 'month'
  filters?: Filter[]
  cohort_id?: string
}

export interface EventType {
  event_type: string
  count: number
}

export const api = {
  segmentation: (params: SegmentationParams) =>
    queryApi.post('/v1/query/segmentation', params).then(r => r.data),

  funnel: (params: FunnelParams) =>
    queryApi.post('/v1/query/funnel', params).then(r => r.data),

  retention: (params: RetentionParams) =>
    queryApi.post('/v1/query/retention', params).then(r => r.data),

  paths: (params: { project_id: string; start_event: string; start: string; end: string; depth?: number; direction?: 'forward' | 'backward'; exclude?: string[] }) =>
    queryApi.post('/v1/query/paths', params).then(r => r.data),

  formula: (params: { project_id: string; start: string; end: string; granularity?: string; metrics: { key: string; event_type: string; metric: string }[] }) =>
    queryApi.post('/v1/query/formula', params).then(r => r.data),

  onboarding: (params: { project_id: string; steps: string[]; start: string; end: string; ttv_days?: number; breakdown?: string }) =>
    queryApi.post('/v1/query/onboarding', params).then(r => r.data),

  overview: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/overview`).then(r => r.data),

  eventTypes: (projectId: string): Promise<{ event_types: EventType[] }> =>
    queryApi.get(`/v1/projects/${projectId}/events/types`).then(r => r.data),

  properties: (projectId: string): Promise<{ event_properties: { key: string; count: number }[]; user_properties: { key: string; count: number }[]; system_properties: { key: string }[] }> =>
    queryApi.get(`/v1/projects/${projectId}/properties`).then(r => r.data),
  propertyDetail: (projectId: string, key: string, type: string) =>
    queryApi.get(`/v1/projects/${projectId}/properties/detail`, { params: { key, type } }).then(r => r.data),
  derived: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/derived`).then(r => r.data),
  createDerived: (projectId: string, body: Record<string, string>) =>
    queryApi.post(`/v1/projects/${projectId}/derived`, body).then(r => r.data),
  deleteDerived: (projectId: string, derivedId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/derived/${derivedId}`).then(r => r.data),

  users: (projectId: string, search = '') =>
    queryApi.get(`/v1/projects/${projectId}/users`, { params: { search } }).then(r => r.data),

  userProfile: (projectId: string, userId: string) =>
    queryApi.get(`/v1/projects/${projectId}/users/${encodeURIComponent(userId)}`).then(r => r.data),

  attribution: (projectId: string, conversion = '', model = 'first_touch') =>
    queryApi.get(`/v1/projects/${projectId}/attribution`, { params: { conversion, model } }).then(r => r.data),

  productOverview: (projectId: string, days = 30) =>
    queryApi.get(`/v1/projects/${projectId}/product-overview`, { params: { days } }).then(r => r.data),

  featureEngagement: (projectId: string, days = 30, filters?: Filter[], group?: 'features') =>
    queryApi.get(`/v1/projects/${projectId}/feature-engagement`, {
      params: { days, ...(group ? { group } : {}), ...(filters?.length ? { filters: JSON.stringify(filters) } : {}) },
    }).then(r => r.data),
  features: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/features`).then(r => r.data),
  createFeature: (projectId: string, body: { name: string; events: string[] }) =>
    queryApi.post(`/v1/projects/${projectId}/features`, body).then(r => r.data),
  deleteFeature: (projectId: string, featureId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/features/${featureId}`).then(r => r.data),
  featureRetention: (projectId: string, event: string, days = 30, filters?: Filter[]) =>
    queryApi.get(`/v1/projects/${projectId}/feature-retention`, {
      params: { event, days, ...(filters?.length ? { filters: JSON.stringify(filters) } : {}) },
    }).then(r => r.data),

  liveEvents: (projectId: string, params: { limit?: number; after?: number; event_type?: string; search?: string } = {}) =>
    queryApi.get(`/v1/projects/${projectId}/events/live`, { params }).then(r => r.data),

  lifecycle: (projectId: string, days = 30) =>
    queryApi.get(`/v1/projects/${projectId}/lifecycle`, { params: { days } }).then(r => r.data),

  webAnalytics: (projectId: string, days = 30, filters: Record<string, string> = {}) =>
    queryApi.get(`/v1/projects/${projectId}/web-analytics`, { params: { days, ...filters } }).then(r => r.data),
  webGoals: (projectId: string, days = 30, filters: Record<string, string> = {}) =>
    queryApi.get(`/v1/projects/${projectId}/web/goals`, { params: { days, ...filters } }).then(r => r.data),
  webVitals: (projectId: string, days = 30, filters: Record<string, string> = {}) =>
    queryApi.get(`/v1/projects/${projectId}/web/vitals`, { params: { days, ...filters } }).then(r => r.data),
  webEngagement: (projectId: string, days = 30, filters: Record<string, string> = {}) =>
    queryApi.get(`/v1/projects/${projectId}/web/engagement`, { params: { days, ...filters } }).then(r => r.data),
  createWebGoal: (projectId: string, body: { name: string; type: string; match: string }) =>
    queryApi.post(`/v1/projects/${projectId}/web/goals`, body).then(r => r.data),
  deleteWebGoal: (projectId: string, goalId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/web/goals/${goalId}`).then(r => r.data),

  revenue: (projectId: string, days = 30) =>
    queryApi.get(`/v1/projects/${projectId}/revenue`, { params: { days } }).then(r => r.data),

  gdprExport: (projectId: string, subject: { user_id?: string; device_id?: string }) =>
    queryApi.post(`/v1/projects/${projectId}/gdpr/export`, subject).then(r => r.data),
  gdprDelete: (projectId: string, subject: { user_id?: string; device_id?: string }) =>
    queryApi.post(`/v1/projects/${projectId}/gdpr/delete`, subject).then(r => r.data),

  usage: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/usage`).then(r => r.data),
  setUsageLimit: (projectId: string, eventLimit: number) =>
    queryApi.put(`/v1/projects/${projectId}/usage/limit`, { event_limit: eventLimit }).then(r => r.data),

  me: () => queryApi.get('/v1/me').then(r => r.data),

  ssoConfig: () => queryApi.get('/v1/orgs/sso').then(r => r.data),
  setSSO: (body: { issuer: string; client_id: string; client_secret?: string; enabled?: boolean }) =>
    queryApi.put('/v1/orgs/sso', body).then(r => r.data),
  refreshToken: (): Promise<{ token: string }> =>
    queryApi.post('/v1/auth/refresh').then(r => r.data),

  projects: () => queryApi.get('/v1/projects').then(r => r.data),
  createProject: (name: string) => queryApi.post('/v1/projects', { name }).then(r => r.data),
  project: (projectId: string) => queryApi.get(`/v1/projects/${projectId}`).then(r => r.data),
  setTimezone: (projectId: string, timezone: string) =>
    queryApi.put(`/v1/projects/${projectId}/timezone`, { timezone }).then(r => r.data),

  links: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/links`).then(r => r.data),
  createLink: (projectId: string, body: Record<string, string>) =>
    queryApi.post(`/v1/projects/${projectId}/links`, body).then(r => r.data),
  deleteLink: (projectId: string, linkId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/links/${linkId}`).then(r => r.data),

  cohorts: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/cohorts`).then(r => r.data),
  createCohort: (projectId: string, body: Record<string, unknown>) =>
    queryApi.post(`/v1/projects/${projectId}/cohorts`, body).then(r => r.data),
  deleteCohort: (projectId: string, cohortId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/cohorts/${cohortId}`).then(r => r.data),

  audit: () => queryApi.get('/v1/audit').then(r => r.data),

  team: () => queryApi.get('/v1/team').then(r => r.data),
  addMember: (body: { email: string; name: string; role: string }) =>
    queryApi.post('/v1/team', body).then(r => r.data),
  updateMemberRole: (userId: string, role: string) =>
    queryApi.put(`/v1/team/${userId}`, { role }).then(r => r.data),
  setMemberPermissions: (userId: string, permissions: Record<string, boolean>) =>
    queryApi.put(`/v1/team/${userId}/permissions`, { permissions }).then(r => r.data),
  removeMember: (userId: string) =>
    queryApi.delete(`/v1/team/${userId}`).then(r => r.data),

  inviteMember: (body: { email: string; name: string; role: string; permissions?: Record<string, boolean> }) =>
    queryApi.post('/v1/team/invite', body).then(r => r.data),
  invites: () => queryApi.get('/v1/team/invites').then(r => r.data),
  revokeInvite: (id: string) => queryApi.delete(`/v1/team/invites/${id}`).then(r => r.data),
  // Public invite-accept flow (no auth).
  getInvite: (token: string) => queryApi.get(`/invite/${token}`).then(r => r.data),
  acceptInvite: (token: string, body: { name?: string; password: string }) =>
    queryApi.post(`/invite/${token}/accept`, body).then(r => r.data),

  runSql: (projectId: string, query: string) =>
    queryApi.post(`/v1/projects/${projectId}/sql`, { query }).then(r => r.data),
  savedQueries: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/sql/saved`).then(r => r.data),
  saveQuery: (projectId: string, name: string, query: string) =>
    queryApi.post(`/v1/projects/${projectId}/sql/saved`, { name, query }).then(r => r.data),
  deleteQuery: (projectId: string, queryId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/sql/saved/${queryId}`).then(r => r.data),

  replays: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/replays`).then(r => r.data),
  replay: (projectId: string, sessionId: string) =>
    queryApi.get(`/v1/projects/${projectId}/replays/${encodeURIComponent(sessionId)}`).then(r => r.data),
  deleteReplay: (projectId: string, sessionId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/replays/${encodeURIComponent(sessionId)}`).then(r => r.data),

  flags: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/flags`).then(r => r.data),
  createFlag: (projectId: string, body: Record<string, unknown>) =>
    queryApi.post(`/v1/projects/${projectId}/flags`, body).then(r => r.data),
  updateFlag: (projectId: string, flagId: string, body: Record<string, unknown>) =>
    queryApi.put(`/v1/projects/${projectId}/flags/${flagId}`, body).then(r => r.data),
  deleteFlag: (projectId: string, flagId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/flags/${flagId}`).then(r => r.data),
  flagResults: (projectId: string, flagId: string, goal?: string, guardrail?: string) =>
    queryApi.get(`/v1/projects/${projectId}/flags/${flagId}/results`, { params: { goal, guardrail } }).then(r => r.data),

  exports: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/exports`).then(r => r.data),
  createExport: (projectId: string, body: Record<string, unknown>) =>
    queryApi.post(`/v1/projects/${projectId}/exports`, body).then(r => r.data),
  runExport: (projectId: string, exportId: string) =>
    queryApi.post(`/v1/projects/${projectId}/exports/${exportId}/run`).then(r => r.data),
  deleteExport: (projectId: string, exportId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/exports/${exportId}`).then(r => r.data),

  taxonomy: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/taxonomy`).then(r => r.data),
  updateTaxonomy: (projectId: string, body: { event: string; description: string; status: string; expected_properties?: string }) =>
    queryApi.put(`/v1/projects/${projectId}/taxonomy`, body).then(r => r.data),

  annotations: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/annotations`).then(r => r.data),
  createAnnotation: (projectId: string, body: { date: string; label: string }) =>
    queryApi.post(`/v1/projects/${projectId}/annotations`, body).then(r => r.data),
  deleteAnnotation: (projectId: string, annId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/annotations/${annId}`).then(r => r.data),

  alerts: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/alerts`).then(r => r.data),
  alertEvents: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/alerts/events`).then(r => r.data),
  createAlert: (projectId: string, body: Record<string, unknown>) =>
    queryApi.post(`/v1/projects/${projectId}/alerts`, body).then(r => r.data),
  updateAlert: (projectId: string, alertId: string, body: Record<string, unknown>) =>
    queryApi.put(`/v1/projects/${projectId}/alerts/${alertId}`, body).then(r => r.data),
  deleteAlert: (projectId: string, alertId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/alerts/${alertId}`).then(r => r.data),

  dashboards: (projectId: string) =>
    queryApi.get(`/v1/projects/${projectId}/dashboard`).then(r => r.data),
  saveDashboardChart: (projectId: string, chart: Record<string, unknown>) =>
    queryApi.post(`/v1/projects/${projectId}/dashboard/charts`, chart).then(r => r.data),
  deleteDashboardChart: (projectId: string, chartId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/dashboard/charts/${chartId}`).then(r => r.data),

  // Public dashboard sharing
  getDashboardShare: (projectId: string): Promise<{ token: string | null }> =>
    queryApi.get(`/v1/projects/${projectId}/dashboard/share`).then(r => r.data),
  enableDashboardShare: (projectId: string): Promise<{ token: string }> =>
    queryApi.post(`/v1/projects/${projectId}/dashboard/share`).then(r => r.data),
  disableDashboardShare: (projectId: string) =>
    queryApi.delete(`/v1/projects/${projectId}/dashboard/share`).then(r => r.data),

  // Shopify integration
  shopifyConnections: (): Promise<{ connections: ShopifyConnection[]; configured: boolean }> =>
    queryApi.get('/v1/shopify/connections').then(r => r.data),
  shopifyConnect: (shop: string, projectId: string): Promise<{ url: string }> =>
    queryApi.post('/v1/shopify/connect', { shop, project_id: projectId }).then(r => r.data),

  // Ecommerce
  ecommerceOverview: (projectId: string, days: number): Promise<EcommerceOverview> =>
    queryApi.get(`/v1/projects/${projectId}/ecommerce/overview`, { params: { days } }).then(r => r.data),
  ecommerceProducts: (projectId: string, days: number): Promise<{ products: EcommerceProduct[] }> =>
    queryApi.get(`/v1/projects/${projectId}/ecommerce/products`, { params: { days } }).then(r => r.data),
}

export interface ShopifyConnection {
  shop: string
  project_id: string
  project_name: string
  installed_at: string
  uninstalled_at: string | null
  connected: boolean
}

export interface EcommerceOverview {
  revenue: number
  orders: number
  units: number
  aov: number
  sessions: number
  conversion: number
  funnel: { viewed: number; carted: number; checkout: number; purchased: number }
  trend: { date: string; revenue: number; orders: number; views: number }[]
}

export interface EcommerceProduct {
  product: string
  views: number
  carts: number
  units: number
  revenue: number
}

/** Public (no-auth) base for the read-only shared dashboard. */
export const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_QUERY_API_URL ?? 'http://localhost:4001'

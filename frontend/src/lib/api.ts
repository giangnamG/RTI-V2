const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi không xác định')
  return json
}

// ── Workspace ──────────────────────────────────────────
export interface Workspace {
  id: string
  name: string
  description: string
  color: string
  target_count: number
  created_at: string
  updated_at: string
}

export const workspaceApi = {
  list: () => request<{ data: Workspace[] }>('/api/workspaces').then(r => r.data),
  get:  (id: string) => request<{ data: Workspace }>(`/api/workspaces/${id}`).then(r => r.data),
  create: (body: { name: string; description?: string; color?: string }) =>
    request<{ data: Workspace }>('/api/workspaces', { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),
  update: (id: string, body: { name: string; description?: string; color?: string }) =>
    request<{ data: Workspace }>(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data),
  delete: (id: string) =>
    request<{ message: string }>(`/api/workspaces/${id}`, { method: 'DELETE' }),
}

// ── Target ─────────────────────────────────────────────
export interface Target {
  id: string
  workspace_id: string
  domain: string
  ip_address: string | null
  notes: string
  is_active: boolean
  created_at: string
}

export interface BulkCreateResult {
  data: Target[]
  total: number
  created: number
  skipped: number
}

export const targetApi = {
  list: (wsid: string) =>
    request<{ data: Target[] }>(`/api/workspaces/${wsid}/targets`).then(r => r.data),
  get: (wsid: string, id: string) =>
    request<{ data: Target }>(`/api/workspaces/${wsid}/targets/${id}`).then(r => r.data),
  create: (wsid: string, body: { domain: string; ip_address?: string; notes?: string }) =>
    request<{ data: Target }>(`/api/workspaces/${wsid}/targets`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),
  bulkCreate: (wsid: string, domains: string, notes?: string) =>
    request<BulkCreateResult>(`/api/workspaces/${wsid}/targets/bulk`, {
      method: 'POST',
      body: JSON.stringify({ domains, notes }),
    }),
  update: (wsid: string, id: string, body: { domain: string; ip_address?: string; notes?: string; is_active?: boolean }) =>
    request<{ data: Target }>(`/api/workspaces/${wsid}/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data),
  delete: (wsid: string, id: string) =>
    request<{ message: string }>(`/api/workspaces/${wsid}/targets/${id}`, { method: 'DELETE' }),
}

// ── Job ────────────────────────────────────────────────
export interface Job {
  id: string
  workspace_id: string
  target_id: string | null
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  payload: Record<string, unknown>
  result: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export const jobApi = {
  list: (wsid: string) =>
    request<{ data: Job[] }>(`/api/workspaces/${wsid}/jobs`).then(r => r.data),
  get: (wsid: string, id: string) =>
    request<{ data: Job }>(`/api/workspaces/${wsid}/jobs/${id}`).then(r => r.data),
  create: (wsid: string, body: { job_type: string; target_id?: string; payload?: Record<string, unknown> }) =>
    request<{ data: Job }>(`/api/workspaces/${wsid}/jobs`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),
}

// ── Subdomain ──────────────────────────────────────────
export interface Subdomain {
  id: string
  workspace_id: string
  target_id: string
  job_id: string | null
  domain: string
  ip_addresses: string[]
  sources: string[]
  is_alive: boolean | null
  http_status: number | null
  title: string | null
  created_at: string
  updated_at: string
}

export const subdomainApi = {
  list: (wsid: string) =>
    request<{ data: Subdomain[]; total: number }>(`/api/workspaces/${wsid}/subdomains`).then(r => r),
  history: (wsid: string, domain: string) =>
    request<{ data: Subdomain[]; total: number }>(
      `/api/workspaces/${wsid}/subdomains/history?domain=${encodeURIComponent(domain)}`
    ).then(r => r),
}

// ── Port ───────────────────────────────────────────────
export interface Port {
  id: string
  workspace_id: string
  target_id: string | null
  job_id: string | null
  host: string
  ip_address: string | null
  port: number
  protocol: string
  state: string
  service_name: string | null
  service_category: string | null
  banner: string | null
  created_at: string
  updated_at: string
}

export const portApi = {
  list: (wsid: string) =>
    request<{ data: Port[]; total: number }>(`/api/workspaces/${wsid}/ports`).then(r => r),
  history: (wsid: string, host: string) =>
    request<{ data: Port[]; total: number }>(
      `/api/workspaces/${wsid}/ports/history?host=${encodeURIComponent(host)}`
    ).then(r => r),
  updateServiceInfo: (wsid: string, portId: string, body: { service_name: string; service_category: string }) =>
    request<{ message: string }>(
      `/api/workspaces/${wsid}/ports/${portId}/service`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),
}

// ── Service Category ───────────────────────────────────
export interface ServiceCategory {
  id: string
  name: string
  label: string
  description: string
  color: string
  service_names: string[]
  module_types: string[]
  created_at: string
  updated_at: string
}

export const categoryApi = {
  list: () =>
    request<{ data: ServiceCategory[]; total: number }>('/api/service-categories').then(r => r),
  create: (body: { name: string; label: string; description?: string; color?: string; service_names?: string[]; module_types?: string[] }) =>
    request<{ data: ServiceCategory }>('/api/service-categories', { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),
  update: (id: string, body: { name: string; label: string; description?: string; color?: string; service_names?: string[]; module_types?: string[] }) =>
    request<{ data: ServiceCategory }>(`/api/service-categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data),
  delete: (id: string) =>
    request<{ message: string }>(`/api/service-categories/${id}`, { method: 'DELETE' }),
}

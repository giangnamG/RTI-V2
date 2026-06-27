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

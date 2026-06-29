const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

// ── Web Probe ──────────────────────────────────────────
export interface WebProbe {
  id: string
  workspace_id: string
  target_id: string | null
  job_id: string | null
  host: string
  port: number
  url: string
  scheme: string | null
  status_code: number | null
  title: string | null
  web_server: string | null
  technologies: string[]
  content_type: string | null
  content_length: number | null
  response_time: string | null
  ip_address: string | null
  is_alive: boolean
  created_at: string
  updated_at: string
}

export const webProbeApi = {
  list: (wsid: string) =>
    request<{ data: WebProbe[]; total: number }>(`/api/workspaces/${wsid}/web-probes`).then(r => r),
  history: (wsid: string, host: string) =>
    request<{ data: WebProbe[]; total: number }>(
      `/api/workspaces/${wsid}/web-probes/history?host=${encodeURIComponent(host)}`
    ).then(r => r),
}

// ── Web Crawl ──────────────────────────────────────────────
export interface WebCrawlURL {
  id:           string
  workspace_id: string
  target_id:    string | null
  job_id:       string | null
  base_url:     string
  url:          string
  method:       string
  status_code:  number | null
  content_type: string | null
  source_tag:   string | null
  source_attr:  string | null
  source_url:   string | null
  depth:        number
  created_at:   string
}

export interface WebCrawlStats {
  total:     number
  by_source: Record<string, number>
}

export const webCrawlApi = {
  list: (wsid: string, params?: { base_url?: string }) => {
    const q = new URLSearchParams()
    if (params?.base_url) q.set('base_url', params.base_url)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: WebCrawlURL[]; total: number; stats: WebCrawlStats }>(
      `/api/workspaces/${wsid}/web-crawl${qs}`
    )
  },
  history: (wsid: string, jobId: string) =>
    request<{ data: WebCrawlURL[]; total: number }>(
      `/api/workspaces/${wsid}/web-crawl/history?job_id=${jobId}`
    ).then(r => r),
}

// ── Fuzz Endpoints ────────────────────────────────────
export interface FuzzParam {
  name:      string
  type?:     string
  value:     string
  dynamic?:  boolean
  required?: boolean
  source:    string  // query_string | path_param | form_html
}

export interface FuzzEndpoint {
  id:           string
  workspace_id: string
  target_id:    string | null
  job_id:       string | null
  url:          string
  method:       string
  content_type: string | null
  params:       FuzzParam[]
  has_csrf:     boolean
  source_url:   string | null
  source_type:  string  // crawl_url | crawl_form
  created_at:   string
}

export interface FuzzEndpointStats {
  total:       number
  get_count:   number
  post_count:  number
  with_params: number
  with_csrf:   number
}

export const fuzzEndpointApi = {
  list: (wsid: string, params?: { method?: string; source_type?: string }) => {
    const q = new URLSearchParams()
    if (params?.method)      q.set('method', params.method)
    if (params?.source_type) q.set('source_type', params.source_type)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: FuzzEndpoint[]; total: number; stats: FuzzEndpointStats }>(
      `/api/workspaces/${wsid}/fuzz-endpoints${qs}`
    )
  },
}

// ── Finding ────────────────────────────────────────────
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type FindingType     = 'vulnerability' | 'misconfiguration' | 'exposure' | 'credential' | 'informational'
export type FindingStatus   = 'open' | 'confirmed' | 'false_positive' | 'fixed'

export interface Finding {
  id:           string
  workspace_id: string
  target_id:    string | null
  job_id:       string | null
  title:        string
  severity:     FindingSeverity
  type:         FindingType
  status:       FindingStatus
  cve_id:       string | null
  cvss_score:   number | null
  host:         string | null
  url:          string | null
  port:         number | null
  evidence:     string | null
  source:       string | null
  remediation:  string | null
  created_at:   string
  updated_at:   string
}

export interface FindingStats {
  critical: number
  high:     number
  medium:   number
  low:      number
  info:     number
}

export interface FindingInput {
  title:        string
  severity:     string
  type:         string
  status:       string
  target_id?:   string
  cve_id?:      string | null
  cvss_score?:  number | null
  host?:        string | null
  url?:         string | null
  port?:        number | null
  evidence?:    string | null
  source?:      string | null
  remediation?: string | null
}

export const findingApi = {
  list: (wsid: string, params?: { severity?: string; type?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.severity) q.set('severity', params.severity)
    if (params?.type)     q.set('type',     params.type)
    if (params?.status)   q.set('status',   params.status)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: Finding[]; total: number; stats: FindingStats }>(
      `/api/workspaces/${wsid}/findings${qs}`
    )
  },
  get: (wsid: string, id: string) =>
    request<{ data: Finding }>(`/api/workspaces/${wsid}/findings/${id}`).then(r => r.data),
  create: (wsid: string, body: FindingInput) =>
    request<{ data: Finding }>(`/api/workspaces/${wsid}/findings`, {
      method: 'POST', body: JSON.stringify(body),
    }).then(r => r.data),
  update: (wsid: string, id: string, body: FindingInput) =>
    request<{ data: Finding }>(`/api/workspaces/${wsid}/findings/${id}`, {
      method: 'PUT', body: JSON.stringify(body),
    }).then(r => r.data),
  updateStatus: (wsid: string, id: string, status: string) =>
    request<{ data: Finding }>(`/api/workspaces/${wsid}/findings/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }).then(r => r.data),
  delete: (wsid: string, id: string) =>
    request<{ message: string }>(`/api/workspaces/${wsid}/findings/${id}`, { method: 'DELETE' }),
}

// ── Nuclei Findings (bảng riêng findings_nuclei) ──────
export interface NucleiFinding {
  id:                string
  workspace_id:      string
  target_id:         string | null
  job_id:            string | null
  template_id:       string | null
  matcher_name:      string | null
  protocol:          string | null
  title:             string
  severity:          string
  type:              string
  status:            string
  host:              string | null
  url:               string | null
  port:              number | null
  extracted_results: string[]
  cve_id:            string | null
  cvss_score:        number | null
  evidence:          string | null
  remediation:       string | null
  created_at:        string
}

export const nucleiFindingApi = {
  list: (wsid: string, params?: { severity?: string }) => {
    const q = new URLSearchParams()
    if (params?.severity) q.set('severity', params.severity)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: NucleiFinding[]; total: number }>(
      `/api/workspaces/${wsid}/nuclei-findings${qs}`
    )
  },
  // Lịch sử thu thập: tất cả nuclei findings mọi lần chạy (frontend nhóm theo job_id)
  history: (wsid: string) =>
    request<{ data: NucleiFinding[]; total: number }>(
      `/api/workspaces/${wsid}/nuclei-findings/history`
    ),
}

// ── Firebase config trích từ target ─────────────────────
export interface ExtractedFirebaseConfig {
  id:                  string
  target_id:           string | null
  job_id:              string | null
  host:                string | null
  api_key:             string | null
  auth_domain:         string | null
  project_id:          string | null
  storage_bucket:      string | null
  messaging_sender_id: string | null
  app_id:              string | null
  created_at:          string
}

export const firebaseConfigApi = {
  list: (wsid: string, opts?: { target?: string }) => {
    const q = new URLSearchParams()
    if (opts?.target) q.set('target', opts.target)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: ExtractedFirebaseConfig[]; total: number }>(
      `/api/workspaces/${wsid}/firebase-configs${qs}`
    )
  },
}

// ── Firestore enumeration (OpenFirebase) ───────────────
export interface FirestoreCollection {
  id:         string
  target_id:  string | null
  project_id: string
  api_key:    string | null
  collection: string
  url:        string | null
  doc_count:  number
  job_id:     string | null
  created_at: string
}

export interface FirestoreDocument {
  id:         string
  target_id:  string | null
  project_id: string
  api_key:    string | null
  collection: string | null
  doc_path:   string
  url:        string | null
  created_at: string
}

export interface FirestoreCrawl {
  id:         string
  target_id:  string | null
  job_id:     string | null
  project_id: string
  collection: string
  doc_count:  number
  byte_size:  number
  file_path:  string
  status:     string
  error:      string | null
  truncated:  boolean
  created_at: string
}

export const firestoreApi = {
  collections: (wsid: string) =>
    request<{ data: FirestoreCollection[]; total: number }>(
      `/api/workspaces/${wsid}/firestore-collections`
    ),
  collectionsHistory: (wsid: string, opts?: { target?: string }) => {
    const q = new URLSearchParams()
    if (opts?.target) q.set('target', opts.target)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: FirestoreCollection[]; total: number }>(
      `/api/workspaces/${wsid}/firestore-collections/history${qs}`
    )
  },
  documents: (wsid: string, opts?: { collection?: string; limit?: number; offset?: number; target?: string }) => {
    const q = new URLSearchParams()
    if (opts?.collection) q.set('collection', opts.collection)
    if (opts?.target) q.set('target', opts.target)
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    if (opts?.offset != null) q.set('offset', String(opts.offset))
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: FirestoreDocument[]; total: number; limit: number; offset: number }>(
      `/api/workspaces/${wsid}/firestore-documents${qs}`
    )
  },
  crawls: (wsid: string, opts?: { target?: string }) => {
    const q = new URLSearchParams()
    if (opts?.target) q.set('target', opts.target)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: FirestoreCrawl[]; total: number }>(
      `/api/workspaces/${wsid}/firestore-crawls${qs}`
    )
  },
  // URL tải file JSON crawl (dùng cho <a download>, GET trực tiếp tới backend)
  crawlDownloadUrl: (wsid: string, path: string) =>
    `${BASE}/api/workspaces/${wsid}/firestore-crawls/download?path=${encodeURIComponent(path)}`,
}

// ── Phase 4 Fuzzing types ────────────────────────────

export interface FuzzParamResult {
  id:           string
  workspace_id: string
  target_id:    string | null
  job_id:       string
  url:          string
  method:       string
  params:       string[]
  created_at:   string
}

export interface FuzzParamResponse {
  data:  FuzzParamResult[]
  total: number
}

export interface DirFuzzResult {
  id:             string
  workspace_id:   string
  target_id:      string | null
  job_id:         string
  base_url:       string
  path:           string
  url:            string
  status_code:    number
  content_length: number
  content_type:   string | null
  words:          number
  lines:          number
  redirect_url:   string | null
  is_interesting: boolean
  created_at:     string
}

export interface DirFuzzResponse {
  data:  DirFuzzResult[]
  total: number
  stats: {
    total:       number
    interesting: number
    by_status:   Record<string, number>
  }
}

export const fuzzParamApi = {
  list: (wsid: string, params?: { method?: string }) => {
    const q = new URLSearchParams()
    if (params?.method) q.set('method', params.method)
    const qs = q.toString() ? `?${q}` : ''
    return request<FuzzParamResponse>(`/api/workspaces/${wsid}/fuzz-params${qs}`)
  },
}

export const dirFuzzApi = {
  list: (wsid: string, params?: { status_code?: number; interesting_only?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.status_code)    q.set('status_code',    String(params.status_code))
    if (params?.interesting_only) q.set('interesting_only', '1')
    const qs = q.toString() ? `?${q}` : ''
    return request<DirFuzzResponse>(`/api/workspaces/${wsid}/dir-fuzz${qs}`)
  },
}

// ── Wordlists ──────────────────────────────────────────────
export interface Wordlist {
  id:          string
  name:        string
  description: string
  category:    string
  path:        string
  line_count:  number | null
  file_size_kb: number | null
  is_builtin:  boolean
  created_at:  string
  available:   boolean
}

export const wordlistApi = {
  list: (params?: { category?: string }) => {
    const q = new URLSearchParams()
    if (params?.category) q.set('category', params.category)
    const qs = q.toString() ? `?${q}` : ''
    return request<{ data: Wordlist[]; total: number }>(`/api/wordlists${qs}`)
  },
  categories: () => request<string[]>('/api/wordlists/categories'),
}


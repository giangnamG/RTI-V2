'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  FuzzEndpoint, FuzzEndpointStats, FuzzParam,
  Target, Job,
  fuzzEndpointApi, targetApi, jobApi,
} from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'
import { ReconSubNav } from '@/components/layout/SectionSubNav'
import { TargetMultiSelect } from '@/components/recon/TargetMultiSelect'

// ── Job badge ─────────────────────────────────────────────
function JobBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Đang chờ',  cls: 'bg-[#1a1f2e] text-[#718096]' },
    running:   { label: 'Đang chạy', cls: 'bg-[#1a2434] text-[#4299e1] animate-pulse' },
    completed: { label: 'Xong',      cls: 'bg-[#1a2f1a] text-[#68d391]' },
    failed:    { label: 'Lỗi',       cls: 'bg-[#2d1a1a] text-[#fc8181]' },
  }
  const s = map[status] ?? map.pending
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
}

// ── Method badge ──────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
  const cls = method === 'GET'
    ? 'bg-[#1a2434] text-[#4299e1]'
    : method === 'POST'
    ? 'bg-[#2d1a2d] text-[#d6bcfa]'
    : 'bg-[#1a1f2e] text-[#718096]'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${cls}`}>
      {method}
    </span>
  )
}

// ── Source type badge ─────────────────────────────────────
function SourceTypeBadge({ type }: { type: string }) {
  return type === 'crawl_form'
    ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2d2200] text-[#fbd38d]">form</span>
    : <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a2f1a] text-[#68d391]">url</span>
}

// ── Stats bar ─────────────────────────────────────────────
function StatsBar({ stats, methodFilter, onMethodFilter }: {
  stats: FuzzEndpointStats
  methodFilter: string
  onMethodFilter: (m: string) => void
}) {
  const items = [
    { key: '',     label: 'Tất cả',    value: stats.total },
    { key: 'GET',  label: 'GET',       value: stats.get_count },
    { key: 'POST', label: 'POST',      value: stats.post_count },
    { key: '__params', label: 'Có params', value: stats.with_params },
    { key: '__csrf',   label: 'CSRF',      value: stats.with_csrf },
  ]
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(item => (
        <button key={item.key}
          onClick={() => item.key !== '__params' && item.key !== '__csrf' && onMethodFilter(
            methodFilter === item.key ? '' : item.key
          )}
          className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors
            ${item.key !== '__params' && item.key !== '__csrf' ? 'cursor-pointer' : 'cursor-default'}
            ${methodFilter === item.key && item.key !== '__params' && item.key !== '__csrf'
              ? 'border-[#553c9a] bg-[#2d1f52] text-[#a78bfa]'
              : 'border-[#1e2330] bg-[#141720] text-[#718096] hover:border-[#2d3748]'
            }`}
        >
          <span className="text-lg font-bold font-mono">{item.value}</span>
          <span className="text-[10px] mt-0.5">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Param list ────────────────────────────────────────────
function ParamList({ params, method }: { params: FuzzParam[]; method: string }) {
  if (!params || params.length === 0) {
    return <span className="text-[#2d3748] text-[10px]">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {params.map((p, i) => (
        <span key={i}
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border
            ${p.dynamic
              ? 'border-[#744210] bg-[#2d1800] text-[#fbd38d]'
              : p.source === 'path_param'
              ? 'border-[#276749] bg-[#1a2f1a] text-[#68d391]'
              : method === 'POST'
              ? 'border-[#44337a] bg-[#2d1f52] text-[#b794f4]'
              : 'border-[#2a4a7f] bg-[#1a2434] text-[#63b3ed]'
            }`}
          title={p.dynamic ? 'Dynamic field (CSRF/token)' : `source: ${p.source}${p.type ? ` | type: ${p.type}` : ''}`}
        >
          {p.name}{p.dynamic ? ' ⚡' : ''}
        </span>
      ))}
    </div>
  )
}

// ── Detail drawer ─────────────────────────────────────────
function DetailDrawer({ endpoint, onClose }: {
  endpoint: FuzzEndpoint
  onClose: () => void
}) {
  const rawUrl = endpoint.method === 'GET' && endpoint.params.length > 0
    ? `${endpoint.url}?${endpoint.params
        .filter(p => p.source === 'query_string')
        .map(p => `${p.name}=${p.value || 'FUZZ'}`)
        .join('&')}`
    : endpoint.url

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[560px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-4 border-b border-[#1e2330] flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <MethodBadge method={endpoint.method} />
              <SourceTypeBadge type={endpoint.source_type} />
              {endpoint.has_csrf && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2d1800] text-[#fbd38d] border border-[#744210]">
                  CSRF
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-[#4299e1] break-all">{endpoint.url}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Full URL preview */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Full URL</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
              <span className="font-mono text-[11px] text-[#e2e8f0] break-all flex-1">{rawUrl}</span>
              <CopyButton value={rawUrl} className="flex-shrink-0 mt-0.5" />
            </div>
          </div>

          {/* Content-Type (POST) */}
          {endpoint.content_type && (
            <div>
              <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Content-Type</p>
              <span className="font-mono text-[11px] text-[#a0aec0]">{endpoint.content_type}</span>
            </div>
          )}

          {/* Source */}
          {endpoint.source_url && (
            <div>
              <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Tìm thấy tại</p>
              <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
                <span className="font-mono text-[11px] text-[#718096] break-all flex-1">{endpoint.source_url}</span>
                <CopyButton value={endpoint.source_url} className="flex-shrink-0 mt-0.5" />
              </div>
            </div>
          )}

          {/* Params table */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">
              Parameters ({endpoint.params.length})
            </p>
            {endpoint.params.length === 0 ? (
              <p className="text-[#2d3748] text-xs">Không có param</p>
            ) : (
              <div className="bg-[#141720] border border-[#1e2330] rounded overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-[#1e2330] text-[#4a5568]">
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Value</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-left font-medium">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.params.map((p, i) => (
                      <tr key={i} className="border-b border-[#1e2330] last:border-0">
                        <td className="px-3 py-2 font-mono text-[#e2e8f0]">{p.name}</td>
                        <td className="px-3 py-2 text-[#718096]">{p.type || '—'}</td>
                        <td className="px-3 py-2 font-mono text-[#68d391] max-w-[120px] truncate" title={p.value}>
                          {p.value || <span className="text-[#2d3748]">empty</span>}
                        </td>
                        <td className="px-3 py-2 text-[#4a5568]">{p.source}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {p.dynamic  && <span className="px-1 py-0.5 rounded text-[9px] bg-[#2d1800] text-[#fbd38d]">dynamic</span>}
                            {p.required && <span className="px-1 py-0.5 rounded text-[9px] bg-[#1a2f1a] text-[#68d391]">required</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* curl snippet */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">curl snippet</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
              <pre className="font-mono text-[11px] text-[#a0aec0] whitespace-pre-wrap break-all flex-1">
                {buildCurl(endpoint)}
              </pre>
              <CopyButton value={buildCurl(endpoint)} className="flex-shrink-0 mt-0.5" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function buildCurl(e: FuzzEndpoint): string {
  if (e.method === 'GET') {
    const qs = e.params
      .filter(p => p.source === 'query_string')
      .map(p => `${p.name}=${encodeURIComponent(p.value || 'FUZZ')}`)
      .join('&')
    return `curl -s "${e.url}${qs ? '?' + qs : ''}"`
  }

  const ct = e.content_type || 'application/x-www-form-urlencoded'
  const nonDynamic = e.params.filter(p => !p.dynamic)

  if (ct.includes('json')) {
    const body = JSON.stringify(Object.fromEntries(nonDynamic.map(p => [p.name, p.value || 'FUZZ'])), null, 2)
    return `curl -s -X POST "${e.url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`
  }

  const body = nonDynamic.map(p => `${p.name}=${encodeURIComponent(p.value || 'FUZZ')}`).join('&')
  return `curl -s -X POST "${e.url}" \\\n  -H "Content-Type: ${ct}" \\\n  -d "${body}"`
}

// ── Scan modal ────────────────────────────────────────────
function NormalizeModal({ wsid, targets, onClose, onJobCreated }: {
  wsid: string
  targets: Target[]
  onClose: () => void
  onJobCreated: (job: Job) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(targets.map(t => t.id)))
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.size === 0) { setError('Chọn ít nhất 1 target'); return }
    setLoading(true)
    setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'RECON_ENDPOINT_NORMALIZE',
        payload: {
          workspace_id: wsid,
          target_ids:   [...selected],
        },
      })
      onJobCreated(job)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#e2e8f0] text-sm">Normalize Endpoints</h2>
            <p className="text-[#4a5568] text-[11px] mt-0.5">
              Chuẩn hóa URLs và Forms từ kết quả Web Crawler
            </p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <TargetMultiSelect targets={targets} selected={selected} onChange={setSelected} label="Chọn target" />

          <div className="bg-[#0d1117] border border-[#1e2330] rounded px-3 py-2 text-[11px] text-[#4a5568] space-y-1">
            <p>Sẽ xử lý:</p>
            <p>• GET URLs từ <span className="text-[#e2e8f0]">web_crawl_urls</span> — filter static, dedup, extract params</p>
            <p>• POST Forms từ <span className="text-[#e2e8f0]">web_crawl_forms</span> — map fields, flag CSRF</p>
            <p className="text-[#2d3748] pt-1">Hãy chạy <span className="text-[#e2e8f0]">RECON_WEB_CRAWL</span> trước.</p>
          </div>

          {error && <p className="text-[#fc8181] text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-3 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors disabled:opacity-50">
              {loading ? 'Đang tạo...' : 'Bắt đầu Normalize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function FuzzEndpointsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [endpoints, setEndpoints]   = useState<FuzzEndpoint[]>([])
  const [stats, setStats]           = useState<FuzzEndpointStats | null>(null)
  const [targets, setTargets]       = useState<Target[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [search, setSearch]         = useState('')
  const [methodFilter, setMethodFilter]   = useState('')
  const [sourceFilter, setSourceFilter]   = useState('')
  const [onlyWithParams, setOnlyWithParams] = useState(true)
  const [selected, setSelected]     = useState<FuzzEndpoint | null>(null)

  const loadData = useCallback(async () => {
    const res = await fuzzEndpointApi.list(wsid)
    setEndpoints(res.data ?? [])
    setStats(res.stats ?? null)
  }, [wsid])

  const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'RECON_ENDPOINT_NORMALIZE', loadData)

  useEffect(() => {
    Promise.all([
      loadData(),
      targetApi.list(wsid).then(setTargets).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [wsid, loadData])

  const filtered = endpoints.filter(e => {
    if (onlyWithParams && e.params.length === 0) return false
    if (methodFilter && e.method !== methodFilter) return false
    if (sourceFilter && e.source_type !== sourceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const paramNames = e.params.map(p => p.name).join(' ').toLowerCase()
      if (!e.url.toLowerCase().includes(q) && !paramNames.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={wsid} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Active job banner */}
        {activeJob && (
          <div className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
            activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
            : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
            : activeJob.status === 'pending'   ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
            : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
          }`}>
            <JobBadge status={activeJob.status} />
            <span className="flex-1">
              {activeJob.status === 'running'   && 'Đang normalize endpoints...'}
              {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as Record<string, unknown>
                return `Hoàn thành — ${r?.saved ?? 0} endpoints (${r?.get_endpoints ?? 0} GET · ${r?.post_endpoints ?? 0} POST)`
              })()}
              {activeJob.status === 'failed' && `Lỗi: ${activeJob.error_message}`}
            </span>
            <span className="font-mono tabular-nums flex-shrink-0">{elapsed}</span>
            {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
              <button onClick={() => setActiveJob(null)} className="opacity-60 hover:opacity-100">×</button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#e2e8f0]">Fuzz Endpoints</h1>
            <p className="text-[#4a5568] text-xs mt-0.5">
              GET params + POST forms đã chuẩn hóa · {stats?.total ?? 0} endpoints
            </p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
            + Normalize
          </button>
        </div>

        {/* Stats bar */}
        {stats && stats.total > 0 && (
          <StatsBar stats={stats} methodFilter={methodFilter} onMethodFilter={setMethodFilter} />
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Tìm URL, param name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]"
          />
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
          >
            <option value="">Tất cả nguồn</option>
            <option value="crawl_url">URL (GET)</option>
            <option value="crawl_form">Form (POST)</option>
          </select>
          <button
            onClick={() => setOnlyWithParams(v => !v)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              onlyWithParams
                ? 'border-[#553c9a] bg-[#2d1f52] text-[#a78bfa]'
                : 'border-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]'
            }`}
          >
            Có params
          </button>
          {(search || methodFilter || sourceFilter || !onlyWithParams) && (
            <button
              onClick={() => { setSearch(''); setMethodFilter(''); setSourceFilter(''); setOnlyWithParams(true) }}
              className="px-2 py-1.5 text-[#4a5568] hover:text-[#e2e8f0] text-xs border border-[#2d3748] rounded transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-[#4a5568] text-sm">Đang tải...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-[#4a5568] text-sm">
              {endpoints.length === 0 ? 'Chưa có endpoint nào' : 'Không khớp với filter'}
            </span>
            {endpoints.length === 0 && (
              <p className="text-[#2d3748] text-xs text-center max-w-xs">
                Chạy <span className="text-[#e2e8f0]">RECON_WEB_CRAWL</span> trước,
                sau đó bấm <span className="text-[#e2e8f0]">+ Normalize</span> để chuẩn hóa.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2.5 text-left font-medium w-16">Method</th>
                  <th className="px-4 py-2.5 text-left font-medium">URL</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium">Params</th>
                  <th className="px-4 py-2.5 text-left font-medium w-14">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}
                    className="group border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <td className="px-4 py-2.5">
                      <MethodBadge method={e.method} />
                    </td>
                    <td className="px-4 py-2.5 max-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[#4299e1] truncate" title={e.url}>{e.url}</span>
                        <CopyButton value={e.url} className="flex-shrink-0 opacity-0 group-hover:opacity-100" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <SourceTypeBadge type={e.source_type} />
                    </td>
                    <td className="px-4 py-2.5 max-w-[300px]">
                      <ParamList params={e.params} method={e.method} />
                    </td>
                    <td className="px-4 py-2.5">
                      {e.has_csrf && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#2d1800] text-[#fbd38d] border border-[#744210]">
                          csrf
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-[#1e2330] text-[#2d3748] text-[11px]">
              {filtered.length} / {endpoints.length} endpoints
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <NormalizeModal
          wsid={wsid}
          targets={targets}
          onClose={() => setShowModal(false)}
          onJobCreated={job => setActiveJob(job)}
        />
      )}

      {selected && (
        <DetailDrawer
          endpoint={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

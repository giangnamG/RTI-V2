'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  FuzzParamResult, FuzzParamResponse,
  Target, Job,
  fuzzParamApi, targetApi, jobApi,
} from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'

// ── Fuzzing sub-nav ───────────────────────────────────────
function FuzzingSubNav({ wsid }: { wsid: string }) {
  return (
    <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6">
      {[
        { href: `/workspace/${wsid}/fuzzing/params`, label: 'Param Discovery' },
        { href: `/workspace/${wsid}/fuzzing/dirs`,   label: 'Directory Fuzzing' },
      ].map(item => {
        const active = typeof window !== 'undefined' && window.location.pathname === item.href
        return (
          <a key={item.href} href={item.href}
            className={`px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
              ${active ? 'text-[#f6ad55] border-[#ed8936]' : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
          >
            {item.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Job badge ─────────────────────────────────────────────
function JobBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',   cls: 'bg-[#1a1f2e] text-[#718096]' },
    running:   { label: 'Running',   cls: 'bg-[#1a2434] text-[#4299e1] animate-pulse' },
    completed: { label: 'Completed', cls: 'bg-[#1a2f1a] text-[#68d391]' },
    failed:    { label: 'Failed',    cls: 'bg-[#2d1a1a] text-[#fc8181]' },
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

// ── Stats bar ─────────────────────────────────────────────
function StatsBar({ results }: { results: FuzzParamResult[] }) {
  const totalScanned    = results.length
  const withParams      = results.filter(r => r.params.length > 0).length
  const totalParams     = results.reduce((acc, r) => acc + r.params.length, 0)

  const items = [
    { label: 'Endpoints scanned',  value: totalScanned },
    { label: 'With params',        value: withParams },
    { label: 'Total params found', value: totalParams },
  ]

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(item => (
        <div key={item.label}
          className="flex flex-col items-center px-4 py-2 rounded-lg border border-[#1e2330] bg-[#141720] text-[#718096]"
        >
          <span className="text-lg font-bold font-mono text-[#e2e8f0]">{item.value}</span>
          <span className="text-[10px] mt-0.5">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Param chip badges ─────────────────────────────────────
function ParamChips({ params }: { params: string[] }) {
  if (!params || params.length === 0) {
    return <span className="text-[#2d3748] text-[10px]">—</span>
  }
  const shown = params.slice(0, 6)
  const rest  = params.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((p, i) => (
        <span key={i}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a2434] text-[#63b3ed] border border-[#2a4a7f]"
        >
          {p}
        </span>
      ))}
      {rest > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a1f2e] text-[#4a5568]">
          +{rest}
        </span>
      )}
    </div>
  )
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({ wsid, targets, onClose, onJobCreated }: {
  wsid: string
  targets: Target[]
  onClose: () => void
  onJobCreated: (job: Job) => void
}) {
  const [targetId,     setTargetId]     = useState('')
  const [methodFilter, setMethodFilter] = useState('ALL')
  const [threads,      setThreads]      = useState('5')
  const [stable,       setStable]       = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'FUZZ_PARAM',
        target_id: targetId || undefined,
        payload: {
          workspace_id:  wsid,
          target_id:     targetId || '',
          method_filter: methodFilter,
          threads:       parseInt(threads),
          stable:        stable,
        },
      })
      onJobCreated(job)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#e2e8f0] text-sm">Param Discovery</h2>
            <p className="text-[#4a5568] text-[11px] mt-0.5">
              Discover hidden parameters on web endpoints
            </p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Target */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Target (optional)</label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="">All targets</option>
              {targets.map(t => (
                <option key={t.id} value={t.id}>{t.domain}</option>
              ))}
            </select>
          </div>

          {/* Method filter */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Method filter</label>
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="ALL">ALL — scan all methods</option>
              <option value="GET">GET only</option>
              <option value="POST">POST only</option>
            </select>
          </div>

          {/* Threads */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">
              Threads: <span className="text-[#e2e8f0] font-mono">{threads}</span>
            </label>
            <input
              type="range"
              min="1" max="20" step="1"
              value={threads}
              onChange={e => setThreads(e.target.value)}
              className="w-full accent-[#ed8936]"
            />
            <div className="flex justify-between text-[10px] text-[#2d3748] mt-0.5">
              <span>1</span><span>20</span>
            </div>
          </div>

          {/* Stable */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stable}
                onChange={e => setStable(e.target.checked)}
                className="accent-[#ed8936]"
              />
              <span className="text-xs text-[#e2e8f0]">Stable mode</span>
              <span className="text-[#4a5568] text-[10px]">— skip unstable endpoints</span>
            </label>
          </div>

          {/* Info */}
          <div className="bg-[#0d1117] border border-[#1e2330] rounded px-3 py-2 text-[11px] text-[#4a5568]">
            Requires <span className="text-[#e2e8f0]">RECON_ENDPOINT_NORMALIZE</span> results.
            Ensure endpoints have been collected first.
          </div>

          {error && <p className="text-[#fc8181] text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-3 py-2 bg-[#7b4a00] hover:bg-[#9a5c00] text-[#f6ad55] text-xs rounded font-medium transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : 'Start Param Discovery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Detail drawer ─────────────────────────────────────────
function DetailDrawer({ result, onClose }: {
  result: FuzzParamResult
  onClose: () => void
}) {
  const curlGet = result.method === 'GET' && result.params.length > 0
    ? `curl -s "${result.url}?${result.params.map(p => `${p}=FUZZ`).join('&')}"`
    : result.method === 'POST' && result.params.length > 0
    ? `curl -s -X POST "${result.url}" \\\n  -H "Content-Type: application/x-www-form-urlencoded" \\\n  -d "${result.params.map(p => `${p}=FUZZ`).join('&')}"`
    : `curl -s "${result.url}"`

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-4 border-b border-[#1e2330] flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <MethodBadge method={result.method} />
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2d1f00] text-[#f6ad55] border border-[#7b4a00]">
                {result.params.length} params
              </span>
            </div>
            <p className="font-mono text-[11px] text-[#4299e1] break-all">{result.url}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* URL */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">URL</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
              <span className="font-mono text-[11px] text-[#e2e8f0] break-all flex-1">{result.url}</span>
              <CopyButton value={result.url} className="flex-shrink-0 mt-0.5" />
            </div>
          </div>

          {/* Params list */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">
              Parameters ({result.params.length})
            </p>
            {result.params.length === 0 ? (
              <p className="text-[#2d3748] text-xs">No parameters found</p>
            ) : (
              <div className="bg-[#141720] border border-[#1e2330] rounded overflow-hidden">
                {result.params.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-[#1e2330] last:border-0">
                    <span className="font-mono text-[11px] text-[#63b3ed]">{p}</span>
                    <CopyButton value={p} className="flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* curl snippet */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">curl snippet</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
              <pre className="font-mono text-[11px] text-[#a0aec0] whitespace-pre-wrap break-all flex-1">
                {curlGet}
              </pre>
              <CopyButton value={curlGet} className="flex-shrink-0 mt-0.5" />
            </div>
          </div>

          {/* Metadata */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Metadata</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#4a5568]">Job ID</span>
                <span className="font-mono text-[#718096]">{result.job_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4a5568]">Discovered</span>
                <span className="font-mono text-[#718096]">
                  {new Date(result.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function FuzzParamPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [results,     setResults]    = useState<FuzzParamResult[]>([])
  const [targets,     setTargets]    = useState<Target[]>([])
  const [loading,     setLoading]    = useState(true)
  const [showModal,   setShowModal]  = useState(false)
  const [search,      setSearch]     = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [selected,    setSelected]   = useState<FuzzParamResult | null>(null)

  const loadData = useCallback(async () => {
    const res = await fuzzParamApi.list(wsid)
    setResults(res.data ?? [])
  }, [wsid])

  const { activeJob, setActiveJob } = useJobPolling(wsid, 'FUZZ_PARAM', loadData)

  useEffect(() => {
    Promise.all([
      loadData(),
      targetApi.list(wsid).then(setTargets).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [wsid, loadData])

  const filtered = results.filter(r => {
    if (methodFilter && r.method !== methodFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const paramStr = r.params.join(' ').toLowerCase()
      if (!r.url.toLowerCase().includes(q) && !paramStr.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <FuzzingSubNav wsid={wsid} />

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
              {activeJob.status === 'running'   && 'Param discovery in progress, this may take a few minutes...'}
              {activeJob.status === 'pending'   && 'Job queued, waiting for worker...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as Record<string, unknown>
                return `Done — ${r?.total_params ?? 0} params found across ${r?.scanned ?? 0} endpoints`
              })()}
              {activeJob.status === 'failed' && `Error: ${activeJob.error_message}`}
            </span>
            {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
              <button onClick={() => setActiveJob(null)} className="opacity-60 hover:opacity-100">×</button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#e2e8f0]">Param Discovery</h1>
            <p className="text-[#4a5568] text-xs mt-0.5">
              Discover hidden parameters on web endpoints · {results.length} endpoints scanned
            </p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#7b4a00] hover:bg-[#9a5c00] text-[#f6ad55] text-xs rounded font-medium transition-colors">
            + Run FUZZ_PARAM
          </button>
        </div>

        {/* Stats bar */}
        {results.length > 0 && <StatsBar results={results} />}

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search by URL or param name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#ed8936]"
          />
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#ed8936]"
          >
            <option value="">All methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          {(search || methodFilter) && (
            <button
              onClick={() => { setSearch(''); setMethodFilter('') }}
              className="px-2 py-1.5 text-[#4a5568] hover:text-[#e2e8f0] text-xs border border-[#2d3748] rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-[#4a5568] text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-[#4a5568] text-sm">
              {results.length === 0
                ? 'No param discovery results yet. Launch a FUZZ_PARAM job to get started.'
                : 'No results match the current filter.'}
            </span>
            {results.length === 0 && (
              <p className="text-[#2d3748] text-xs text-center max-w-xs">
                Ensure <span className="text-[#e2e8f0]">RECON_ENDPOINT_NORMALIZE</span> has been run first,
                then click <span className="text-[#e2e8f0]">+ Run FUZZ_PARAM</span>.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2.5 text-left font-medium">URL</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Method</th>
                  <th className="px-4 py-2.5 text-left font-medium w-20">Params</th>
                  <th className="px-4 py-2.5 text-left font-medium">Params List</th>
                  <th className="px-4 py-2.5 text-left font-medium w-36">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}
                    className="group border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    {/* URL */}
                    <td className="px-4 py-2.5 max-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[#4299e1] truncate" title={r.url}>{r.url}</span>
                        <CopyButton value={r.url} className="flex-shrink-0 opacity-0 group-hover:opacity-100" />
                      </div>
                    </td>
                    {/* Method */}
                    <td className="px-4 py-2.5">
                      <MethodBadge method={r.method} />
                    </td>
                    {/* Params count */}
                    <td className="px-4 py-2.5">
                      <span className={`font-mono font-semibold ${r.params.length > 0 ? 'text-[#f6ad55]' : 'text-[#2d3748]'}`}>
                        {r.params.length}
                      </span>
                    </td>
                    {/* Params chips */}
                    <td className="px-4 py-2.5 max-w-[320px]">
                      <ParamChips params={r.params} />
                    </td>
                    {/* Timestamp */}
                    <td className="px-4 py-2.5 text-[#4a5568] font-mono whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-[#1e2330] text-[#2d3748] text-[11px]">
              {filtered.length} / {results.length} endpoints
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <ScanModal
          wsid={wsid}
          targets={targets}
          onClose={() => setShowModal(false)}
          onJobCreated={job => setActiveJob(job)}
        />
      )}

      {selected && (
        <DetailDrawer
          result={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  DirFuzzResult, DirFuzzResponse,
  Target, Job, Wordlist,
  dirFuzzApi, targetApi, jobApi, wordlistApi,
} from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'
import { FuzzingSubNav } from '@/components/layout/SectionSubNav'

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

// ── Status code badge ─────────────────────────────────────
function StatusBadge({ code }: { code: number }) {
  const cls =
    code >= 500 ? 'bg-[#3a1f1f] text-[#fc8181]' :
    code >= 400 ? 'bg-[#3a2d1f] text-[#f6ad55]' :
    code >= 300 ? 'bg-[#2a2d3a] text-[#a0aec0]' :
    code >= 200 ? 'bg-[#1a2f1a] text-[#68d391]' :
                  'bg-[#1a1f2e] text-[#718096]'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${cls}`}>{code}</span>
  )
}

// ── Interesting badge ─────────────────────────────────────
function InterestingBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2d1800] text-[#f6ad55] border border-[#7b4a00]">
      interesting
    </span>
  )
}

// ── Stats bar ─────────────────────────────────────────────
function StatsBar({ stats, statusFilter, onStatusFilter, interestingOnly, onInterestingToggle }: {
  stats: DirFuzzResponse['stats']
  statusFilter: string
  onStatusFilter: (s: string) => void
  interestingOnly: boolean
  onInterestingToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Total */}
      <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-[#1e2330] bg-[#141720] text-[#718096]">
        <span className="text-lg font-bold font-mono text-[#e2e8f0]">{stats.total}</span>
        <span className="text-[10px] mt-0.5">Total hits</span>
      </div>
      {/* Interesting */}
      <button
        onClick={onInterestingToggle}
        className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${
          interestingOnly
            ? 'border-[#7b4a00] bg-[#2d1f00] text-[#f6ad55]'
            : 'border-[#1e2330] bg-[#141720] text-[#718096] hover:border-[#2d3748]'
        }`}
      >
        <span className="text-lg font-bold font-mono">{stats.interesting}</span>
        <span className="text-[10px] mt-0.5">Interesting</span>
      </button>
      {/* By status */}
      {Object.entries(stats.by_status)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([code, cnt]) => (
        <button key={code}
          onClick={() => onStatusFilter(statusFilter === code ? '' : code)}
          className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${
            statusFilter === code
              ? 'border-[#553c9a] bg-[#2d1f52] text-[#a78bfa]'
              : 'border-[#1e2330] bg-[#141720] text-[#718096] hover:border-[#2d3748]'
          }`}
        >
          <span className="text-lg font-bold font-mono">{cnt}</span>
          <span className="text-[10px] mt-0.5">{code}</span>
        </button>
      ))}
    </div>
  )
}

// ── Wordlist helpers ───────────────────────────────────────
function wordlistGroup(w: Wordlist): string {
  if (w.is_builtin) return '[Built-in]'
  const m = w.path.match(/\/seclists\/(.+)\/[^/]+$/)
  return m ? m[1] : 'SecLists'
}

function wordlistShortLabel(w: Wordlist): string {
  const filename = w.path.split('/').pop() ?? w.name
  const count = w.line_count ? ` (${w.line_count.toLocaleString()})` : ''
  return `${filename}${count}`
}

function groupWordlists(wordlists: Wordlist[]): Record<string, Wordlist[]> {
  const groups: Record<string, Wordlist[]> = {}
  for (const w of wordlists) {
    const g = wordlistGroup(w)
    if (!groups[g]) groups[g] = []
    groups[g].push(w)
  }
  return groups
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({ wsid, targets, onClose, onJobCreated }: {
  wsid: string
  targets: Target[]
  onClose: () => void
  onJobCreated: (job: Job) => void
}) {
  const [targetId,     setTargetId]    = useState('')
  const [wordlist,     setWordlist]    = useState('/app/wordlists/common.txt')
  const [extensions,  setExtensions]  = useState('php,asp,aspx,jsp,html,txt,bak')
  const [threads,     setThreads]     = useState('40')
  const [statusFilter, setStatusFilter] = useState('200,204,301,302,307,401,403')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [wordlists,   setWordlists]   = useState<Wordlist[]>([])
  const [wlLoading,   setWlLoading]   = useState(true)

  useEffect(() => {
    wordlistApi.list({ category: 'directories' })
      .then(r => {
        setWordlists(r.data ?? [])
        // default to common (builtin)
        const builtin = r.data?.find(w => w.is_builtin)
        if (builtin) setWordlist(builtin.path)
      })
      .catch(() => {})
      .finally(() => setWlLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'FUZZ_DIR',
        target_id: targetId || undefined,
        payload: {
          workspace_id:  wsid,
          target_id:     targetId || '',
          wordlist,
          extensions,
          threads:       parseInt(threads),
          status_filter: statusFilter,
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

  const selectedWl = wordlists.find(w => w.path === wordlist)
  const grouped    = groupWordlists(wordlists)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#e2e8f0] text-sm">Directory Fuzzing</h2>
            <p className="text-[#4a5568] text-[11px] mt-0.5">
              Fuzz directories and files using ffuf
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

          {/* Wordlist */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Wordlist</label>
            {wlLoading ? (
              <div className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-[#4a5568] text-sm">
                Loading wordlists...
              </div>
            ) : (
              <select
                value={wordlist}
                onChange={e => setWordlist(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
                size={1}
              >
                {wordlists.length === 0 && (
                  <option value="/app/wordlists/common.txt">
                    common.txt (386)
                  </option>
                )}
                {Object.entries(grouped).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map(w => (
                      <option key={w.id} value={w.path}>
                        {wordlistShortLabel(w)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            {selectedWl && (
              <p className="text-[10px] text-[#4a5568] mt-1 font-mono truncate" title={selectedWl.path}>
                {selectedWl.path}
              </p>
            )}
          </div>

          {/* Extensions */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">
              Extensions <span className="text-[#4a5568]">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={extensions}
              onChange={e => setExtensions(e.target.value)}
              placeholder="php,asp,aspx,html,txt"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm font-mono text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {/* Threads */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">
              Threads: <span className="text-[#e2e8f0] font-mono">{threads}</span>
            </label>
            <input
              type="range"
              min="10" max="100" step="10"
              value={threads}
              onChange={e => setThreads(e.target.value)}
              className="w-full accent-[#ed8936]"
            />
            <div className="flex justify-between text-[10px] text-[#2d3748] mt-0.5">
              <span>10</span><span>100</span>
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">
              Status filter <span className="text-[#4a5568]">(comma-separated codes to include)</span>
            </label>
            <input
              type="text"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              placeholder="200,301,302,403"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm font-mono text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {/* Info */}
          <div className="bg-[#0d1117] border border-[#1e2330] rounded px-3 py-2 text-[11px] text-[#4a5568]">
            Fuzzes all <span className="text-[#68d391]">live</span> web endpoints from Web Probe results.
            Ensure <span className="text-[#e2e8f0]">SCAN_WEB_INFO</span> has been run first.
          </div>

          {error && <p className="text-[#fc8181] text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-3 py-2 bg-[#7b4a00] hover:bg-[#9a5c00] text-[#f6ad55] text-xs rounded font-medium transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : 'Start Directory Fuzzing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Detail drawer ─────────────────────────────────────────
function DetailDrawer({ result, onClose }: {
  result: DirFuzzResult
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-4 border-b border-[#1e2330] flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge code={result.status_code} />
              {result.is_interesting && <InterestingBadge />}
            </div>
            <p className="font-mono text-[11px] text-[#4299e1] break-all">{result.url}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* URL with copy */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Full URL</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
              <span className="font-mono text-[11px] text-[#e2e8f0] break-all flex-1">{result.url}</span>
              <CopyButton value={result.url} className="flex-shrink-0 mt-0.5" />
            </div>
          </div>

          {/* Details grid */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Response Details</p>
            <div className="bg-[#141720] border border-[#1e2330] rounded overflow-hidden">
              {[
                { label: 'Status Code',    value: <StatusBadge code={result.status_code} /> },
                { label: 'Content Length', value: <span className="font-mono text-[#e2e8f0] text-[11px]">{result.content_length.toLocaleString()} bytes</span> },
                { label: 'Words',          value: <span className="font-mono text-[#e2e8f0] text-[11px]">{result.words}</span> },
                { label: 'Lines',          value: <span className="font-mono text-[#e2e8f0] text-[11px]">{result.lines}</span> },
                { label: 'Content-Type',   value: <span className="font-mono text-[#718096] text-[11px]">{result.content_type || '—'}</span> },
                { label: 'Base URL',       value: <span className="font-mono text-[#718096] text-[11px] truncate">{result.base_url}</span> },
                { label: 'Path',           value: <span className="font-mono text-[#68d391] text-[11px]">{result.path}</span> },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-3 py-2 border-b border-[#1e2330] last:border-0">
                  <span className="text-[11px] text-[#4a5568]">{row.label}</span>
                  <div>{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Redirect */}
          {result.redirect_url && (
            <div>
              <p className="text-[10px] text-[#4a5568] mb-1.5 uppercase tracking-wider">Redirect</p>
              <div className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 flex items-start gap-2">
                <span className="font-mono text-[11px] text-[#a0aec0] break-all flex-1">{result.redirect_url}</span>
                <CopyButton value={result.redirect_url} className="flex-shrink-0 mt-0.5" />
              </div>
            </div>
          )}

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
export default function DirFuzzPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [results,         setResults]         = useState<DirFuzzResult[]>([])
  const [respStats,       setRespStats]        = useState<DirFuzzResponse['stats'] | null>(null)
  const [targets,         setTargets]          = useState<Target[]>([])
  const [loading,         setLoading]          = useState(true)
  const [showModal,       setShowModal]        = useState(false)
  const [statusFilter,    setStatusFilter]     = useState('')
  const [interestingOnly, setInterestingOnly]  = useState(false)
  const [selected,        setSelected]         = useState<DirFuzzResult | null>(null)

  const loadData = useCallback(async () => {
    const res = await dirFuzzApi.list(wsid)
    setResults(res.data ?? [])
    setRespStats(res.stats ?? null)
  }, [wsid])

  const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'FUZZ_DIR', loadData)

  useEffect(() => {
    Promise.all([
      loadData(),
      targetApi.list(wsid).then(setTargets).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [wsid, loadData])

  const filtered = results.filter(r => {
    if (interestingOnly && !r.is_interesting) return false
    if (statusFilter && String(r.status_code) !== statusFilter) return false
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
              {activeJob.status === 'running'   && 'Directory fuzzing in progress, this may take several minutes...'}
              {activeJob.status === 'pending'   && 'Job queued, waiting for worker...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as Record<string, unknown>
                return `Done — ${r?.total_hits ?? 0} hits found (${r?.interesting ?? 0} interesting)`
              })()}
              {activeJob.status === 'failed' && `Error: ${activeJob.error_message}`}
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
            <h1 className="text-base font-semibold text-[#e2e8f0]">Directory Fuzzing</h1>
            <p className="text-[#4a5568] text-xs mt-0.5">
              Brute-force directories and files on web targets · {results.length} hits
            </p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#7b4a00] hover:bg-[#9a5c00] text-[#f6ad55] text-xs rounded font-medium transition-colors">
            + Run FUZZ_DIR
          </button>
        </div>

        {/* Stats bar */}
        {respStats && results.length > 0 && (
          <StatsBar
            stats={respStats}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            interestingOnly={interestingOnly}
            onInterestingToggle={() => setInterestingOnly(v => !v)}
          />
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#ed8936]"
          >
            <option value="">All status codes</option>
            <option value="200">200 OK</option>
            <option value="301">301 Redirect</option>
            <option value="302">302 Redirect</option>
            <option value="401">401 Unauthorized</option>
            <option value="403">403 Forbidden</option>
          </select>
          <button
            onClick={() => setInterestingOnly(v => !v)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              interestingOnly
                ? 'border-[#7b4a00] bg-[#2d1f00] text-[#f6ad55]'
                : 'border-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]'
            }`}
          >
            Interesting only
          </button>
          {(statusFilter || interestingOnly) && (
            <button
              onClick={() => { setStatusFilter(''); setInterestingOnly(false) }}
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
                ? 'No directory fuzzing results yet.'
                : 'No results match the current filter.'}
            </span>
            {results.length === 0 && (
              <p className="text-[#2d3748] text-xs text-center max-w-xs">
                Ensure <span className="text-[#e2e8f0]">SCAN_WEB_INFO</span> has been run first,
                then click <span className="text-[#e2e8f0]">+ Run FUZZ_DIR</span> to start fuzzing.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2.5 text-left font-medium">URL</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium w-24">Size</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Words</th>
                  <th className="px-4 py-2.5 text-left font-medium">Redirect</th>
                  <th className="px-4 py-2.5 text-left font-medium w-24">Flag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}
                    className={`group border-b border-[#1e2330] transition-colors cursor-pointer
                      ${r.is_interesting
                        ? 'bg-[#1f1500] hover:bg-[#261a00]'
                        : 'hover:bg-[#1a1f2e]'
                      }`}
                    onClick={() => setSelected(r)}
                  >
                    {/* URL */}
                    <td className="px-4 py-2.5 max-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[#4299e1] truncate" title={r.url}>{r.url}</span>
                        <CopyButton value={r.url} className="flex-shrink-0 opacity-0 group-hover:opacity-100" />
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusBadge code={r.status_code} />
                    </td>
                    {/* Size */}
                    <td className="px-4 py-2.5 font-mono text-[#718096]">
                      {r.content_length.toLocaleString()} B
                    </td>
                    {/* Words */}
                    <td className="px-4 py-2.5 font-mono text-[#718096]">
                      {r.words}
                    </td>
                    {/* Redirect */}
                    <td className="px-4 py-2.5 max-w-0">
                      {r.redirect_url ? (
                        <span className="font-mono text-[#a0aec0] truncate block" title={r.redirect_url}>
                          {r.redirect_url}
                        </span>
                      ) : (
                        <span className="text-[#2d3748]">—</span>
                      )}
                    </td>
                    {/* Interesting */}
                    <td className="px-4 py-2.5">
                      {r.is_interesting && <InterestingBadge />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-[#1e2330] text-[#2d3748] text-[11px]">
              {filtered.length} / {results.length} hits
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

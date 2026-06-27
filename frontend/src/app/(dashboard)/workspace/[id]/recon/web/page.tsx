'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Job, Target, WebProbe, jobApi, targetApi, webProbeApi } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'

// ── Sub-nav ───────────────────────────────────────────────
function ReconSubNav({ wsid }: { wsid: string }) {
  return (
    <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6">
      {[
        { href: `/workspace/${wsid}/recon/subdomains`, label: 'Subdomains' },
        { href: `/workspace/${wsid}/recon/ports`,      label: 'Ports & Services' },
        { href: `/workspace/${wsid}/recon/web`,        label: 'Web Probe' },
      ].map(item => {
        const active = typeof window !== 'undefined' && window.location.pathname === item.href
        return (
          <a key={item.href} href={item.href}
            className={`px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
              ${active ? 'text-[#68d391] border-[#48bb78]' : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
          >
            {item.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Job badge ─────────────────────────────────────────────
function JobBadge({ job }: { job: Job }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Đang chờ',  cls: 'bg-[#1a1f2e] text-[#718096]' },
    running:   { label: 'Đang chạy', cls: 'bg-[#1a2434] text-[#4299e1] animate-pulse' },
    completed: { label: 'Xong',      cls: 'bg-[#1a2f1a] text-[#68d391]' },
    failed:    { label: 'Lỗi',       cls: 'bg-[#2d1a1a] text-[#fc8181]' },
  }
  const s = map[job.status] ?? map.pending
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
  )
}

// ── Status code badge ─────────────────────────────────────
function StatusBadge({ code }: { code: number | null }) {
  if (!code) return <span className="text-[#2d3748]">—</span>
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

// ── Tech tags ─────────────────────────────────────────────
function TechTags({ techs }: { techs: string[] }) {
  if (!techs || techs.length === 0) return <span className="text-[#2d3748]">—</span>
  const visible = techs.slice(0, 3)
  const rest = techs.length - 3
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(t => (
        <span key={t} className="px-1.5 py-0.5 bg-[#1a1a3a] text-[#b794f4] text-[10px] rounded font-mono">
          {t}
        </span>
      ))}
      {rest > 0 && (
        <span className="px-1.5 py-0.5 bg-[#1a1f2e] text-[#4a5568] text-[10px] rounded">+{rest}</span>
      )}
    </div>
  )
}

// ── History drawer ────────────────────────────────────────
function HistoryDrawer({
  wsid, host, onClose,
}: { wsid: string; host: string; onClose: () => void }) {
  const [history, setHistory] = useState<WebProbe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    webProbeApi.history(wsid, host)
      .then(r => setHistory(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [wsid, host])

  // Group by job_id
  const sessions = history.reduce<{ jobId: string | null; scannedAt: string; probes: WebProbe[] }[]>((acc, p) => {
    const key = p.job_id ?? 'unknown'
    const existing = acc.find(s => s.jobId === key)
    if (existing) {
      existing.probes.push(p)
    } else {
      acc.push({ jobId: p.job_id, scannedAt: p.created_at, probes: [p] })
    }
    return acc
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[560px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2330] flex items-start justify-between">
          <div>
            <p className="text-[10px] text-[#4a5568] mb-0.5">Lịch sử Web Probe</p>
            <p className="font-mono text-sm text-[#e2e8f0] break-all">{host}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-xl leading-none ml-4 mt-0.5">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Đang tải...</div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Chưa có lịch sử</div>
          ) : (
            <div className="divide-y divide-[#1e2330]">
              {sessions.map((session, i) => (
                <div key={session.jobId ?? i} className={`px-5 py-4 ${i === 0 ? 'bg-[#141720]' : ''}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {i === 0 && (
                      <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>
                    )}
                    <span className="text-xs text-[#e2e8f0] font-medium">
                      {new Date(session.scannedAt).toLocaleString('vi-VN')}
                    </span>
                    <span className="text-[10px] text-[#4a5568]">·</span>
                    <span className="text-[10px] text-[#4a5568]">{session.probes.length} endpoint</span>
                  </div>

                  <div className="space-y-2">
                    {session.probes.map(p => (
                      <div key={p.id} className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <StatusBadge code={p.status_code} />
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[#63b3ed] hover:underline text-[10px] truncate max-w-[300px]"
                          >
                            {p.url}
                          </a>
                        </div>
                        {p.title && (
                          <p className="text-[10px] text-[#718096] pl-1 truncate">{p.title}</p>
                        )}
                        {p.technologies.length > 0 && (
                          <div className="pl-1">
                            <TechTags techs={p.technologies} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {session.jobId && (
                    <p className="mt-2 text-[10px] text-[#2d3748] font-mono">
                      Job: {session.jobId.slice(0, 8)}…
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#1e2330]">
          <p className="text-[10px] text-[#2d3748]">{sessions.length} lần probe</p>
        </div>
      </div>
    </>
  )
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({
  targets, wsid, onClose, onJobCreated,
}: {
  targets: Target[]; wsid: string; onClose: () => void; onJobCreated: (j: Job) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type: 'SCAN_WEB_INFO',
        target_id: selectedTarget || undefined,
        payload: {
          workspace_id: wsid,
          target_id:    selectedTarget || undefined,
        },
      })
      onJobCreated(job)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">Chạy Web Probe</h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">
              Target <span className="text-[#2d3748]">(tùy chọn — để trống để probe tất cả web ports trong workspace)</span>
            </label>
            <select
              value={selectedTarget}
              onChange={e => setSelectedTarget(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="">— Tất cả targets —</option>
              {targets.map(t => (
                <option key={t.id} value={t.id}>{t.domain}</option>
              ))}
            </select>
          </div>

          <div className="bg-[#0d1117] border border-[#1e2330] rounded p-3 text-[11px] text-[#4a5568] space-y-1">
            <p className="text-[#718096] font-medium mb-1">Tool sẽ chạy:</p>
            <p>• <span className="text-[#a78bfa]">httpx</span> — HTTP prober (ProjectDiscovery)</p>
            <p className="text-[#2d3748]">Probe tất cả ports có service_category = "web"</p>
            <p className="text-[#2d3748]">Phát hiện: title, tech stack, server header, status</p>
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-sm rounded font-medium transition-colors disabled:opacity-40"
            >
              {loading ? 'Đang tạo job...' : '▶ Bắt đầu Probe'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-sm rounded transition-colors"
            >
              Huỷ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function WebProbePage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [probes,     setProbes]     = useState<WebProbe[]>([])
  const [targets,    setTargets]    = useState<Target[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<string | null>(null)  // host for history drawer

  const loadProbes = useCallback(async () => {
    const res = await webProbeApi.list(wsid)
    setProbes(res.data ?? [])
  }, [wsid])

  const { activeJob, setActiveJob } = useJobPolling(wsid, 'SCAN_WEB_INFO', loadProbes)

  useEffect(() => {
    Promise.all([
      loadProbes(),
      targetApi.list(wsid).then(setTargets),
    ]).finally(() => setLoading(false))
  }, [wsid, loadProbes])

  const filtered = probes.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.host.toLowerCase().includes(q) ||
      p.url.toLowerCase().includes(q) ||
      (p.title ?? '').toLowerCase().includes(q) ||
      (p.web_server ?? '').toLowerCase().includes(q) ||
      p.technologies.some(t => t.toLowerCase().includes(q))
    )
  })

  const aliveCount = probes.filter(p => p.is_alive).length
  const hosts = Array.from(new Set(filtered.map(p => p.host)))

  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={wsid} />

      <div className="p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Web Probe</h2>
            <p className="text-[11px] text-[#4a5568] mt-0.5">
              {loading
                ? 'Đang tải...'
                : `${probes.length} endpoint · ${aliveCount} alive · ${hosts.length} host`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {probes.length > 0 && (
              <input
                type="text"
                placeholder="Tìm host, URL, title, tech..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-52"
              />
            )}
            <button
              onClick={() => loadProbes()}
              className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors"
              title="Làm mới"
            >
              ↻
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors"
            >
              ▶ Chạy Probe
            </button>
          </div>
        </div>

        {/* Active job banner */}
        {activeJob && (
          <div className={`mb-4 px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
            activeJob.status === 'running'
              ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
              : activeJob.status === 'completed'
                ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
                : activeJob.status === 'pending'
                  ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
                  : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
          }`}>
            <JobBadge job={activeJob} />
            <span className="flex-1">
              {activeJob.status === 'running'   && 'Đang chạy httpx, vui lòng chờ...'}
              {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as any
                return `Hoàn thành — ${r?.alive ?? 0} alive · ${r?.probed ?? 0} probed · ${r?.saved ?? 0} đã lưu`
              })()}
              {activeJob.status === 'failed' && `Lỗi: ${activeJob.error_message}`}
            </span>
            {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
              <button onClick={() => setActiveJob(null)} className="opacity-50 hover:opacity-100">×</button>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-[#4a5568]">Đang tải...</div>
        ) : probes.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg">
            <div className="text-center py-16">
              <div className="text-3xl mb-3 text-[#2d3748]">◎</div>
              <p className="text-sm text-[#4a5568] mb-1">Chưa có kết quả probe</p>
              <p className="text-xs text-[#2d3748] mb-1">Probe sẽ phát hiện web apps trên các port có service_category = "web"</p>
              <p className="text-xs text-[#2d3748] mb-4">Hãy chạy Port Scan trước để phát hiện web ports</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors"
              >
                ▶ Chạy Probe đầu tiên
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2330]">
                  {['Host', 'Port', 'URL', 'Status', 'Title', 'Tech Stack', 'Server', 'Thời gian'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const prevHost = i > 0 ? filtered[i - 1].host : null
                  const isNewHost = p.host !== prevHost

                  return (
                    <tr
                      key={p.id}
                      onClick={() => { if (isNewHost) setSelected(p.host) }}
                      className={`border-b border-[#1e2330] last:border-0 transition-colors group ${
                        isNewHost ? 'hover:bg-[#1a1f2e] cursor-pointer' : 'hover:bg-[#161b27]'
                      } ${isNewHost && i > 0 ? 'border-t border-t-[#2d3748]' : ''}`}
                    >
                      {/* Host */}
                      <td className="px-4 py-2 font-mono text-xs">
                        {isNewHost ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[#e2e8f0] group-hover:text-[#a78bfa] transition-colors">{p.host}</span>
                            <span className="text-[#2d3748] text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">lịch sử →</span>
                          </div>
                        ) : (
                          <span className="text-[#2d3748]">↳</span>
                        )}
                      </td>

                      {/* Port */}
                      <td className="px-4 py-2">
                        <span className="font-mono text-[#fbd38d] font-semibold text-xs">{p.port}</span>
                      </td>

                      {/* URL */}
                      <td className="px-4 py-2 max-w-[240px]">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="font-mono text-[#63b3ed] hover:underline text-[10px] truncate block"
                          title={p.url}
                        >
                          {p.url}
                        </a>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2">
                        <StatusBadge code={p.status_code} />
                      </td>

                      {/* Title */}
                      <td className="px-4 py-2 max-w-[200px]">
                        <span className="text-[#718096] text-[11px] truncate block" title={p.title ?? ''}>
                          {p.title ?? <span className="text-[#2d3748]">—</span>}
                        </span>
                      </td>

                      {/* Tech stack */}
                      <td className="px-4 py-2">
                        <TechTags techs={p.technologies} />
                      </td>

                      {/* Server */}
                      <td className="px-4 py-2">
                        <span className="font-mono text-[#4a5568] text-[10px]">
                          {p.web_server ?? <span className="text-[#2d3748]">—</span>}
                        </span>
                      </td>

                      {/* Response time */}
                      <td className="px-4 py-2 text-[#4a5568] text-[11px] whitespace-nowrap">
                        {p.response_time ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
              <span className="text-[10px] text-[#2d3748]">
                {filtered.length !== probes.length
                  ? `${filtered.length} / ${probes.length}` : `${probes.length}`} endpoints
              </span>
              <span className="text-[10px] text-[#2d3748]">
                {hosts.length} host · {aliveCount} alive
              </span>
            </div>
          </div>
        )}
      </div>

      {/* History drawer */}
      {selected && (
        <HistoryDrawer wsid={wsid} host={selected} onClose={() => setSelected(null)} />
      )}

      {showModal && (
        <ScanModal
          targets={targets.filter(t => t.is_active)}
          wsid={wsid}
          onClose={() => setShowModal(false)}
          onJobCreated={job => setActiveJob(job)}
        />
      )}
    </div>
  )
}

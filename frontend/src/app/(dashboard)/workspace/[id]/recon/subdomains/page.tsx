'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Job, Subdomain, Target, jobApi, subdomainApi, targetApi } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'
import { ReconSubNav } from '@/components/layout/SectionSubNav'

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

// ── Alive badge ───────────────────────────────────────────
function AliveBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined)
    return <span className="text-[#2d3748] text-[10px]">—</span>
  return value
    ? <span className="px-2 py-0.5 bg-[#1a2f1a] text-[#68d391] text-[10px] rounded font-semibold">Alive</span>
    : <span className="px-2 py-0.5 bg-[#1a1f2e] text-[#4a5568] text-[10px] rounded font-semibold">Dead</span>
}

// ── History drawer ────────────────────────────────────────
function HistoryDrawer({
  wsid, domain, onClose,
}: { wsid: string; domain: string; onClose: () => void }) {
  const [history, setHistory] = useState<Subdomain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    subdomainApi.history(wsid, domain)
      .then(r => setHistory(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [wsid, domain])

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e2330] flex items-start justify-between">
          <div>
            <p className="text-[10px] text-[#4a5568] mb-0.5">Lịch sử thu thập</p>
            <p className="font-mono text-sm text-[#e2e8f0] break-all">{domain}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-xl leading-none ml-4 mt-0.5">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Đang tải...</div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Chưa có lịch sử</div>
          ) : (
            <div className="divide-y divide-[#1e2330]">
              {history.map((h, i) => (
                <div key={h.id} className={`px-5 py-4 ${i === 0 ? 'bg-[#141720]' : ''}`}>
                  {/* Time + job badge */}
                  <div className="flex items-center gap-2 mb-2.5">
                    {i === 0 && (
                      <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>
                    )}
                    <span className="text-xs text-[#e2e8f0] font-medium">
                      {new Date(h.created_at).toLocaleString('vi-VN')}
                    </span>
                    <AliveBadge value={h.is_alive} />
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-[11px]">
                    {/* IP Addresses */}
                    <div className="flex gap-2">
                      <span className="text-[#4a5568] w-20 flex-shrink-0">IP</span>
                      <span className="font-mono text-[#718096]">
                        {h.ip_addresses?.length ? h.ip_addresses.join(', ') : '—'}
                      </span>
                    </div>

                    {/* Sources */}
                    <div className="flex gap-2 items-start">
                      <span className="text-[#4a5568] w-20 flex-shrink-0">Nguồn</span>
                      <div className="flex flex-wrap gap-1">
                        {h.sources?.length
                          ? h.sources.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-[#1a1f2e] text-[#553c9a] rounded text-[10px]">{s}</span>
                            ))
                          : <span className="text-[#2d3748]">—</span>
                        }
                      </div>
                    </div>

                    {/* Job ID */}
                    {h.job_id && (
                      <div className="flex gap-2">
                        <span className="text-[#4a5568] w-20 flex-shrink-0">Job</span>
                        <span className="font-mono text-[#2d3748] text-[10px]">{h.job_id.slice(0, 8)}…</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e2330]">
          <p className="text-[10px] text-[#2d3748]">{history.length} lần thu thập</p>
        </div>
      </div>
    </>
  )
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({
  targets, wsid, onClose, onJobCreated,
}: {
  targets: Target[]; wsid: string; onClose: () => void; onJobCreated: (job: Job) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTarget) { setError('Chọn target để scan'); return }
    const t = targets.find(t => t.id === selectedTarget)!
    setLoading(true); setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type: 'RECON_SUBDOMAIN',
        target_id: selectedTarget,
        payload: { workspace_id: wsid, target_id: selectedTarget, domain: t.domain },
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
          <h2 className="font-semibold text-[#e2e8f0] text-sm">Chạy Subdomain Scan</h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Chọn target domain</label>
            {targets.length === 0 ? (
              <p className="text-xs text-[#fc8181]">Workspace chưa có target.</p>
            ) : (
              <select
                value={selectedTarget}
                onChange={e => setSelectedTarget(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
              >
                {targets.map(t => <option key={t.id} value={t.id}>{t.domain}</option>)}
              </select>
            )}
          </div>

          <div className="bg-[#0d1117] border border-[#1e2330] rounded p-3 text-[11px] text-[#4a5568] space-y-1">
            <p className="text-[#718096] font-medium mb-1">Tool sẽ chạy:</p>
            <p>• <span className="text-[#a78bfa]">subfinder</span> — passive subdomain enumeration</p>
            <p className="text-[#2d3748]">Mỗi lần chạy tạo snapshot lịch sử riêng biệt</p>
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || targets.length === 0}
              className="flex-1 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-sm rounded font-medium transition-colors disabled:opacity-40"
            >
              {loading ? 'Đang tạo job...' : '▶ Bắt đầu scan'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-sm rounded transition-colors">
              Huỷ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function SubdomainsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [targets,    setTargets]    = useState<Target[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<Subdomain | null>(null)

  const loadSubdomains = useCallback(async () => {
    const res = await subdomainApi.list(wsid)
    setSubdomains(res.data ?? [])
  }, [wsid])

  const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'RECON_SUBDOMAIN', loadSubdomains)

  useEffect(() => {
    Promise.all([loadSubdomains(), targetApi.list(wsid).then(setTargets)])
      .finally(() => setLoading(false))
  }, [wsid, loadSubdomains])

  const filtered = subdomains.filter(s =>
    !search || s.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={wsid} />

      <div className="p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Subdomains</h2>
            <p className="text-[11px] text-[#4a5568] mt-0.5">
              {loading ? 'Đang tải...' : `${subdomains.length} subdomain · click vào domain để xem lịch sử`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {subdomains.length > 0 && (
              <input type="text" placeholder="Tìm domain..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48"
              />
            )}
            <button onClick={() => loadSubdomains()}
              className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors" title="Làm mới">
              ↻
            </button>
            <button onClick={() => setShowModal(true)}
              className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
              ▶ Chạy Scan
            </button>
          </div>
        </div>

        {/* Active job banner */}
        {activeJob && (
          <div className={`mb-4 px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
            activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
            : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
            : activeJob.status === 'pending'   ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
            : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
          }`}>
            <JobBadge status={activeJob.status} />
            <span className="flex-1">
              {activeJob.status === 'running'   && 'Đang chạy subfinder, vui lòng chờ...'}
              {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
              {activeJob.status === 'completed' && `Hoàn thành — tìm thấy ${(activeJob.result as any)?.total ?? 0} subdomain`}
              {activeJob.status === 'failed'    && `Lỗi: ${activeJob.error_message}`}
            </span>
            <span className="font-mono tabular-nums flex-shrink-0">{elapsed}</span>
            {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
              <button onClick={() => setActiveJob(null)} className="opacity-50 hover:opacity-100">×</button>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-[#4a5568]">Đang tải...</div>
        ) : subdomains.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg">
            <div className="text-center py-16">
              <div className="text-3xl mb-3 text-[#2d3748]">⟡</div>
              <p className="text-sm text-[#4a5568] mb-1">Chưa có subdomain nào</p>
              <p className="text-xs text-[#2d3748] mb-4">Chạy scan để tìm subdomain của các target</p>
              <button onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
                ▶ Chạy Scan đầu tiên
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2330]">
                  {['Domain', 'IP Addresses', 'Nguồn', 'Alive', 'Cập nhật'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}
                    onClick={() => setSelected(s)}
                    className="border-b border-[#1e2330] last:border-0 hover:bg-[#1a1f2e] transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-2.5 w-56 max-w-[224px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[#e2e8f0] text-xs group-hover:text-[#a78bfa] transition-colors truncate" title={s.domain}>{s.domain}</span>
                        <CopyButton value={s.domain} />
                        <span className="text-[#2d3748] text-[9px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">→</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#718096] text-xs">
                      {s.ip_addresses?.length ? (
                        <div className="flex items-center gap-1.5">
                          <span>{s.ip_addresses.join(', ')}</span>
                          <CopyButton value={s.ip_addresses.join('\n')} />
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {s.sources?.length
                          ? s.sources.map(src => (
                              <span key={src} className="px-1.5 py-0.5 bg-[#1a1f2e] text-[#553c9a] rounded text-[10px]">{src}</span>
                            ))
                          : <span className="text-[#2d3748]">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><AliveBadge value={s.is_alive} /></td>
                    <td className="px-4 py-2.5 text-[#4a5568] text-[11px]">
                      {new Date(s.created_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
              <span className="text-[10px] text-[#2d3748]">
                {filtered.length !== subdomains.length ? `${filtered.length} / ${subdomains.length}` : subdomains.length} subdomains
              </span>
              <span className="text-[10px] text-[#2d3748]">
                {subdomains.filter(s => s.is_alive === true).length} alive · {subdomains.filter(s => s.is_alive === false).length} dead
              </span>
            </div>
          </div>
        )}
      </div>

      {/* History drawer */}
      {selected && (
        <HistoryDrawer wsid={wsid} domain={selected.domain} onClose={() => setSelected(null)} />
      )}

      {showModal && (
        <ScanModal targets={targets.filter(t => t.is_active)} wsid={wsid}
          onClose={() => setShowModal(false)} onJobCreated={job => setActiveJob(job)} />
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Job, Subdomain, Target, jobApi, subdomainApi, targetApi } from '@/lib/api'

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
          <a
            key={item.href}
            href={item.href}
            className={`px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
              ${active
                ? 'text-[#68d391] border-[#48bb78]'
                : 'text-[#4a5568] border-transparent hover:text-[#718096]'
              }`}
          >
            {item.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Job status badge ──────────────────────────────────────
function JobBadge({ job }: { job: Job }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Đang chờ',  cls: 'bg-[#1a1f2e] text-[#718096]' },
    running:   { label: 'Đang chạy', cls: 'bg-[#1a2434] text-[#4299e1] animate-pulse' },
    completed: { label: 'Xong',      cls: 'bg-[#1a2f1a] text-[#68d391]' },
    failed:    { label: 'Lỗi',       cls: 'bg-[#2d1a1a] text-[#fc8181]' },
  }
  const s = map[job.status] ?? map.pending
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({
  targets,
  wsid,
  onClose,
  onJobCreated,
}: {
  targets: Target[]
  wsid: string
  onClose: () => void
  onJobCreated: (job: Job) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTarget) { setError('Chọn target để scan'); return }
    const t = targets.find(t => t.id === selectedTarget)!
    setLoading(true)
    setError('')
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
              <p className="text-xs text-[#fc8181]">Workspace chưa có target. Thêm target trước.</p>
            ) : (
              <select
                value={selectedTarget}
                onChange={e => setSelectedTarget(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
              >
                {targets.map(t => (
                  <option key={t.id} value={t.id}>{t.domain}</option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-[#0d1117] border border-[#1e2330] rounded p-3 text-[11px] text-[#4a5568] space-y-1">
            <p className="text-[#718096] font-medium mb-1">Tool sẽ chạy:</p>
            <p>• <span className="text-[#a78bfa]">subfinder</span> — passive subdomain enumeration</p>
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
export default function SubdomainsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [targets, setTargets]       = useState<Target[]>([])
  const [activeJob, setActiveJob]   = useState<Job | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [search, setSearch]         = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSubdomains = useCallback(async () => {
    const res = await subdomainApi.list(wsid)
    setSubdomains(res.data ?? [])
  }, [wsid])

  useEffect(() => {
    Promise.all([loadSubdomains(), targetApi.list(wsid).then(setTargets)])
      .finally(() => setLoading(false))
  }, [wsid, loadSubdomains])

  // Poll job status
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return

    pollRef.current = setInterval(async () => {
      try {
        const updated = await jobApi.get(wsid, activeJob.id)
        setActiveJob(updated)
        if (updated.status === 'completed') {
          await loadSubdomains()
          clearInterval(pollRef.current!)
        } else if (updated.status === 'failed') {
          clearInterval(pollRef.current!)
        }
      } catch {}
    }, 3000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob?.id, activeJob?.status, wsid, loadSubdomains])

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
              {loading ? 'Đang tải...' : `${subdomains.length} subdomain đã tìm thấy`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {subdomains.length > 0 && (
              <input
                type="text"
                placeholder="Tìm domain..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48"
              />
            )}
            <button
              onClick={() => loadSubdomains()}
              className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors"
              title="Làm mới"
            >
              ↻
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors"
            >
              ▶ Chạy Scan
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
              {activeJob.status === 'running' && 'Đang chạy subfinder, vui lòng chờ...'}
              {activeJob.status === 'completed' && `Hoàn thành — tìm thấy ${(activeJob.result as any)?.total ?? 0} subdomain`}
              {activeJob.status === 'failed' && `Lỗi: ${activeJob.error_message}`}
              {activeJob.status === 'pending' && 'Job đang chờ worker xử lý...'}
            </span>
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
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors"
              >
                ▶ Chạy Scan đầu tiên
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2330]">
                  {['Domain', 'IP Addresses', 'Nguồn', 'Alive', 'Phát hiện'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-[#1e2330] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[#e2e8f0] text-xs">{s.domain}</td>
                    <td className="px-4 py-2.5 font-mono text-[#718096] text-xs">
                      {s.ip_addresses.length > 0 ? s.ip_addresses.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {s.sources.length > 0
                          ? s.sources.map(src => (
                              <span key={src} className="px-1.5 py-0.5 bg-[#1a1f2e] text-[#553c9a] rounded text-[10px]">
                                {src}
                              </span>
                            ))
                          : <span className="text-[#2d3748]">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.is_alive === null
                        ? <span className="text-[#2d3748] text-[10px]">—</span>
                        : s.is_alive
                          ? <span className="px-2 py-0.5 bg-[#1a2f1a] text-[#68d391] text-[10px] rounded font-semibold">Alive</span>
                          : <span className="px-2 py-0.5 bg-[#1a1f2e] text-[#4a5568] text-[10px] rounded font-semibold">Down</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-[#4a5568] text-[11px]">
                      {new Date(s.created_at).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
              <span className="text-[10px] text-[#2d3748]">
                {filtered.length !== subdomains.length ? `${filtered.length} / ${subdomains.length}` : `${subdomains.length}`} subdomains
              </span>
              <span className="text-[10px] text-[#2d3748]">
                {subdomains.filter(s => s.is_alive).length} alive
              </span>
            </div>
          </div>
        )}
      </div>

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

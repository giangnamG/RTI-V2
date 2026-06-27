'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Job, Port, Target, jobApi, portApi, targetApi } from '@/lib/api'
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

// ── Service badge ─────────────────────────────────────────
const SVC_COLORS: Record<string, string> = {
  http:          'bg-[#1a3a5c] text-[#63b3ed]',
  https:         'bg-[#1a2a4a] text-[#4299e1]',
  ssh:           'bg-[#2d1f52] text-[#b794f4]',
  ftp:           'bg-[#1f3a2d] text-[#68d391]',
  smtp:          'bg-[#2d3a1f] text-[#c6f6d5]',
  smtps:         'bg-[#2d3a1f] text-[#9ae6b4]',
  dns:           'bg-[#2a2d3a] text-[#a0aec0]',
  mysql:         'bg-[#3a1f1f] text-[#fc8181]',
  postgresql:    'bg-[#1f2a3a] text-[#76e4f7]',
  redis:         'bg-[#3a2d1f] text-[#fbd38d]',
  mongodb:       'bg-[#2a3a1f] text-[#9ae6b4]',
  rdp:           'bg-[#3a1f2d] text-[#feb2c0]',
  smb:           'bg-[#3a2a1f] text-[#f6ad55]',
  elasticsearch: 'bg-[#1f3a38] text-[#4fd1c5]',
  vnc:           'bg-[#2a1f3a] text-[#d6bcfa]',
  'http-alt':    'bg-[#1a3245] text-[#90cdf4]',
  'https-alt':   'bg-[#1a2745] text-[#63b3ed]',
}

function ServiceBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-[#2d3748]">—</span>
  const cls = SVC_COLORS[name] ?? 'bg-[#1a1f2e] text-[#718096]'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${cls}`}>{name}</span>
  )
}

// ── Scan modal ────────────────────────────────────────────
const TOP_PORT_OPTIONS = [
  { value: '100',  label: 'Top 100  — nhanh (~1 phút)' },
  { value: '500',  label: 'Top 500  — trung bình (~3 phút)' },
  { value: '1000', label: 'Top 1000 — chậm hơn (~10 phút)' },
  { value: 'full', label: 'Full scan — tất cả 65535 port (rất lâu)' },
]

function ScanModal({
  targets, wsid, onClose, onJobCreated,
}: {
  targets: Target[]; wsid: string; onClose: () => void; onJobCreated: (j: Job) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.id ?? '')
  const [topPorts,       setTopPorts]       = useState('100')
  const [customPorts,    setCustomPorts]    = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const target = targets.find(t => t.id === selectedTarget)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTarget) { setError('Chọn target để scan'); return }
    setLoading(true); setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'SCAN_PORT',
        target_id: selectedTarget,
        payload: {
          workspace_id: wsid,
          target_id:    selectedTarget,
          domain:       target?.domain ?? '',
          top_ports:    topPorts,
          custom_ports: customPorts.trim() || undefined,
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
          <h2 className="font-semibold text-[#e2e8f0] text-sm">Chạy Port Scan</h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Target */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Chọn target</label>
            {targets.length === 0 ? (
              <p className="text-xs text-[#fc8181]">Workspace chưa có target.</p>
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
            {target && (
              <p className="text-[10px] text-[#4a5568] mt-1">
                Sẽ scan domain chính + tất cả subdomains đã tìm thấy
              </p>
            )}
          </div>

          {/* Port range */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Dải port</label>
            <select
              value={topPorts}
              onChange={e => setTopPorts(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              {TOP_PORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Custom ports */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">
              Port tùy chỉnh <span className="text-[#2d3748]">(tùy chọn — sẽ ghi đè dải port)</span>
            </label>
            <input
              type="text"
              placeholder="80,443,8080,3306"
              value={customPorts}
              onChange={e => setCustomPorts(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {/* Info */}
          <div className="bg-[#0d1117] border border-[#1e2330] rounded p-3 text-[11px] text-[#4a5568] space-y-1">
            <p className="text-[#718096] font-medium mb-1">Tool sẽ chạy:</p>
            <p>• <span className="text-[#a78bfa]">naabu</span> — port scanner (ProjectDiscovery)</p>
            <p className="text-[#2d3748]">Rate: 500 pps · Timeout: 10s · Retries: 2</p>
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
export default function PortsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [ports,     setPorts]     = useState<Port[]>([])
  const [targets,   setTargets]   = useState<Target[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search,    setSearch]    = useState('')

  const loadPorts = useCallback(async () => {
    const res = await portApi.list(wsid)
    setPorts(res.data ?? [])
  }, [wsid])

  const { activeJob, setActiveJob } = useJobPolling(wsid, 'SCAN_PORT', loadPorts)

  useEffect(() => {
    Promise.all([loadPorts(), targetApi.list(wsid).then(setTargets)])
      .finally(() => setLoading(false))
  }, [wsid, loadPorts])

  const filtered = ports.filter(p =>
    !search || p.host.toLowerCase().includes(search.toLowerCase()) ||
    String(p.port).includes(search) || (p.service_name ?? '').includes(search)
  )

  // Group ports by host for display
  const hosts = Array.from(new Set(filtered.map(p => p.host)))

  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={wsid} />

      <div className="p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Ports & Services</h2>
            <p className="text-[11px] text-[#4a5568] mt-0.5">
              {loading ? 'Đang tải...' : `${ports.length} open port trên ${hosts.length} host`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ports.length > 0 && (
              <input
                type="text"
                placeholder="Tìm host, port, service..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-52"
              />
            )}
            <button
              onClick={() => loadPorts()}
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
              {activeJob.status === 'running'   && 'Đang chạy naabu, vui lòng chờ...'}
              {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as any
                return `Hoàn thành — ${r?.open_ports ?? 0} open port · ${r?.alive_hosts ?? 0} alive · ${r?.dead_hosts ?? 0} dead`
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
        ) : ports.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg">
            <div className="text-center py-16">
              <div className="text-3xl mb-3 text-[#2d3748]">⬡</div>
              <p className="text-sm text-[#4a5568] mb-1">Chưa có port nào</p>
              <p className="text-xs text-[#2d3748] mb-4">Chạy scan để tìm open ports của các target</p>
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
                  {['Host', 'IP Address', 'Port', 'Proto', 'Service', 'Phát hiện'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">
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
                      className={`border-b border-[#1e2330] last:border-0 hover:bg-[#1a1f2e] transition-colors ${
                        isNewHost && i > 0 ? 'border-t border-t-[#2d3748]' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-[#e2e8f0] text-xs">
                        {isNewHost ? p.host : <span className="text-[#2d3748]">↳</span>}
                      </td>
                      <td className="px-4 py-2 font-mono text-[#718096] text-xs">
                        {p.ip_address ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[#fbd38d] font-semibold text-xs">{p.port}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[10px] text-[#4a5568] font-mono uppercase">{p.protocol}</span>
                      </td>
                      <td className="px-4 py-2">
                        <ServiceBadge name={p.service_name} />
                      </td>
                      <td className="px-4 py-2 text-[#4a5568] text-[11px]">
                        {new Date(p.created_at).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
              <span className="text-[10px] text-[#2d3748]">
                {filtered.length !== ports.length
                  ? `${filtered.length} / ${ports.length}` : `${ports.length}`} ports
              </span>
              <span className="text-[10px] text-[#2d3748]">
                {hosts.length} host · {Array.from(new Set(ports.map(p => p.service_name).filter(Boolean))).length} services
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

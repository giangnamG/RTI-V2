'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Finding, FindingInput, FindingSeverity, FindingStats, FindingStatus, FindingType,
  Target, findingApi, targetApi,
} from '@/lib/api'
import { CopyButton } from '@/components/ui/CopyButton'

// ── Constants ─────────────────────────────────────────────
const SEVERITIES: { value: FindingSeverity; label: string; cls: string; dot: string }[] = [
  { value: 'critical', label: 'Critical', cls: 'bg-[#3d0f0f] text-[#fc8181] border-[#7a1f1f]', dot: '#fc8181' },
  { value: 'high',     label: 'High',     cls: 'bg-[#3a1f0a] text-[#f6ad55] border-[#7a3f10]', dot: '#f6ad55' },
  { value: 'medium',   label: 'Medium',   cls: 'bg-[#2d2a0a] text-[#f6e05e] border-[#6b5e10]', dot: '#f6e05e' },
  { value: 'low',      label: 'Low',      cls: 'bg-[#0a2d1f] text-[#68d391] border-[#276749]', dot: '#68d391' },
  { value: 'info',     label: 'Info',     cls: 'bg-[#0a1f3a] text-[#63b3ed] border-[#1a4a7a]', dot: '#63b3ed' },
]

const TYPES: { value: FindingType; label: string }[] = [
  { value: 'vulnerability',    label: 'Vulnerability' },
  { value: 'misconfiguration', label: 'Misconfiguration' },
  { value: 'exposure',         label: 'Exposure' },
  { value: 'credential',       label: 'Credential' },
  { value: 'informational',    label: 'Informational' },
]

const STATUSES: { value: FindingStatus; label: string; cls: string }[] = [
  { value: 'open',            label: 'Open',          cls: 'bg-[#1a1f2e] text-[#718096]' },
  { value: 'confirmed',       label: 'Confirmed',     cls: 'bg-[#3d0f0f] text-[#fc8181]' },
  { value: 'false_positive',  label: 'False Positive',cls: 'bg-[#1a1f2e] text-[#4a5568]' },
  { value: 'fixed',           label: 'Fixed',         cls: 'bg-[#0a2d1f] text-[#68d391]' },
]

function sevMeta(s: string) {
  return SEVERITIES.find(x => x.value === s) ?? SEVERITIES[4]
}
function statusMeta(s: string) {
  return STATUSES.find(x => x.value === s) ?? STATUSES[0]
}

// ── Severity badge ────────────────────────────────────────
function SeverityBadge({ value }: { value: string }) {
  const m = sevMeta(value)
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  )
}

// ── Status badge ──────────────────────────────────────────
function StatusBadge({ value }: { value: string }) {
  const m = statusMeta(value)
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  )
}

// ── Stats bar ─────────────────────────────────────────────
function StatsBar({ stats, filter, onFilter }: {
  stats: FindingStats
  filter: string
  onFilter: (s: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {SEVERITIES.map(s => (
        <button
          key={s.value}
          onClick={() => onFilter(filter === s.value ? '' : s.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] font-medium transition-all
            ${filter === s.value ? s.cls : 'bg-[#141720] border-[#1e2330] text-[#4a5568] hover:border-[#2d3748] hover:text-[#718096]'}`}
        >
          <span className="text-sm font-bold">{stats[s.value] ?? 0}</span>
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Finding modal (Create / Edit) ─────────────────────────
function FindingModal({
  wsid, targets, initial, onSave, onClose,
}: {
  wsid: string
  targets: Target[]
  initial?: Finding
  onSave: (f: Finding) => void
  onClose: () => void
}) {
  const isEdit = !!initial

  const [form, setForm] = useState<FindingInput>({
    title:       initial?.title       ?? '',
    severity:    initial?.severity    ?? 'medium',
    type:        initial?.type        ?? 'vulnerability',
    status:      initial?.status      ?? 'open',
    target_id:   initial?.target_id   ?? '',
    cve_id:      initial?.cve_id      ?? '',
    cvss_score:  initial?.cvss_score  ?? null,
    host:        initial?.host        ?? '',
    url:         initial?.url         ?? '',
    port:        initial?.port        ?? null,
    evidence:    initial?.evidence    ?? '',
    source:      initial?.source      ?? '',
    remediation: initial?.remediation ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function set(k: keyof FindingInput, v: any) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title bắt buộc'); return }
    setLoading(true); setError('')
    try {
      const payload: FindingInput = {
        ...form,
        cve_id:      form.cve_id      || null,
        host:        form.host        || null,
        url:         form.url         || null,
        evidence:    form.evidence    || null,
        source:      form.source      || null,
        remediation: form.remediation || null,
        target_id:   form.target_id   || undefined,
      }
      const f = isEdit
        ? await findingApi.update(wsid, initial!.id, payload)
        : await findingApi.create(wsid, payload)
      onSave(f)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-2xl my-8">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">
            {isEdit ? 'Chỉnh sửa Finding' : 'Thêm Finding mới'}
          </h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Title <span className="text-[#fc8181]">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="SQL Injection tại /api/login"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {/* Severity + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Severity</label>
              <select value={form.severity} onChange={e => set('severity', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Status + Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Target</label>
              <select value={form.target_id ?? ''} onChange={e => set('target_id', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                <option value="">— không gắn target —</option>
                {targets.map(t => <option key={t.id} value={t.id}>{t.domain}</option>)}
              </select>
            </div>
          </div>

          {/* CVE + CVSS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">CVE ID <span className="text-[#4a5568]">(tùy chọn)</span></label>
              <input
                type="text"
                value={form.cve_id ?? ''}
                onChange={e => set('cve_id', e.target.value)}
                placeholder="CVE-2021-44228"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">CVSS Score <span className="text-[#4a5568]">(0–10)</span></label>
              <input
                type="number"
                step="0.1" min="0" max="10"
                value={form.cvss_score ?? ''}
                onChange={e => set('cvss_score', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="9.8"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
              />
            </div>
          </div>

          {/* Host + Port + URL */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Host</label>
              <input type="text" value={form.host ?? ''} onChange={e => set('host', e.target.value)}
                placeholder="10.0.0.1"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]" />
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Port</label>
              <input type="number" value={form.port ?? ''} onChange={e => set('port', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="443"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]" />
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">URL</label>
              <input type="text" value={form.url ?? ''} onChange={e => set('url', e.target.value)}
                placeholder="https://example.com/api"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]" />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Source <span className="text-[#4a5568]">(tool hoặc manual)</span></label>
            <input type="text" value={form.source ?? ''} onChange={e => set('source', e.target.value)}
              placeholder="nuclei / manual / wpscan / ..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]" />
          </div>

          {/* Evidence */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Evidence <span className="text-[#4a5568]">(request/response, mô tả)</span></label>
            <textarea rows={4} value={form.evidence ?? ''} onChange={e => set('evidence', e.target.value)}
              placeholder="GET /api/user?id=1 OR 1=1--&#10;Response: 200 OK, data leaked..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-xs text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] resize-none" />
          </div>

          {/* Remediation */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Remediation</label>
            <textarea rows={2} value={form.remediation ?? ''} onChange={e => set('remediation', e.target.value)}
              placeholder="Sử dụng prepared statement, validate input..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-xs text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] resize-none" />
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-sm rounded font-medium transition-colors disabled:opacity-40">
              {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm Finding'}
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

// ── Detail drawer ─────────────────────────────────────────
function DetailDrawer({
  wsid, finding, onEdit, onStatusChange, onDelete, onClose,
}: {
  wsid: string
  finding: Finding
  onEdit: () => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [delConfirm, setDelConfirm] = useState(false)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[540px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e2330] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <SeverityBadge value={finding.severity} />
              <StatusBadge value={finding.status} />
              {finding.cve_id && (
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-[#1a1a3a] text-[#b794f4] text-[10px] rounded font-mono">
                    {finding.cve_id}
                  </span>
                  <CopyButton value={finding.cve_id} />
                </div>
              )}
            </div>
            <p className="text-sm text-[#e2e8f0] font-medium leading-snug">{finding.title}</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Type',   value: TYPES.find(t => t.value === finding.type)?.label ?? finding.type },
              { label: 'Source', value: finding.source ?? '—' },
              { label: 'Host',   value: finding.host   ?? '—', copy: finding.host },
              { label: 'Port',   value: finding.port   ? String(finding.port) : '—' },
              { label: 'CVSS',   value: finding.cvss_score != null ? String(finding.cvss_score) : '—' },
              { label: 'Phát hiện', value: new Date(finding.created_at).toLocaleString('vi-VN') },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[#4a5568] text-[10px] mb-0.5">{item.label}</p>
                <div className="flex items-center gap-1 group">
                  <p className="text-[#e2e8f0] font-mono">{item.value}</p>
                  {item.copy && <CopyButton value={item.copy} />}
                </div>
              </div>
            ))}
          </div>

          {/* URL */}
          {finding.url && (
            <div>
              <p className="text-[#4a5568] text-[10px] mb-1">URL</p>
              <div className="flex items-center gap-1.5 group">
                <a href={finding.url} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[#63b3ed] hover:underline text-xs break-all">
                  {finding.url}
                </a>
                <CopyButton value={finding.url} />
              </div>
            </div>
          )}

          {/* Evidence */}
          {finding.evidence && (
            <div>
              <p className="text-[#4a5568] text-[10px] mb-1">Evidence</p>
              <pre className="bg-[#141720] border border-[#1e2330] rounded p-3 text-[11px] text-[#a0aec0] font-mono whitespace-pre-wrap break-all overflow-auto max-h-48">
                {finding.evidence}
              </pre>
            </div>
          )}

          {/* Remediation */}
          {finding.remediation && (
            <div>
              <p className="text-[#4a5568] text-[10px] mb-1">Remediation</p>
              <p className="text-xs text-[#718096] leading-relaxed">{finding.remediation}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-[#1e2330] space-y-3">
          {/* Status quick-change */}
          <div>
            <p className="text-[10px] text-[#4a5568] mb-2">Đổi trạng thái</p>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map(s => (
                <button key={s.value}
                  onClick={() => { onStatusChange(finding.id, s.value); onClose() }}
                  disabled={finding.status === s.value}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-30
                    ${finding.status === s.value ? s.cls + ' opacity-30' : 'border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0]'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onEdit}
              className="flex-1 py-2 border border-[#553c9a] text-[#a78bfa] hover:bg-[#1a1f2e] text-xs rounded font-medium transition-colors">
              ✎ Chỉnh sửa
            </button>
            {!delConfirm ? (
              <button onClick={() => setDelConfirm(true)}
                className="px-4 py-2 border border-[#2d3748] text-[#4a5568] hover:text-[#fc8181] hover:border-[#742a2a] text-xs rounded transition-colors">
                Xoá
              </button>
            ) : (
              <button onClick={() => { onDelete(finding.id); onClose() }}
                className="px-4 py-2 bg-[#742a2a] text-[#fc8181] text-xs rounded font-medium transition-colors">
                Xác nhận xoá
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function FindingsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [findings,  setFindings]  = useState<Finding[]>([])
  const [stats,     setStats]     = useState<FindingStats>({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })
  const [targets,   setTargets]   = useState<Target[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<Finding | undefined>()
  const [selected,  setSelected]  = useState<Finding | null>(null)
  const [search,    setSearch]    = useState('')
  const [sevFilter, setSevFilter] = useState('')
  const [typeFilter,setTypeFilter]= useState('')
  const [stsFilter, setStsFilter] = useState('')

  const loadFindings = useCallback(async () => {
    const res = await findingApi.list(wsid, {
      severity: sevFilter || undefined,
      type:     typeFilter || undefined,
      status:   stsFilter  || undefined,
    })
    setFindings(res.data ?? [])
    setStats(res.stats ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 })
  }, [wsid, sevFilter, typeFilter, stsFilter])

  useEffect(() => {
    Promise.all([loadFindings(), targetApi.list(wsid).then(setTargets)])
      .finally(() => setLoading(false))
  }, [wsid, loadFindings])

  const filtered = findings.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      f.title.toLowerCase().includes(q) ||
      (f.cve_id ?? '').toLowerCase().includes(q) ||
      (f.host ?? '').toLowerCase().includes(q) ||
      (f.url ?? '').toLowerCase().includes(q) ||
      (f.source ?? '').toLowerCase().includes(q)
    )
  })

  async function handleSave(f: Finding) {
    await loadFindings()
    setSelected(f)
  }

  async function handleStatusChange(id: string, status: string) {
    const updated = await findingApi.updateStatus(wsid, id, status)
    setFindings(prev => prev.map(f => f.id === id ? updated : f))
    await loadFindings()
  }

  async function handleDelete(id: string) {
    await findingApi.delete(wsid, id)
    setFindings(prev => prev.filter(f => f.id !== id))
    await loadFindings()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Findings</h2>
            <p className="text-[11px] text-[#4a5568] mt-0.5">
              {loading ? 'Đang tải...' : `${findings.length} findings · click để xem chi tiết`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
              <option value="">Tất cả type</option>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={stsFilter} onChange={e => setStsFilter(e.target.value)}
              className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
              <option value="">Tất cả status</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {findings.length > 0 && (
              <input type="text" placeholder="Tìm title, CVE, host..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48" />
            )}
            <button onClick={loadFindings}
              className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors" title="Làm mới">
              ↻
            </button>
            <button onClick={() => { setEditing(undefined); setShowModal(true) }}
              className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
              + Thêm Finding
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mb-4">
          <StatsBar stats={stats} filter={sevFilter} onFilter={setSevFilter} />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-[#4a5568]">Đang tải...</div>
        ) : findings.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg">
            <div className="text-center py-16">
              <div className="text-3xl mb-3 text-[#2d3748]">◎</div>
              <p className="text-sm text-[#4a5568] mb-1">Chưa có finding nào</p>
              <p className="text-xs text-[#2d3748] mb-4">Thêm finding thủ công hoặc import từ các module Attack</p>
              <button onClick={() => { setEditing(undefined); setShowModal(true) }}
                className="px-4 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
                + Thêm Finding đầu tiên
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2330]">
                  {['Severity', 'Title', 'Type', 'Host / URL', 'CVE', 'Status', 'Ngày'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}
                    onClick={() => setSelected(f)}
                    className="border-b border-[#1e2330] last:border-0 hover:bg-[#1a1f2e] transition-colors cursor-pointer group"
                  >
                    {/* Severity */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: sevMeta(f.severity).dot }} />
                        <SeverityBadge value={f.severity} />
                      </div>
                    </td>

                    {/* Title */}
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <p className="text-[#e2e8f0] text-xs font-medium truncate" title={f.title}>{f.title}</p>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-2.5">
                      <span className="text-[#718096] text-[10px]">
                        {TYPES.find(t => t.value === f.type)?.label ?? f.type}
                      </span>
                    </td>

                    {/* Host / URL */}
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {f.host ? (
                        <div className="flex items-center gap-1 group/copy min-w-0">
                          <span className="font-mono text-[#718096] text-[10px] truncate">{f.host}{f.port ? `:${f.port}` : ''}</span>
                          <CopyButton value={f.host} className="group-hover/copy:opacity-100" />
                        </div>
                      ) : f.url ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-mono text-[#63b3ed] text-[10px] truncate" title={f.url}>{f.url}</span>
                          <CopyButton value={f.url} />
                        </div>
                      ) : (
                        <span className="text-[#2d3748]">—</span>
                      )}
                    </td>

                    {/* CVE */}
                    <td className="px-4 py-2.5">
                      {f.cve_id ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[#b794f4] text-[10px]">{f.cve_id}</span>
                          <CopyButton value={f.cve_id} />
                        </div>
                      ) : (
                        <span className="text-[#2d3748]">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusBadge value={f.status} />
                    </td>

                    {/* Date */}
                    <td className="px-4 py-2.5 text-[#4a5568] text-[10px] whitespace-nowrap">
                      {new Date(f.created_at).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
              <span className="text-[10px] text-[#2d3748]">
                {filtered.length !== findings.length ? `${filtered.length} / ${findings.length}` : filtered.length} findings
              </span>
              <span className="text-[10px] text-[#2d3748]">
                {findings.filter(f => f.status === 'open' || f.status === 'confirmed').length} active
                · {findings.filter(f => f.status === 'fixed').length} fixed
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          wsid={wsid}
          finding={selected}
          onEdit={() => { setEditing(selected); setShowModal(true); setSelected(null) }}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <FindingModal
          wsid={wsid}
          targets={targets.filter(t => t.is_active)}
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(undefined) }}
        />
      )}
    </div>
  )
}

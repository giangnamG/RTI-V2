'use client'

import { useEffect, useState } from 'react'
import { request, nucleiFindingApi } from '@/lib/api'

// Drawer lịch sử thu thập — dùng chung cho VulnModule + FirestorePanel.
// 2 chế độ: per-finding (click 1 row, lọc theo identity) | per-tool (nhóm theo job_id).

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-[#4a1a1a] text-[#fc8181]',
  high:     'bg-[#3a2010] text-[#f6ad55]',
  medium:   'bg-[#3a3010] text-[#f6e05e]',
  low:      'bg-[#1a3a1a] text-[#68d391]',
  info:     'bg-[#1a2a3a] text-[#63b3ed]',
}

export interface HistFull {
  id: string
  title: string
  severity: string
  type: string | null
  status: string | null
  host: string | null
  url: string | null
  port: number | null
  cve_id: string | null
  cvss_score: number | null
  evidence: string | null
  remediation: string | null
  template_id?: string | null
  matcher_name?: string | null
  protocol?: string | null
  extracted_results?: string[] | null
  job_id: string | null
  created_at: string
}

const eqOrNull = (a: string | null, b: string | null) => (a ?? '') === (b ?? '')

// 1 dòng field; tự ẩn nếu rỗng. KHÔNG hiển thị id/index DB.
function Field({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-2">
      <span className="text-[#4a5568] w-24 flex-shrink-0">{label}</span>
      <span className={`text-[#cbd5e0] break-words min-w-0 ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
    </div>
  )
}

export function VulnHistoryDrawer({
  wsid, domain, tool, label, isNuclei, finding, onClose,
}: {
  wsid: string; domain: string; tool: string; label: string; isNuclei: boolean
  finding?: { title: string; host: string | null; url: string | null } | null
  onClose: () => void
}) {
  const [items, setItems]     = useState<HistFull[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load: Promise<HistFull[]> = isNuclei
      ? nucleiFindingApi.history(wsid).then(r =>
          (r.data ?? []).map(f => ({
            id: f.id, title: f.title, severity: f.severity, type: f.type, status: f.status,
            host: f.host, url: f.url, port: f.port, cve_id: f.cve_id, cvss_score: f.cvss_score,
            evidence: f.evidence, remediation: f.remediation,
            template_id: f.template_id, matcher_name: f.matcher_name, protocol: f.protocol,
            extracted_results: f.extracted_results, job_id: f.job_id, created_at: f.created_at,
          })))
      : request<{ data: HistFull[] }>(
          `/api/workspaces/${wsid}/vuln-findings/history?domain=${encodeURIComponent(domain)}&tool=${encodeURIComponent(tool)}`
        ).then(r => r.data ?? [])
    load.then(setItems).catch(console.error).finally(() => setLoading(false))
  }, [wsid, domain, tool, isNuclei])

  // PER-FINDING: lọc theo identity (title + host + url), mới nhất lên đầu
  const occ = finding
    ? items
        .filter(f => f.title === finding.title && eqOrNull(f.host, finding.host) && eqOrNull(f.url, finding.url))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    : null

  // PER-TOOL: nhóm theo job_id → từng phiên scan
  const sessions = items.reduce<{ jobId: string | null; scannedAt: string; rows: HistFull[] }[]>((acc, f) => {
    const key = f.job_id ?? 'unknown'
    const existing = acc.find(s => (s.jobId ?? 'unknown') === key)
    if (existing) existing.rows.push(f)
    else acc.push({ jobId: f.job_id, scannedAt: f.created_at, rows: [f] })
    return acc
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2330] flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-[#4a5568] mb-0.5">
              {finding ? 'Lịch sử thu thập của finding' : 'Lịch sử thu thập'}
            </p>
            <p className="text-sm text-[#e2e8f0] break-words">{label}</p>
            {finding?.host && <p className="font-mono text-[10px] text-[#4a5568] mt-0.5 truncate">{finding.host}</p>}
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-xl leading-none ml-4 mt-0.5 flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Đang tải...</div>
          ) : occ ? (
            occ.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Chưa có lịch sử</div>
            ) : (
              <div className="divide-y divide-[#1e2330]">
                {occ.map((f, i) => (
                  <div key={f.id} className={`px-5 py-4 ${i === 0 ? 'bg-[#141720]' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {i === 0 && <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>}
                      {i === occ.length - 1 && occ.length > 1 && <span className="px-1.5 py-0.5 bg-[#1a2a3a] text-[#63b3ed] text-[9px] rounded font-semibold">LẦN ĐẦU</span>}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${SEV_COLORS[f.severity] ?? ''}`}>{f.severity}</span>
                      <span className="text-xs text-[#e2e8f0]">{new Date(f.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <Field label="Type"      value={f.type} />
                      <Field label="Status"    value={f.status} />
                      <Field label="Host"      value={f.host} mono />
                      <Field label="URL"       value={f.url} mono />
                      <Field label="Port"      value={f.port} />
                      <Field label="CVE"       value={f.cve_id} />
                      <Field label="CVSS"      value={f.cvss_score} />
                      <Field label="Template"  value={f.template_id} mono />
                      <Field label="Matcher"   value={f.matcher_name} mono />
                      <Field label="Protocol"  value={f.protocol} />
                      <Field label="Extracted" value={f.extracted_results?.length ? f.extracted_results.join(', ') : null} mono />
                      {f.evidence && (
                        <div>
                          <span className="text-[#4a5568]">Evidence</span>
                          <pre className="mt-1 whitespace-pre-wrap break-all bg-[#0d1117] border border-[#1e2330] rounded p-2 text-[10px] text-[#a0aec0] max-h-44 overflow-auto">{f.evidence}</pre>
                        </div>
                      )}
                      {f.remediation && (
                        <div>
                          <span className="text-[#4a5568]">Remediation</span>
                          <p className="mt-0.5 text-[#cbd5e0] leading-relaxed">{f.remediation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-[#4a5568]">Chưa có lịch sử</div>
          ) : (
            <div className="divide-y divide-[#1e2330]">
              {sessions.map((s, i) => (
                <div key={s.jobId ?? i} className={`px-5 py-4 ${i === 0 ? 'bg-[#141720]' : ''}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {i === 0 && (
                      <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>
                    )}
                    <span className="text-xs text-[#e2e8f0] font-medium">
                      {new Date(s.scannedAt).toLocaleString('vi-VN')}
                    </span>
                    <span className="text-[10px] text-[#4a5568]">· {s.rows.length} finding</span>
                  </div>
                  <div className="space-y-1">
                    {s.rows.map(f => (
                      <div key={f.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0 ${SEV_COLORS[f.severity] ?? ''}`}>{f.severity}</span>
                        <span className="text-[#cbd5e0] truncate" title={f.title}>{f.title}</span>
                      </div>
                    ))}
                  </div>
                  {s.jobId && <p className="mt-2 text-[10px] text-[#2d3748] font-mono">Job: {s.jobId.slice(0, 8)}…</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#1e2330]">
          <p className="text-[10px] text-[#2d3748]">
            {occ ? `${occ.length} lần phát hiện` : `${sessions.length} lần chạy`}
          </p>
        </div>
      </div>
    </>
  )
}

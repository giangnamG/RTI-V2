'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  request, jobApi, wordpressApi,
  type WordPressTarget, type WPScanFinding, type WPProbeFinding, type Job,
} from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'

const SEV: Record<string, string> = {
  critical: 'bg-[#4a1a1a] text-[#fc8181]',
  high:     'bg-[#3a2010] text-[#f6ad55]',
  medium:   'bg-[#3a3010] text-[#f6e05e]',
  low:      'bg-[#1a3a1a] text-[#68d391]',
  info:     'bg-[#1a2a3a] text-[#63b3ed]',
}

function Sev({ s }: { s: string }) {
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEV[s] ?? SEV.info}`}>{s}</span>
}

// Module con WordPress: liệt kê toàn bộ host có tag WordPress + chạy WPScan/WPProbe + bảng findings.
export function WordPressPanel({ wsid, domain, tool }: { wsid: string; domain: string; tool: string }) {
  const [targets, setTargets] = useState<WordPressTarget[]>([])
  const [wpscan,  setWpscan]  = useState<WPScanFinding[]>([])
  const [wpprobe, setWpprobe] = useState<WPProbeFinding[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [severity, setSeverity] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState<string | null>(null)

  const isWpscan = tool === 'wpscan'
  const toolLabel = isWpscan ? 'WPScan' : 'WPProbe'

  const doFetch = useCallback(async () => {
    try {
      const [t, ws, wp] = await Promise.all([
        wordpressApi.targets(wsid),
        wordpressApi.wpscan(wsid, severity ? { severity } : undefined),
        wordpressApi.wpprobe(wsid, severity ? { severity } : undefined),
      ])
      setTargets(t.data ?? [])
      setWpscan(ws.data ?? [])
      setWpprobe(wp.data ?? [])
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [wsid, severity])

  // Theo dõi job RIÊNG cho từng tool (2 poller độc lập) → WPScan & WPProbe chạy + hiển thị
  // song song. Banner/nút chỉ bám tool của TAB đang chọn; tool kia vẫn được theo dõi ở nền.
  const matchWpscan = useCallback((j: Job): boolean => {
    const ds = j.payload?.domains as string[] | undefined
    const ts = j.payload?.tools as string[] | undefined
    return !!ds?.includes(domain) && !!ts?.includes('wpscan')
  }, [domain])
  const matchWpprobe = useCallback((j: Job): boolean => {
    const ds = j.payload?.domains as string[] | undefined
    const ts = j.payload?.tools as string[] | undefined
    return !!ds?.includes(domain) && !!ts?.includes('wpprobe')
  }, [domain])

  const scanPoll  = useJobPolling(wsid, 'VULN_DISPATCH', doFetch, 3000, { onProgress: doFetch, matchJob: matchWpscan })
  const probePoll = useJobPolling(wsid, 'VULN_DISPATCH', doFetch, 3000, { onProgress: doFetch, matchJob: matchWpprobe })
  const { activeJob, setActiveJob, elapsed } = isWpscan ? scanPoll : probePoll
  const running = activeJob?.status === 'running' || activeJob?.status === 'pending'
  const runningTool = toolLabel

  useEffect(() => { setLoading(true); doFetch().finally(() => setLoading(false)) }, [doFetch])

  const toggle = (tid: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(tid)) n.delete(tid); else n.add(tid)
    return n
  })

  const run = async (t: string) => {
    try {
      const payload: Record<string, unknown> = { workspace_id: wsid, domains: [domain], tools: [t] }
      if (selected.size > 0) payload.target_ids = [...selected]
      const job = await jobApi.create(wsid, { job_type: 'VULN_DISPATCH', payload })
      setActiveJob(job)
    } catch {
      setErr('Không tạo được job — xem backend logs')
    }
  }

  const findingsCount = isWpscan ? wpscan.length : wpprobe.length

  return (
    <div className="space-y-5">
      {/* Banner job — cơ chế polling chung */}
      {activeJob && (
        <div className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
          activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
          : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
          : activeJob.status === 'pending'   ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
          : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
        }`}>
          {running && <span className="inline-block w-2.5 h-2.5 rounded-full bg-current animate-pulse flex-shrink-0" />}
          <span className="flex-1">
            {activeJob.status === 'running'   && `Đang chạy ${runningTool}…`}
            {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý…'}
            {activeJob.status === 'completed' && `✓ ${runningTool} hoàn tất`}
            {activeJob.status === 'failed'    && `✕ ${runningTool} thất bại — xem worker logs`}
          </span>
          <span className="font-mono tabular-nums">{elapsed}</span>
          {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
            <button onClick={() => setActiveJob(null)} className="opacity-50 hover:opacity-100">×</button>
          )}
        </div>
      )}

      {/* Targets WordPress + Run */}
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1e2330] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#48bb78] flex-shrink-0" />
            <span className="text-xs font-semibold text-[#e2e8f0]">Target WordPress</span>
            <span className="text-[10px] text-[#4a5568]">
              · {targets.length} host{selected.size > 0 ? ` · ${selected.size} đã chọn` : ' · quét tất cả'}
            </span>
          </div>
          <button onClick={() => run(tool)} disabled={running}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${running
              ? 'bg-[#2d1f5e] text-[#6d53a6] cursor-not-allowed'
              : 'bg-[#4c1d95] hover:bg-[#5b21b6] text-[#e2e8f0]'}`}>
            {running ? `Đang chạy ${toolLabel}…` : `◉ Run ${toolLabel}`}
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-xs text-[#4a5568]">Đang tải...</div>
        ) : targets.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#4a5568]">
            Chưa có host nào gắn tag WordPress — chạy <span className="text-[#a78bfa]">Web Probe</span> trước
            để httpx/WhatWeb detect WordPress.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2 text-left w-8"></th>
                  <th className="px-4 py-2 text-left">Host</th>
                  <th className="px-4 py-2 text-left">Port</th>
                  <th className="px-4 py-2 text-left">URL</th>
                  <th className="px-4 py-2 text-left">Technologies</th>
                </tr>
              </thead>
              <tbody>
                {targets.map(t => {
                  const on = t.target_id != null && selected.has(t.target_id)
                  return (
                    <tr key={`${t.host}:${t.port}`} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] group">
                      <td className="px-4 py-2">
                        {t.target_id ? (
                          <input type="checkbox" checked={on} onChange={() => toggle(t.target_id!)}
                            disabled={running} className="accent-[#7c3aed]" />
                        ) : <span className="text-[#2d3748]" title="Không có target_id — chỉ quét được khi 'quét tất cả'">—</span>}
                      </td>
                      <td className="px-4 py-2 text-[#e2e8f0] font-mono whitespace-nowrap">{t.host}</td>
                      <td className="px-4 py-2 text-[#718096] font-mono">{t.port}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 max-w-[260px]">
                          <span className="font-mono text-[10px] text-[#a0aec0] truncate" title={t.url}>{t.url}</span>
                          <CopyButton value={t.url} />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {(t.technologies ?? []).slice(0, 6).map((tech, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                              tech.toLowerCase().includes('wordpress')
                                ? 'bg-[#1a3a2a] text-[#68d391]' : 'bg-[#1e2330] text-[#718096]'}`}>{tech}</span>
                          ))}
                          {(t.technologies?.length ?? 0) > 6 && (
                            <span className="text-[9px] text-[#4a5568]">+{t.technologies.length - 6}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Findings của tool đang chọn (nav) */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
          {toolLabel} findings <span className="text-[#4a5568] font-normal">({findingsCount})</span>
          <span className="ml-2 text-[9px] text-[#4a5568] normal-case font-normal">· run mới nhất</span>
        </h3>
        <select value={severity} onChange={e => setSeverity(e.target.value)}
          className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] focus:outline-none">
          <option value="">All severities</option>
          {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {err && (
        <div className="bg-[#2d1010] border border-[#5a1a1a] rounded px-4 py-2 text-[11px] text-[#fc8181]">
          Lỗi: {err}
        </div>
      )}

      {findingsCount === 0 ? (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
          <p className="text-[#4a5568] text-xs">Chưa có {toolLabel} findings — bấm Run {toolLabel} ở trên.</p>
        </div>
      ) : isWpscan ? (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2 text-left">Severity</th>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Component</th>
                  <th className="px-4 py-2 text-left">Version</th>
                  <th className="px-4 py-2 text-left">CVE</th>
                  <th className="px-4 py-2 text-left">Host</th>
                </tr>
              </thead>
              <tbody>
                {wpscan.map(f => (
                  <tr key={f.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e]">
                    <td className="px-4 py-2"><Sev s={f.severity} /></td>
                    <td className="px-4 py-2 text-[#e2e8f0] max-w-sm truncate" title={f.title}>{f.title}</td>
                    <td className="px-4 py-2 text-[#a0aec0] font-mono text-[10px]">
                      {f.component ?? '—'}{f.component_name ? `: ${f.component_name}` : ''}
                    </td>
                    <td className="px-4 py-2 text-[#718096] font-mono">{f.component_version ?? '—'}</td>
                    <td className="px-4 py-2 text-[#4299e1]">{f.cve_id ?? '—'}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono max-w-[160px] truncate">{f.host ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2 text-left">Severity</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Plugin / Theme</th>
                  <th className="px-4 py-2 text-left">Version</th>
                  <th className="px-4 py-2 text-left">CVE</th>
                  <th className="px-4 py-2 text-left">CVSS</th>
                  <th className="px-4 py-2 text-left">Auth</th>
                  <th className="px-4 py-2 text-left">Host</th>
                </tr>
              </thead>
              <tbody>
                {wpprobe.map(f => (
                  <tr key={f.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e]">
                    <td className="px-4 py-2"><Sev s={f.severity} /></td>
                    <td className="px-4 py-2 text-[#718096] font-mono text-[10px]">{f.component ?? '—'}</td>
                    <td className="px-4 py-2 text-[#e2e8f0] font-mono max-w-[180px] truncate" title={f.plugin ?? ''}>{f.plugin ?? '—'}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono">{f.version ?? '—'}</td>
                    <td className="px-4 py-2 text-[#4299e1]">{f.cve_id ?? '—'}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono">{f.cvss_score ?? '—'}</td>
                    <td className="px-4 py-2 text-[#718096]">{f.auth_type ?? '—'}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono max-w-[160px] truncate">{f.host ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

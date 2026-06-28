'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { VulnSubNav } from '@/components/vuln/VulnSubNav'
import { findVulnModule } from '@/components/vuln/vulnConfig'
import { request, jobApi, targetApi, nucleiFindingApi } from '@/lib/api'
import type { NucleiFinding, Target, Job } from '@/lib/api'

interface VulnFinding {
  id: string
  title: string
  severity: string
  status: string
  host: string | null
  url: string | null
  cve_id: string | null
  source_tool: string | null
  created_at: string
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-[#4a1a1a] text-[#fc8181]',
  high:     'bg-[#3a2010] text-[#f6ad55]',
  medium:   'bg-[#3a3010] text-[#f6e05e]',
  low:      'bg-[#1a3a1a] text-[#68d391]',
  info:     'bg-[#1a2a3a] text-[#63b3ed]',
}

const GROUP_PALETTE = [
  '#a78bfa', '#63b3ed', '#68d391', '#f6ad55', '#fc8181', '#f6e05e',
  '#4fd1c5', '#f687b3', '#9f7aea', '#76e4f7', '#b794f4', '#90cdf4',
  '#fbb6ce', '#9ae6b4', '#fbd38d', '#d6bcfa',
]

function groupColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return GROUP_PALETTE[h % GROUP_PALETTE.length]
}

function baseTitle(title: string): string {
  return title.split(':')[0].trim()
}

function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function VulnModule({ seg }: { seg: string }) {
  const { id: wsid } = useParams<{ id: string }>()
  const search = useSearchParams()
  const def = findVulnModule(seg)

  const domain   = def?.domain ?? seg
  const tools    = def?.tools ?? []
  const usesNuclei = tools.some(t => t.source === 'nuclei')

  // Tool đang chọn từ ?tool= (nav điều khiển), fallback tool đầu
  const activeTool = search.get('tool') || tools[0]?.key || ''
  const meta = tools.find(t => t.key === activeTool) ?? tools[0]
  const isNuclei = meta?.source === 'nuclei'

  const [generic,        setGeneric]        = useState<VulnFinding[]>([])
  const [nucleiFindings, setNucleiFindings] = useState<NucleiFinding[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [severity, setSeverity] = useState('')

  const [targets,     setTargets]     = useState<Target[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [jobId,        setJobId]        = useState<string | null>(null)
  const [jobStartedAt, setJobStartedAt] = useState<string | null>(null)
  const [runningTool,  setRunningTool]  = useState<string | null>(null)
  const [running,      setRunning]      = useState(false)
  const [scanDone,     setScanDone]     = useState<{ tool: string; ok: boolean } | null>(null)
  const [, setTick] = useState(0)

  const severityRef = useRef(severity)
  useEffect(() => { severityRef.current = severity }, [severity])

  const isModuleScan = useCallback((j: Job): boolean => {
    if (j.job_type !== 'VULN_DISPATCH') return false
    const domains = (j.payload?.domains as string[] | undefined)
    return domains ? domains.includes(domain) : false
  }, [domain])

  const doFetch = useCallback(async () => {
    const sev = severityRef.current
    const gQs = new URLSearchParams({ domain })
    if (sev) gQs.set('severity', sev)
    try {
      const tasks: Promise<unknown>[] = [
        request<{ data: VulnFinding[] }>(`/api/workspaces/${wsid}/vuln-findings?${gQs}`)
          .then(r => setGeneric(r.data ?? [])),
      ]
      if (usesNuclei) {
        tasks.push(
          nucleiFindingApi.list(wsid, sev ? { severity: sev } : undefined)
            .then(r => setNucleiFindings(r.data ?? []))
        )
      }
      await Promise.all(tasks)
      setFetchErr(null)
    } catch (err: unknown) {
      setFetchErr(err instanceof Error ? err.message : String(err))
    }
  }, [wsid, domain, usesNuclei])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      await doFetch()
      try { const ts = await targetApi.list(wsid); if (!cancelled) setTargets(ts) } catch { /* ignore */ }
      try {
        const jobs = await jobApi.list(wsid)
        const active = jobs.find(j => isModuleScan(j) && (j.status === 'running' || j.status === 'pending'))
        if (active && !cancelled) {
          setJobId(active.id)
          setJobStartedAt(active.started_at)
          const tls = (active.payload?.tools as string[] | undefined)
          setRunningTool(tls && tls.length ? tls.join(', ') : domain)
          setRunning(true)
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [doFetch, wsid, isModuleScan, domain])

  useEffect(() => { doFetch() }, [severity, doFetch])

  useEffect(() => {
    if (!running || !jobId) return
    const id = jobId
    doFetch()
    const iv = setInterval(async () => {
      doFetch()
      try {
        const job = await jobApi.get(wsid, id)
        if (job.started_at) setJobStartedAt(job.started_at)
        if (job.status === 'completed' || job.status === 'failed') {
          setRunning(false)
          setJobId(null)
          setScanDone({ tool: runningTool ?? 'Scan', ok: job.status === 'completed' })
          setRunningTool(null)
          doFetch()
          clearInterval(iv)
        }
      } catch { /* giữ polling */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [running, jobId, doFetch, runningTool, wsid])

  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [running])

  const elapsedSec = jobStartedAt ? (Date.now() - new Date(jobStartedAt).getTime()) / 1000 : 0

  const toggleTarget = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearTargets = () => setSelectedIds(new Set())

  const handleRun = async (toolKey: string) => {
    setRunning(true); setJobId(null); setJobStartedAt(null); setScanDone(null); setRunningTool(toolKey)
    try {
      const payload: Record<string, unknown> = { workspace_id: wsid, domains: [domain], tools: [toolKey] }
      if (selectedIds.size > 0) payload.target_ids = [...selectedIds]
      const job = await jobApi.create(wsid, { job_type: 'VULN_DISPATCH', payload })
      setJobId(job.id); setJobStartedAt(job.started_at)
    } catch {
      setRunning(false); setRunningTool(null)
      setScanDone({ tool: toolKey, ok: false })
      setTimeout(() => setScanDone(null), 4000)
    }
  }

  const rows = isNuclei ? nucleiFindings : generic.filter(f => f.source_tool === activeTool)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <VulnSubNav wsid={wsid} />

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#e2e8f0]">{def?.title ?? seg}</h1>
            <p className="text-[#4a5568] text-xs mt-0.5">{def?.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {scanDone && (
              <span className={`text-[11px] ${scanDone.ok ? 'text-[#68d391]' : 'text-[#fc8181]'}`}>
                {scanDone.ok ? `✓ ${scanDone.tool} hoàn tất` : `${scanDone.tool} thất bại — xem worker logs`}
              </span>
            )}
            {running && (
              <span className="flex items-center gap-2 text-[11px] text-[#a78bfa]">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#a78bfa] animate-pulse" />
                {jobStartedAt
                  ? <>Đang chạy {runningTool} • <span className="font-mono tabular-nums">{fmtElapsed(elapsedSec)}</span></>
                  : <>Đang khởi động {runningTool}…</>}
              </span>
            )}
          </div>
        </div>

        {/* Chọn target + Run (theo tool đang chọn trên nav) */}
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#4a5568] uppercase tracking-wider">
                Target ({selectedIds.size === 0 ? 'tất cả' : `${selectedIds.size} đã chọn`})
              </span>
              {selectedIds.size > 0 && (
                <button onClick={clearTargets} className="text-[10px] text-[#a78bfa] hover:text-[#c4b5fd]">
                  Bỏ chọn (quét tất cả)
                </button>
              )}
            </div>
            <button
              onClick={() => handleRun(activeTool)}
              disabled={running || !activeTool}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap
                ${running
                  ? 'bg-[#2d1f5e] text-[#6d53a6] cursor-not-allowed'
                  : 'bg-[#4c1d95] hover:bg-[#5b21b6] text-[#e2e8f0] cursor-pointer'}`}
            >
              {running
                ? <><span className="inline-block w-3 h-3 border-2 border-[#6d53a6] border-t-transparent rounded-full animate-spin" />Running...</>
                : <>◉ Run {meta?.label}</>}
            </button>
          </div>
          <div>
            {targets.length === 0 ? (
              <p className="text-[#4a5568] text-xs">Chưa có target nào trong workspace</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {targets.map(t => {
                  const on = selectedIds.has(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTarget(t.id)}
                      disabled={running}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors
                        ${on
                          ? 'bg-[#2d1f5e] border-[#5b21b6] text-[#c4b5fd]'
                          : 'bg-[#0d1117] border-[#2d3748] text-[#718096] hover:border-[#4a5568]'}
                        ${running ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {on ? '☑ ' : '☐ '}{t.domain}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Output */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
            Output — {meta?.label} <span className="text-[#4a5568] font-normal">({rows.length})</span>
          </h3>
          <select value={severity} onChange={e => setSeverity(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] focus:outline-none">
            <option value="">All severities</option>
            {['critical','high','medium','low','info'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {fetchErr && (
          <div className="bg-[#2d1010] border border-[#5a1a1a] rounded px-4 py-2 text-[11px] text-[#fc8181]">
            Lỗi tải findings: {fetchErr}
          </div>
        )}

        {loading ? (
          <p className="text-[#4a5568] text-xs">Đang tải...</p>
        ) : rows.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
            <p className="text-[#4a5568] text-xs">Chưa có {meta?.label} findings</p>
          </div>
        ) : isNuclei ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2330] text-[#4a5568]">
                    <th className="px-4 py-2 text-left">Severity</th>
                    <th className="px-4 py-2 text-left">Title</th>
                    <th className="px-4 py-2 text-left">Template · Proto</th>
                    <th className="px-4 py-2 text-left">Host / URL</th>
                    <th className="px-4 py-2 text-left">Extracted values</th>
                    <th className="px-4 py-2 text-left">CVE</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as NucleiFinding[]).map(f => {
                    const gcolor = groupColor(f.template_id || baseTitle(f.title))
                    return (
                      <tr key={f.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors">
                        <td className="px-4 py-2 border-l-[3px]" style={{ borderLeftColor: gcolor }}>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEV_COLORS[f.severity] ?? ''}`}>{f.severity}</span>
                        </td>
                        <td className="px-4 py-2 max-w-[260px] truncate" style={{ color: gcolor }} title={f.title}>{f.title}</td>
                        <td className="px-4 py-2 text-[#718096] font-mono text-[10px]">
                          <span>{f.template_id ?? '—'}</span>
                          {f.protocol && <span className="ml-1.5 px-1 py-0.5 rounded bg-[#1e2330] text-[#4a5568] text-[9px]">{f.protocol}</span>}
                        </td>
                        <td className="px-4 py-2 text-[#718096] font-mono max-w-[180px] truncate">{f.host ?? f.url ?? '—'}</td>
                        <td className="px-4 py-2 max-w-[220px]" style={{ color: gcolor }}>
                          {f.extracted_results && f.extracted_results.length > 0 ? (
                            <span className="font-mono text-[10px]" title={f.extracted_results.join('\n')}>
                              {f.extracted_results.slice(0, 2).join(', ')}
                              {f.extracted_results.length > 2 && <span className="text-[#4a5568]"> +{f.extracted_results.length - 2}</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2 text-[#4299e1]">{f.cve_id ?? '—'}</td>
                      </tr>
                    )
                  })}
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
                    <th className="px-4 py-2 text-left">Title</th>
                    <th className="px-4 py-2 text-left">Host / URL</th>
                    <th className="px-4 py-2 text-left">CVE</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as VulnFinding[]).map(f => {
                    const gcolor = groupColor(baseTitle(f.title))
                    return (
                      <tr key={f.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors">
                        <td className="px-4 py-2 border-l-[3px]" style={{ borderLeftColor: gcolor }}>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEV_COLORS[f.severity] ?? ''}`}>{f.severity}</span>
                        </td>
                        <td className="px-4 py-2 max-w-sm truncate" style={{ color: gcolor }} title={f.title}>{f.title}</td>
                        <td className="px-4 py-2 text-[#718096] font-mono max-w-[200px] truncate">{f.host ?? f.url ?? '—'}</td>
                        <td className="px-4 py-2 text-[#4299e1]">{f.cve_id ?? '—'}</td>
                        <td className="px-4 py-2 text-[#4a5568]">{f.status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

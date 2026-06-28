'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { VulnSubNav } from '@/components/vuln/VulnSubNav'
import { request } from '@/lib/api'

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

const TOOLS = ['gitlab', 'jenkins', 'confluence', 'grafana', 'tomcat', 'springboot']

export default function VulnSoftwarePage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [findings, setFindings] = useState<VulnFinding[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tool,     setTool]     = useState('')
  const [severity, setSeverity] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ domain: 'software', ...(tool && { tool }), ...(severity && { severity }) })
    request<{ data: VulnFinding[] }>(`/api/workspaces/${wsid}/vuln-findings?${qs}`)
      .then(r => setFindings(r.data))
      .catch(() => setFindings([]))
      .finally(() => setLoading(false))
  }, [wsid, tool, severity])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <VulnSubNav wsid={wsid} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div>
          <h1 className="text-base font-semibold text-[#e2e8f0]">Software</h1>
          <p className="text-[#4a5568] text-xs mt-0.5">
            GitLab · Jenkins · Confluence · Grafana · Tomcat · Spring Boot
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { tool: 'gitlab',     label: 'GitLab',      cves: 'CVE-2021-22205, RCE' },
            { tool: 'jenkins',    label: 'Jenkins',     cves: 'CVE-2024-23897, Script Console' },
            { tool: 'confluence', label: 'Confluence',  cves: 'CVE-2021-26084, CVE-2022-26134' },
            { tool: 'grafana',    label: 'Grafana',     cves: 'CVE-2021-43798, Path Traversal' },
            { tool: 'tomcat',     label: 'Tomcat',      cves: 'Manager Panel, PUT Upload' },
            { tool: 'springboot', label: 'Spring Boot', cves: 'Actuator, Spring4Shell' },
          ].map(s => (
            <div key={s.tool} className="bg-[#0d1117] border border-[#1e2330] rounded p-3">
              <p className="text-[11px] font-semibold text-[#e2e8f0]">{s.label}</p>
              <p className="text-[10px] text-[#4a5568] mt-0.5">{s.cves}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <select value={tool} onChange={e => setTool(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] focus:outline-none">
            <option value="">All tools</option>
            {TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={severity} onChange={e => setSeverity(e.target.value)}
            className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] focus:outline-none">
            <option value="">All severities</option>
            {['critical','high','medium','low','info'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-[#4a5568] text-xs">Đang tải...</p>
        ) : findings.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-8 text-center">
            <p className="text-[#4a5568] text-sm">Chưa có Software findings</p>
            <p className="text-[#2d3748] text-xs mt-1">
              Cần SCAN_WEB_INFO detect platform (GitLab, Jenkins...) trước
            </p>
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2 text-left">Severity</th>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Tool</th>
                  <th className="px-4 py-2 text-left">Host</th>
                  <th className="px-4 py-2 text-left">CVE</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {findings.map(f => (
                  <tr key={f.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEV_COLORS[f.severity] ?? ''}`}>
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[#e2e8f0] max-w-xs truncate">{f.title}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono">{f.source_tool}</td>
                    <td className="px-4 py-2 text-[#718096] font-mono">{f.host ?? f.url ?? '—'}</td>
                    <td className="px-4 py-2 text-[#4299e1]">{f.cve_id ?? '—'}</td>
                    <td className="px-4 py-2 text-[#4a5568]">{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

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

const TOOLS = ['git', 'env', 'cors']

export default function VulnDiscoveryPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [findings, setFindings] = useState<VulnFinding[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tool,     setTool]     = useState('')
  const [severity, setSeverity] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ domain: 'discovery', ...(tool && { tool }), ...(severity && { severity }) })
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
          <h1 className="text-base font-semibold text-[#e2e8f0]">Discovery</h1>
          <p className="text-[#4a5568] text-xs mt-0.5">
            .git Exposure · Env/Config files · CORS misconfig
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Git Exposure', desc: '/.git/config → source code dump' },
            { label: 'Env/Config',   desc: '.env · wp-config.php.bak · database.yml' },
            { label: 'CORS',         desc: 'ACAO:* · origin reflection · null origin' },
          ].map(d => (
            <div key={d.label} className="bg-[#0d1117] border border-[#553c9a] rounded p-3">
              <p className="text-[11px] font-semibold text-[#d6bcfa]">{d.label}</p>
              <p className="text-[10px] text-[#4a5568] mt-0.5">{d.desc}</p>
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
            <p className="text-[#4a5568] text-sm">Chưa có Discovery findings</p>
            <p className="text-[#2d3748] text-xs mt-1">
              Chạy VULN_DISPATCH với domain &quot;Discovery&quot; — áp dụng cho tất cả live targets
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
                  <th className="px-4 py-2 text-left">URL</th>
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
                    <td className="px-4 py-2 text-[#718096] font-mono text-[10px] truncate max-w-xs">{f.url ?? f.host ?? '—'}</td>
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

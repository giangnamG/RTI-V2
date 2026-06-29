'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Target, Job, targetApi, jobApi } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'

const DOMAINS = [
  {
    key:      'common',
    label:    'Common',
    color:    '#4299e1',
    dot:      '#2b6cb0',
    desc:     'Nuclei · Nikto · testssl.sh',
    detail:   'Chạy trên tất cả live targets. CVE, misconfig, SSL/TLS.',
    href:     'common',
  },
  {
    key:      'cms',
    label:    'CMS',
    color:    '#68d391',
    dot:      '#276749',
    desc:     'WPScan · JoomScan · Droopescan',
    detail:   'WordPress, Joomla, Drupal — detect tự động từ tech stack.',
    href:     'cms',
  },
  {
    key:      'software',
    label:    'Software',
    color:    '#f6ad55',
    dot:      '#7b4a00',
    desc:     'GitLab · Jenkins · Confluence · Grafana · Tomcat · Spring',
    detail:   'Platforms & applications — detect từ technologies + title.',
    href:     'software',
  },
  {
    key:      'cloud',
    label:    'Cloud',
    color:    '#76e4f7',
    dot:      '#0987a0',
    desc:     'AWS · GCP · Azure · Subdomain Takeover',
    detail:   'S3/GCS/Blob exposure, metadata SSRF, CNAME takeover.',
    href:     'cloud',
  },
  {
    key:      'discovery',
    label:    'Discovery',
    color:    '#d6bcfa',
    dot:      '#553c9a',
    desc:     '.git exposure · .env files · CORS misconfig',
    detail:   'Information disclosure — áp dụng cho tất cả targets.',
    href:     'discovery',
  },
  {
    key:      'network',
    label:    'Network Service',
    color:    '#fc8181',
    dot:      '#742a2a',
    desc:     'Redis · MySQL · MongoDB · Elasticsearch',
    detail:   'Port-based checks — cần SCAN_PORT chạy trước.',
    href:     'network',
  },
  {
    key:      'web-params',
    label:    'Web Params',
    color:    '#fbd38d',
    dot:      '#7b4a00',
    desc:     'SQLMap · Dalfox (XSS)',
    detail:   'Injection testing — cần FUZZ_PARAM chạy trước.',
    href:     'web-params',
  },
]

function JobBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-[#1a1f2e] text-[#718096]',
    running:   'bg-[#1a2434] text-[#4299e1] animate-pulse',
    completed: 'bg-[#1a2f1a] text-[#68d391]',
    failed:    'bg-[#2d1a1a] text-[#fc8181]',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${map[status] ?? map.pending}`}>
      {status}
    </span>
  )
}

function ScanModal({ wsid, targets, onClose, onJobCreated }: {
  wsid:         string
  targets:      Target[]
  onClose:      () => void
  onJobCreated: (job: Job) => void
}) {
  const [targetId, setTargetId] = useState('')
  const [domains,  setDomains]  = useState<string[]>(['common', 'cms', 'software', 'cloud', 'discovery'])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const toggleDomain = (d: string) =>
    setDomains(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'VULN_DISPATCH',
        target_id: targetId || undefined,
        payload: {
          workspace_id: wsid,
          target_id:    targetId || '',
          domains,
        },
      })
      onJobCreated(job)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  const domainOptions = [
    { key: 'common',          label: 'Common (Nuclei, Nikto, testssl)' },
    { key: 'cms',             label: 'CMS (WPScan, JoomScan, Droopescan)' },
    { key: 'software',        label: 'Software (GitLab, Jenkins, Confluence…)' },
    { key: 'cloud',           label: 'Cloud (AWS, GCP, Azure)' },
    { key: 'discovery',       label: 'Discovery (.git, .env, CORS)' },
    { key: 'network_service', label: 'Network Service (Redis, MySQL, MongoDB)' },
    { key: 'web_params',      label: 'Web Params (SQLMap, Dalfox) ⚠️' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#e2e8f0] text-sm">Vulnerability Scan</h2>
            <p className="text-[#4a5568] text-[11px] mt-0.5">VULN_DISPATCH — tự động chọn tool theo tech stack</p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Target (optional)</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
              <option value="">All targets</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.domain}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#718096] mb-2">Domains</label>
            <div className="space-y-1.5">
              {domainOptions.map(d => (
                <label key={d.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={domains.includes(d.key)}
                    onChange={() => toggleDomain(d.key)}
                    className="accent-[#7c3aed]" />
                  <span className="text-xs text-[#e2e8f0]">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-[#0d1117] border border-[#1e2330] rounded px-3 py-2 text-[11px] text-[#4a5568]">
            Prerequisite: <span className="text-[#e2e8f0]">SCAN_WEB_INFO</span> phải chạy trước.
            Network Service cần <span className="text-[#e2e8f0]">SCAN_PORT</span>.
            Web Params cần <span className="text-[#e2e8f0]">FUZZ_PARAM</span>.
          </div>

          {error && <p className="text-[#fc8181] text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || domains.length === 0}
              className="flex-1 px-3 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e9d8fd] text-xs rounded font-medium transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : 'Launch VULN_DISPATCH'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function VulnOverviewPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [targets,   setTargets]   = useState<Target[]>([])
  const [showModal, setShowModal] = useState(false)

  const noop = useCallback(() => {}, [])
  const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'VULN_DISPATCH', noop)

  useEffect(() => {
    targetApi.list(wsid).then(setTargets).catch(() => [])
  }, [wsid])

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Active job banner */}
      {activeJob && (
        <div className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
          activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
          : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
          : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
        }`}>
          <JobBadge status={activeJob.status} />
          <span className="flex-1">
            {activeJob.status === 'running'   && 'Vulnerability scan đang chạy...'}
            {activeJob.status === 'completed' && (() => {
              const r = activeJob.result as Record<string, unknown>
              return `Done — ${r?.total_findings ?? 0} findings (${r?.runs_completed ?? 0} tools ran)`
            })()}
            {activeJob.status === 'failed'    && `Error: ${activeJob.error_message}`}
          </span>
          <span className="font-mono tabular-nums flex-shrink-0">{elapsed}</span>
          {activeJob.status !== 'running' && (
            <button onClick={() => setActiveJob(null)} className="opacity-60 hover:opacity-100">×</button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-[#e2e8f0]">Vulnerability Scan</h1>
          <p className="text-[#4a5568] text-xs mt-0.5">
            Tech-aware dispatch — tự động chọn tool phù hợp với từng target
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-3 py-1.5 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e9d8fd] text-xs rounded font-medium transition-colors">
          + Run VULN_DISPATCH
        </button>
      </div>

      {/* Domain cards */}
      <div className="grid grid-cols-2 gap-3">
        {DOMAINS.map(d => (
          <a key={d.key} href={`/workspace/${wsid}/vuln/${d.href}`}
            className="block bg-[#141720] border border-[#1e2330] rounded-lg p-4 hover:border-[#2d3748] transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.dot }} />
              <span className="font-semibold text-[#e2e8f0] text-sm">{d.label}</span>
            </div>
            <p className="text-[11px] font-mono text-[#4a5568] mb-1.5" style={{ color: d.color }}>
              {d.desc}
            </p>
            <p className="text-[10px] text-[#2d3748] group-hover:text-[#4a5568] transition-colors">
              {d.detail}
            </p>
          </a>
        ))}
      </div>

      {showModal && (
        <ScanModal wsid={wsid} targets={targets}
          onClose={() => setShowModal(false)}
          onJobCreated={job => setActiveJob(job)} />
      )}
    </div>
  )
}

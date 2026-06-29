'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Job, Target, WebCrawlURL, WebCrawlStats, jobApi, targetApi, webCrawlApi } from '@/lib/api'
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

// ── Source type badge ─────────────────────────────────────
function SourceBadge({ tag, attr }: { tag: string | null; attr: string | null }) {
  if (!tag) return <span className="text-[#2d3748] text-[10px]">—</span>
  const map: Record<string, string> = {
    a:      'bg-[#1a2434] text-[#4299e1]',
    script: 'bg-[#2d2200] text-[#fbd38d]',
    form:   'bg-[#2d1a2d] text-[#d6bcfa]',
    link:   'bg-[#1a2f1a] text-[#68d391]',
    iframe: 'bg-[#2d1a1a] text-[#fc8181]',
    js:     'bg-[#1a2800] text-[#9ae600] border border-[#4a7c00]',
    html:   'bg-[#1a2434] text-[#63b3ed]',
    header: 'bg-[#2d1f0e] text-[#f6ad55]',
    file:   'bg-[#1a1f2e] text-[#a0aec0]',
    img:    'bg-[#2d1a2d] text-[#b794f4]',
  }
  const cls = map[tag] ?? 'bg-[#1a1f2e] text-[#718096]'
  const label = attr ? `${tag}[${attr}]` : tag
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${cls}`}>{label}</span>
  )
}

// ── Status code badge ─────────────────────────────────────
function StatusBadge({ code }: { code: number | null }) {
  if (!code) return <span className="text-[#2d3748]">—</span>
  const cls =
    code >= 500 ? 'bg-[#3a1f1f] text-[#fc8181]' :
    code >= 400 ? 'bg-[#3a2d1f] text-[#f6ad55]' :
    code >= 300 ? 'bg-[#2a2d3a] text-[#a0aec0]' :
    code >= 200 ? 'bg-[#1a2f1a] text-[#68d391]' :
                  'bg-[#1a1f2e] text-[#718096]'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${cls}`}>{code}</span>
  )
}

// ── Stats bar ─────────────────────────────────────────────
function StatsBar({ stats, activeSource, onFilter }: {
  stats: WebCrawlStats | null
  activeSource: string
  onFilter: (src: string) => void
}) {
  if (!stats) return null

  const sourceLabels: Record<string, string> = {
    a:      'Link',
    script: 'JS',
    form:   'Form',
    link:   'Stylesheet',
    iframe: 'IFrame',
    other:  'Khác',
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={() => onFilter('')}
        className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${
          activeSource === ''
            ? 'border-[#553c9a] bg-[#2d1f52] text-[#a78bfa]'
            : 'border-[#1e2330] bg-[#141720] text-[#718096] hover:border-[#2d3748]'
        }`}
      >
        <span className="text-lg font-bold font-mono">{stats.total}</span>
        <span className="text-[10px] mt-0.5">Tất cả</span>
      </button>

      {Object.entries(stats.by_source)
        .sort(([,a],[,b]) => b - a)
        .map(([src, cnt]) => (
        <button key={src}
          onClick={() => onFilter(activeSource === src ? '' : src)}
          className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${
            activeSource === src
              ? 'border-[#553c9a] bg-[#2d1f52] text-[#a78bfa]'
              : 'border-[#1e2330] bg-[#141720] text-[#718096] hover:border-[#2d3748]'
          }`}
        >
          <span className="text-lg font-bold font-mono">{cnt}</span>
          <span className="text-[10px] mt-0.5">{sourceLabels[src] ?? src}</span>
        </button>
      ))}
    </div>
  )
}

// ── Scan modal ────────────────────────────────────────────
function ScanModal({ wsid, targets, onClose, onJobCreated }: {
  wsid: string
  targets: Target[]
  onClose: () => void
  onJobCreated: (job: Job) => void
}) {
  const [targetId, setTargetId]     = useState('')
  const [depth, setDepth]           = useState('3')
  const [jsCrawl, setJsCrawl]       = useState(true)
  const [knownFiles, setKnownFiles] = useState(true)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const job = await jobApi.create(wsid, {
        job_type:  'RECON_WEB_CRAWL',
        target_id: targetId || undefined,
        payload: {
          workspace_id: wsid,
          target_id:    targetId || '',
          depth:        parseInt(depth),
          js_crawl:     jsCrawl,
          known_files:  knownFiles,
        },
      })
      onJobCreated(job)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#e2e8f0] text-sm">Web Crawler</h2>
            <p className="text-[#4a5568] text-[11px] mt-0.5">
              Crawl các web endpoint đang live bằng katana
            </p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Target */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Target (tùy chọn)</label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="">Tất cả targets</option>
              {targets.map(t => (
                <option key={t.id} value={t.id}>{t.domain}</option>
              ))}
            </select>
          </div>

          {/* Depth */}
          <div>
            <label className="block text-[11px] text-[#718096] mb-1.5">Độ sâu crawl</label>
            <select
              value={depth}
              onChange={e => setDepth(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="1">1 — Trang đích + links trực tiếp</option>
              <option value="2">2 — Crawl 2 cấp</option>
              <option value="3">3 — Crawl 3 cấp (khuyến nghị)</option>
              <option value="4">4 — Crawl 4 cấp</option>
              <option value="5">5 — Crawl 5 cấp (chậm hơn)</option>
            </select>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="block text-[11px] text-[#718096] mb-1.5">Tùy chọn</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={jsCrawl}
                onChange={e => setJsCrawl(e.target.checked)}
                className="accent-[#553c9a]"
              />
              <span className="text-xs text-[#e2e8f0]">JS Crawling</span>
              <span className="text-[#4a5568] text-[10px]">— Phân tích JS để tìm endpoint ẩn</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={knownFiles}
                onChange={e => setKnownFiles(e.target.checked)}
                className="accent-[#553c9a]"
              />
              <span className="text-xs text-[#e2e8f0]">Known Files</span>
              <span className="text-[#4a5568] text-[10px]">— robots.txt, sitemap.xml, ...</span>
            </label>
          </div>

          {/* Info */}
          <div className="bg-[#0d1117] border border-[#1e2330] rounded px-3 py-2 text-[11px] text-[#4a5568]">
            Chỉ crawl các web endpoint đang <span className="text-[#68d391]">live</span> từ kết quả Web Probe gần nhất.
            Hãy đảm bảo đã chạy <span className="text-[#e2e8f0]">SCAN_WEB_INFO</span> trước.
          </div>

          {error && (
            <p className="text-[#fc8181] text-xs">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-3 py-2 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors disabled:opacity-50">
              {loading ? 'Đang tạo...' : 'Bắt đầu Crawl'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── History drawer ────────────────────────────────────────
function HistoryDrawer({ wsid, jobId, baseUrl, onClose }: {
  wsid: string
  jobId: string
  baseUrl: string
  onClose: () => void
}) {
  const [urls, setUrls]       = useState<WebCrawlURL[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    webCrawlApi.history(wsid, jobId)
      .then(r => setUrls(r.data ?? []))
      .catch(() => setUrls([]))
      .finally(() => setLoading(false))
  }, [wsid, jobId])

  const filtered = urls.filter(u =>
    u.base_url === baseUrl &&
    (search === '' || u.url.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        <div className="p-4 border-b border-[#1e2330] flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#e2e8f0]">URLs tìm được</h3>
            <p className="text-[#4a5568] text-[11px] font-mono truncate mt-0.5" title={baseUrl}>
              {baseUrl}
            </p>
          </div>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg ml-4 flex-shrink-0">×</button>
        </div>

        <div className="p-3 border-b border-[#1e2330]">
          <input
            type="text"
            placeholder="Lọc URL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141720] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <p className="text-center text-[#4a5568] text-xs py-8">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-[#4a5568] text-xs py-8">Không có kết quả</p>
          ) : filtered.map(u => (
            <div key={u.id} className="bg-[#141720] border border-[#1e2330] rounded px-3 py-2 group">
              <div className="flex items-start gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[11px] text-[#4299e1] truncate flex-1" title={u.url}>
                      {u.url}
                    </span>
                    <CopyButton value={u.url} className="flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#4a5568] font-mono">{u.method}</span>
                    {u.status_code && <StatusBadge code={u.status_code} />}
                    <SourceBadge tag={u.source_tag} attr={u.source_attr} />
                    {u.depth > 0 && (
                      <span className="text-[10px] text-[#2d3748]">depth {u.depth}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[#1e2330] text-[#4a5568] text-[11px]">
          {filtered.length} / {urls.filter(u => u.base_url === baseUrl).length} URLs
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function WebCrawlerPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [urls, setUrls]           = useState<WebCrawlURL[]>([])
  const [stats, setStats]         = useState<WebCrawlStats | null>(null)
  const [targets, setTargets]     = useState<Target[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch]       = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [selectedBase, setSelectedBase] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const res = await webCrawlApi.list(wsid)
    setUrls(res.data ?? [])
    setStats(res.stats ?? null)
  }, [wsid])

  const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'RECON_WEB_CRAWL', loadData)

  useEffect(() => {
    Promise.all([
      loadData(),
      targetApi.list(wsid).then(setTargets).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [wsid, loadData])

  const filtered = urls.filter(u => {
    if (sourceFilter && (u.source_tag ?? 'other') !== sourceFilter) return false
    if (search && !u.url.toLowerCase().includes(search.toLowerCase()) &&
        !u.base_url.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group unique base_urls for label display
  const baseUrls = [...new Set(urls.map(u => u.base_url))]

  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={wsid} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Active job banner */}
        {activeJob && (
          <div className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
            activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
            : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
            : activeJob.status === 'pending'   ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
            : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
          }`}>
            <JobBadge status={activeJob.status} />
            <span className="flex-1">
              {activeJob.status === 'running'   && 'Katana đang crawl, có thể mất vài phút...'}
              {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
              {activeJob.status === 'completed' && (() => {
                const r = activeJob.result as Record<string, unknown>
                return `Hoàn thành — ${r?.saved_urls ?? r?.saved ?? 0} URLs lưu từ ${r?.total_seeds ?? 0} endpoint`
              })()}
              {activeJob.status === 'failed'    && `Lỗi: ${activeJob.error_message}`}
            </span>
            <span className="font-mono tabular-nums flex-shrink-0">{elapsed}</span>
            {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
              <button onClick={() => setActiveJob(null)} className="opacity-60 hover:opacity-100">×</button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#e2e8f0]">Web Crawler</h1>
            <p className="text-[#4a5568] text-xs mt-0.5">
              Katana crawl các web endpoint đang live · {baseUrls.length} site · {stats?.total ?? 0} URLs
            </p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">
            + Crawl
          </button>
        </div>

        {/* Stats bar */}
        {stats && stats.total > 0 && (
          <StatsBar stats={stats} activeSource={sourceFilter} onFilter={setSourceFilter} />
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Tìm URL, domain..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-sm bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]"
          />
          {baseUrls.length > 1 && (
            <select
              value={selectedBase ?? ''}
              onChange={e => setSelectedBase(e.target.value || null)}
              className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]"
            >
              <option value="">Tất cả site</option>
              {baseUrls.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
          {(search || sourceFilter || selectedBase) && (
            <button
              onClick={() => { setSearch(''); setSourceFilter(''); setSelectedBase(null) }}
              className="px-2 py-1.5 text-[#4a5568] hover:text-[#e2e8f0] text-xs border border-[#2d3748] rounded transition-colors"
            >
              Xoá filter
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-[#4a5568] text-sm">Đang tải...</span>
          </div>
        ) : filtered.filter(u => !selectedBase || u.base_url === selectedBase).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-[#4a5568] text-sm">
              {urls.length === 0 ? 'Chưa có kết quả crawl nào' : 'Không có URL khớp với filter'}
            </span>
            {urls.length === 0 && (
              <p className="text-[#2d3748] text-xs text-center max-w-xs">
                Chạy <span className="text-[#e2e8f0]">SCAN_WEB_INFO</span> trước để có danh sách endpoint live,
                sau đó bấm <span className="text-[#e2e8f0]">+ Crawl</span> để bắt đầu.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2330] text-[#4a5568]">
                  <th className="px-4 py-2.5 text-left font-medium w-2/5">URL</th>
                  <th className="px-4 py-2.5 text-left font-medium">Base URL</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Method</th>
                  <th className="px-4 py-2.5 text-left font-medium w-16">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium w-24">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium w-14">Depth</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .filter(u => !selectedBase || u.base_url === selectedBase)
                  .map(u => (
                  <tr key={u.id}
                    className="group border-b border-[#1e2330] hover:bg-[#1a1f2e] transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedBase(u.base_url)
                      setSelectedJobId(u.job_id)
                    }}
                  >
                    {/* URL */}
                    <td className="px-4 py-2 max-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[#4299e1] truncate" title={u.url}>
                          {u.url}
                        </span>
                        <CopyButton value={u.url} className="flex-shrink-0" />
                      </div>
                    </td>
                    {/* Base URL */}
                    <td className="px-4 py-2 max-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[#718096] truncate text-[11px]" title={u.base_url}>
                          {u.base_url}
                        </span>
                        <CopyButton value={u.base_url} className="flex-shrink-0" />
                      </div>
                    </td>
                    {/* Method */}
                    <td className="px-4 py-2">
                      <span className="font-mono text-[#fbd38d] text-[10px]">{u.method}</span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2">
                      <StatusBadge code={u.status_code} />
                    </td>
                    {/* Source */}
                    <td className="px-4 py-2">
                      <SourceBadge tag={u.source_tag} attr={u.source_attr} />
                    </td>
                    {/* Depth */}
                    <td className="px-4 py-2">
                      <span className="text-[#4a5568] font-mono">{u.depth}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scan modal */}
      {showModal && (
        <ScanModal
          wsid={wsid}
          targets={targets}
          onClose={() => setShowModal(false)}
          onJobCreated={job => setActiveJob(job)}
        />
      )}

      {/* History drawer — per base_url */}
      {selectedBase && selectedJobId && (
        <HistoryDrawer
          wsid={wsid}
          jobId={selectedJobId}
          baseUrl={selectedBase}
          onClose={() => { setSelectedBase(null); setSelectedJobId(null) }}
        />
      )}
    </div>
  )
}

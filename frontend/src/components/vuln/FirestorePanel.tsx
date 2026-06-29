'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useJobPolling } from '@/hooks/useJobPolling'
import { VulnHistoryDrawer } from '@/components/vuln/VulnHistoryDrawer'
import { FirebaseConfigTable } from '@/components/vuln/FirebaseConfigTable'
import { CopyButton } from '@/components/ui/CopyButton'
import {
  request, jobApi, targetApi, wordlistApi,
  firestoreApi, type FirestoreCollection, type FirestoreDocument, type FirestoreCrawl,
  type Target, type Job, type Wordlist,
} from '@/lib/api'

interface FsFinding {
  id: string; title: string; severity: string; status: string
  host: string | null; url: string | null; source_tool: string | null
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-[#4a1a1a] text-[#fc8181]', high: 'bg-[#3a2010] text-[#f6ad55]',
  medium: 'bg-[#3a3010] text-[#f6e05e]', low: 'bg-[#1a3a1a] text-[#68d391]',
  info: 'bg-[#1a2a3a] text-[#63b3ed]',
}

type FsView = 'findings' | 'config' | 'documents' | 'collections' | 'crawl'
const VIEWS: { key: FsView; label: string; dot: string }[] = [
  { key: 'findings',    label: 'Findings',    dot: '#fc8181' },
  { key: 'config',      label: 'Config',      dot: '#63b3ed' },
  { key: 'collections', label: 'Collections', dot: '#48bb78' },
  { key: 'documents',   label: 'Documents',   dot: '#ed8936' },
  { key: 'crawl',       label: 'Crawl',       dot: '#805ad5' },
]
const FUZZ_SIZES = ['top-50', 'top-250', 'top-500']
const DOC_LIMIT = 100

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

const CRAWL_STATUS: Record<string, string> = {
  ok:      'bg-[#1a3a1a] text-[#68d391]',
  partial: 'bg-[#3a3010] text-[#f6e05e]',
  error:   'bg-[#4a1a1a] text-[#fc8181]',
}

export function FirestorePanel({ wsid, domain }: { wsid: string; domain: string }) {
  const [view, setView]         = useState<FsView>('findings')
  const [findings, setFindings] = useState<FsFinding[]>([])
  const [cols, setCols]         = useState<FirestoreCollection[]>([])
  const [docs, setDocs]         = useState<FirestoreDocument[]>([])
  const [targets, setTargets]   = useState<Target[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fuzzWl, setFuzzWl]       = useState('top-250')
  const [wls, setWls]             = useState<Wordlist[]>([])
  const [docTotal, setDocTotal]   = useState(0)
  const [docOffset, setDocOffset] = useState(0)
  const [fetchErr, setFetchErr]   = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<{ title: string; host: string | null; url: string | null } | null>(null)
  // Lịch sử chạy của Collections — focus=null → per-run (group job_id); focus set → timeline 1 collection
  const [collHist, setCollHist] = useState<{ focus: { collection: string; targetId: string | null; name: string } | null } | null>(null)
  const [colSearch, setColSearch] = useState('')
  const [colTarget, setColTarget] = useState('')
  const [docSearch, setDocSearch] = useState('')
  const [docTarget, setDocTarget] = useState('')
  const [crawls, setCrawls]       = useState<FirestoreCrawl[]>([])
  const [crawlSearch, setCrawlSearch] = useState('')
  const [crawlTarget, setCrawlTarget] = useState('')

  const loadDocs = useCallback(async (offset: number, target?: string) => {
    const t = target !== undefined ? target : docTarget
    const d = await firestoreApi.documents(wsid, { limit: DOC_LIMIT, offset, target: t || undefined })
    setDocs(d.data ?? []); setDocTotal(d.total ?? 0); setDocOffset(offset)
  }, [wsid, docTarget])

  const reload = useCallback(async () => {
    try {
      const [f, c, cr] = await Promise.all([
        request<{ data: FsFinding[] }>(`/api/workspaces/${wsid}/vuln-findings?domain=${domain}`),
        firestoreApi.collections(wsid),
        firestoreApi.crawls(wsid),
      ])
      setFindings((f.data ?? []).filter(x => x.source_tool === 'firebase-firestore'))
      setCols(c.data ?? [])
      setCrawls(cr.data ?? [])
      await loadDocs(0)
      setFetchErr(null)
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : String(e))
    }
  }, [wsid, domain, loadDocs])

  const matchJob = useCallback((j: Job) => {
    const ds = j.payload?.domains as string[] | undefined
    const ts = j.payload?.tools as string[] | undefined
    return !!ds?.includes(domain) && !!ts?.some(t => t.startsWith('firebase-firestore'))
  }, [domain])

  const { activeJob, setActiveJob, elapsed } = useJobPolling(
    wsid, 'VULN_DISPATCH', reload, 3000, { onProgress: reload, matchJob },
  )
  const running = activeJob?.status === 'running' || activeJob?.status === 'pending'

  // Job đang chạy "thuộc" view nào → chỉ hiện banner/running ở đúng view đó
  // (tránh việc bấm Crawl mà mọi tab Firestore đều báo running).
  const jobTool = (activeJob?.payload?.tools as string[] | undefined)?.[0] ?? ''
  const jobOwnsView: boolean =
    jobTool === 'firebase-firestore-crawl' ? view === 'crawl'
    : jobTool === 'firebase-firestore-fuzz' ? view === 'collections'
    : (view === 'findings' || view === 'collections' || view === 'documents')  // scan firestore
  const showJob     = !!activeJob && jobOwnsView
  const runningHere = running && jobOwnsView

  useEffect(() => {
    reload()
    targetApi.list(wsid).then(setTargets).catch(() => {})
    wordlistApi.list().then(r => setWls(r.data ?? [])).catch(() => {})
  }, [reload, wsid])

  const toggle = (id: string) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll = () => setSelectedIds(new Set(targets.map(t => t.id)))
  const clearTargets = () => setSelectedIds(new Set())
  const allSelected = targets.length > 0 && selectedIds.size === targets.length

  const run = async (tool: string, extra?: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = { workspace_id: wsid, domains: [domain], tools: [tool], ...extra }
      if (selectedIds.size > 0) payload.target_ids = [...selectedIds]
      const job = await jobApi.create(wsid, { job_type: 'VULN_DISPATCH', payload })
      setActiveJob(job)
    } catch { setFetchErr('Không tạo được job') }
  }

  const runBtn = view === 'collections'
    ? { label: 'Fuzz collections', act: () => run('firebase-firestore-fuzz', { fuzz_wordlist: fuzzWl }) }
    : view === 'crawl'
    ? { label: 'Run Crawl', act: () => run('firebase-firestore-crawl') }
    : { label: 'Run Firestore', act: () => run('firebase-firestore') }

  const apiCell = (k: string | null) => <td className="px-4 py-2 font-mono text-[10px] text-[#718096]">{k ?? '—'}</td>

  // Collections nhóm theo target (target_id → domain; fallback project_id) — trực quan khi nhiều target
  const colGroups = (() => {
    const m = new Map<string, FirestoreCollection[]>()
    for (const c of cols) {
      const k = c.target_id ?? c.project_id ?? 'unknown'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    return [...m.entries()].map(([key, rows]) => ({
      key,
      projectId: rows[0]?.project_id ?? '',
      name: targets.find(t => t.id === key)?.domain ?? rows[0]?.project_id ?? key,
      rows,
    }))
  })()

  // Lọc theo target (select) + search collection
  const filteredGroups = colGroups
    .filter(g => !colTarget || g.key === colTarget)
    .map(g => ({ ...g, rows: g.rows.filter(c => !colSearch || c.collection.toLowerCase().includes(colSearch.toLowerCase())) }))
    .filter(g => g.rows.length > 0)
  const shownCount = filteredGroups.reduce((n, g) => n + g.rows.length, 0)

  // Documents — nhóm trang hiện tại theo target + search client (target select đã lọc server-side)
  const docGroups = (() => {
    const filtered = docs.filter(d => !docSearch
      || `${d.doc_path} ${d.collection ?? ''}`.toLowerCase().includes(docSearch.toLowerCase()))
    const m = new Map<string, FirestoreDocument[]>()
    for (const d of filtered) {
      const k = d.target_id ?? d.project_id ?? 'unknown'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(d)
    }
    return [...m.entries()].map(([key, rows]) => ({
      key,
      projectId: rows[0]?.project_id ?? '',
      name: targets.find(t => t.id === key)?.domain ?? rows[0]?.project_id ?? key,
      rows,
    }))
  })()

  // Crawl — nhóm metadata theo target (latest-run per target từ backend)
  const crawlGroupsAll = (() => {
    const m = new Map<string, FirestoreCrawl[]>()
    for (const c of crawls) {
      const k = c.target_id ?? c.project_id ?? 'unknown'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    return [...m.entries()].map(([key, rows]) => ({
      key,
      projectId: rows[0]?.project_id ?? '',
      name: targets.find(t => t.id === key)?.domain ?? rows[0]?.project_id ?? key,
      rows,
      totalDocs: rows.reduce((n, r) => n + r.doc_count, 0),
      collectedAt: rows.map(r => r.created_at).sort().at(-1) ?? '',
    }))
  })()
  const crawlGroups = crawlGroupsAll
    .filter(g => !crawlTarget || g.key === crawlTarget)
    .map(g => ({ ...g, rows: g.rows.filter(c => !crawlSearch || c.collection.toLowerCase().includes(crawlSearch.toLowerCase())) }))
    .filter(g => g.rows.length > 0)
  const crawlTotalDocs = crawlGroups.reduce((n, g) => n + g.rows.reduce((s, r) => s + r.doc_count, 0), 0)

  return (
    <>
      {/* COMPONENT VIEW sub-tabs */}
      <div className="flex items-center gap-1 border border-[#1e2330] rounded-lg bg-[#0d1117] px-2 py-1 w-fit">
        <span className="text-[9px] text-[#4a5568] uppercase tracking-wider mr-1">View</span>
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] transition-colors
              ${v.key === view ? 'bg-[#1a1f2e] text-[#a78bfa]' : 'text-[#718096] hover:text-[#a0aec0]'}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.dot }} />{v.label}
          </button>
        ))}
      </div>

      {/* Active job banner — chỉ hiện ở view "sở hữu" job (crawl/fuzz/scan) */}
      {showJob && activeJob && (
        <div className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
          activeJob.status === 'running' ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
          : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
          : activeJob.status === 'pending' ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
          : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'}`}>
          {running && <span className="inline-block w-2.5 h-2.5 rounded-full bg-current animate-pulse" />}
          <span className="flex-1">
            {activeJob.status === 'running' && (
              jobTool === 'firebase-firestore-crawl' ? 'Đang crawl toàn bộ document…'
              : jobTool === 'firebase-firestore-fuzz' ? 'Đang fuzz tên collection…'
              : 'Đang chạy OpenFirebase (firestore)…')}
            {activeJob.status === 'pending'   && 'Job đang chờ worker…'}
            {activeJob.status === 'completed' && '✓ Hoàn tất'}
            {activeJob.status === 'failed'    && '✕ Thất bại — xem worker logs'}
          </span>
          <span className="font-mono tabular-nums">{elapsed}</span>
          {!running && <button onClick={() => setActiveJob(null)} className="opacity-50 hover:opacity-100">×</button>}
        </div>
      )}

      {/* Target + Run — mọi view trừ Config (Config chỉ đọc, lấy từ scan) */}
      {view !== 'config' && (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#4a5568] uppercase tracking-wider">
                Target ({selectedIds.size === 0 ? 'tất cả' : `${selectedIds.size}/${targets.length} đã chọn`})
              </span>
              {targets.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button onClick={allSelected ? clearTargets : selectAll} disabled={runningHere}
                    className="px-2 py-0.5 rounded text-[10px] border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] hover:border-[#4a5568] transition-colors disabled:opacity-40">
                    {allSelected ? '☑ Bỏ chọn tất cả' : '☐ Chọn tất cả'}
                  </button>
                  {selectedIds.size > 0 && !allSelected && (
                    <button onClick={clearTargets} disabled={runningHere}
                      className="px-2 py-0.5 rounded text-[10px] text-[#4a5568] hover:text-[#a0aec0] transition-colors disabled:opacity-40">
                      Bỏ chọn
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {view === 'collections' && (
                <select value={fuzzWl} onChange={e => setFuzzWl(e.target.value)} disabled={runningHere} title="Wordlist fuzz collection"
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none max-w-[220px]">
                  <optgroup label="Firebase mặc định">
                    {FUZZ_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </optgroup>
                  {wls.length > 0 && (
                    <optgroup label="Wordlist hệ thống">
                      {wls.map(w => (
                        <option key={w.id} value={w.path} disabled={!w.available}>
                          {w.name}{w.line_count ? ` (${w.line_count})` : ''}{w.available ? '' : ' — n/a'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
              <button onClick={runBtn.act} disabled={runningHere}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors
                  ${runningHere ? 'bg-[#2d1f5e] text-[#6d53a6] cursor-not-allowed' : 'bg-[#4c1d95] hover:bg-[#5b21b6] text-[#e2e8f0]'}`}>
                {runningHere ? 'Running...' : `◉ ${runBtn.label}`}
              </button>
            </div>
          </div>
          {targets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {targets.map(t => {
                const on = selectedIds.has(t.id)
                return (
                  <button key={t.id} onClick={() => toggle(t.id)} disabled={runningHere}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors
                      ${on ? 'bg-[#2d1f5e] border-[#5b21b6] text-[#c4b5fd]' : 'bg-[#0d1117] border-[#2d3748] text-[#718096] hover:border-[#4a5568]'}`}>
                    {on ? '☑ ' : '☐ '}{t.domain}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {fetchErr && <div className="bg-[#2d1010] border border-[#5a1a1a] rounded px-4 py-2 text-[11px] text-[#fc8181]">{fetchErr}</div>}

      {/* Content per view */}
      {view === 'config' && <FirebaseConfigTable wsid={wsid} />}

      {view === 'findings' && (
        <Table head={['Severity', 'Title', 'Host / URL', 'Status']} count={findings.length} empty="Chưa có Firestore findings">
          {findings.map(f => (
            <tr key={f.id} onClick={() => setSelectedFinding({ title: f.title, host: f.host, url: f.url })}
              className="border-b border-[#1e2330] hover:bg-[#1a1f2e] cursor-pointer">
              <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEV_COLORS[f.severity] ?? ''}`}>{f.severity}</span></td>
              <td className="px-4 py-2 text-[#e2e8f0] max-w-md truncate" title={f.title}>{f.title}</td>
              <td className="px-4 py-2 font-mono text-[#718096] max-w-[220px] truncate">{f.host ?? f.url ?? '—'}</td>
              <td className="px-4 py-2 text-[#4a5568]">{f.status}</td>
            </tr>
          ))}
        </Table>
      )}

      {view === 'documents' && (
        docTotal === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
            <p className="text-[#4a5568] text-xs">Chưa có document — chạy Firestore/Fuzz</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
                Output <span className="text-[#4a5568] font-normal">
                  ({docOffset + 1}–{docOffset + docs.length} / {docTotal}
                  {docSearch && ` · ${docGroups.reduce((n, g) => n + g.rows.length, 0)} khớp`})
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <select value={docTarget} onChange={e => { setDocTarget(e.target.value); loadDocs(0, e.target.value) }}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                  <option value="">Tất cả target ({targets.length})</option>
                  {targets.map(t => <option key={t.id} value={t.id}>{t.domain}</option>)}
                </select>
                <input type="text" placeholder="Tìm document/collection..." value={docSearch} onChange={e => setDocSearch(e.target.value)}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48" />
              </div>
            </div>
            {docGroups.length === 0 && (
              <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
                <p className="text-[#4a5568] text-xs">Không có document khớp bộ lọc</p>
              </div>
            )}
            {docGroups.map(g => (
              <div key={g.key} className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
                {/* Header nhóm theo target */}
                <div className="px-4 py-2 bg-[#0d1117] border-b border-[#1e2330] flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ed8936] flex-shrink-0" />
                  <span className="text-[#e2e8f0] font-semibold">{g.name}</span>
                  <span className="text-[#4a5568] font-mono">· project: {g.projectId}</span>
                  <span className="text-[#4a5568]">· {g.rows.length} document</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2330] text-[#4a5568]">
                        {['URL document', 'API key', 'Collection'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(d => (
                        <tr key={d.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] group">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5 max-w-[440px]">
                              <span className="font-mono text-[10px] text-[#63b3ed] truncate" title={d.url ?? d.doc_path}>{d.url ?? d.doc_path}</span>
                              {(d.url ?? d.doc_path) && <CopyButton value={d.url ?? d.doc_path} />}
                            </div>
                          </td>
                          {apiCell(d.api_key)}
                          <td className="px-4 py-2 text-[#718096]">{d.collection ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between text-[11px] text-[#718096]">
              <span>{docOffset + 1}–{docOffset + docs.length} / {docTotal} documents</span>
              <div className="flex gap-2">
                <button disabled={running || docOffset === 0} onClick={() => loadDocs(Math.max(0, docOffset - DOC_LIMIT))}
                  className="px-2 py-1 border border-[#2d3748] rounded disabled:opacity-30 hover:text-[#e2e8f0] transition-colors">← Trước</button>
                <button disabled={running || docOffset + docs.length >= docTotal} onClick={() => loadDocs(docOffset + DOC_LIMIT)}
                  className="px-2 py-1 border border-[#2d3748] rounded disabled:opacity-30 hover:text-[#e2e8f0] transition-colors">Sau →</button>
              </div>
            </div>
          </div>
        )
      )}

      {view === 'collections' && (
        cols.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
            <p className="text-[#4a5568] text-xs">Chưa fuzz — bấm Fuzz collections</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
                Output <span className="text-[#4a5568] font-normal">({shownCount} collection · {filteredGroups.length} target)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setCollHist({ focus: null })}
                  className="px-2.5 py-1.5 rounded text-xs border border-[#2d3748] text-[#718096] hover:text-[#a78bfa] hover:border-[#4a5568] transition-colors whitespace-nowrap">
                  ⧖ Lịch sử chạy
                </button>
                <select value={colTarget} onChange={e => setColTarget(e.target.value)}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                  <option value="">Tất cả target ({colGroups.length})</option>
                  {colGroups.map(g => <option key={g.key} value={g.key}>{g.name}</option>)}
                </select>
                <input type="text" placeholder="Tìm collection..." value={colSearch} onChange={e => setColSearch(e.target.value)}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48" />
              </div>
            </div>
            {filteredGroups.length === 0 && (
              <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
                <p className="text-[#4a5568] text-xs">Không có collection khớp bộ lọc</p>
              </div>
            )}
            {filteredGroups.map(g => (
              <div key={g.key} className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
                {/* Header nhóm theo target */}
                <div className="px-4 py-2 bg-[#0d1117] border-b border-[#1e2330] flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] flex-shrink-0" />
                  <span className="text-[#e2e8f0] font-semibold">{g.name}</span>
                  <span className="text-[#4a5568] font-mono">· project: {g.projectId}</span>
                  <span className="text-[#4a5568]">· {g.rows.length} collection</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2330] text-[#4a5568]">
                        {['Collection', 'Documents', 'URL', 'API key'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(c => (
                        <tr key={c.id} title="Xem lịch sử chạy của collection này"
                          onClick={() => setCollHist({ focus: { collection: c.collection, targetId: c.target_id, name: g.name } })}
                          className="border-b border-[#1e2330] hover:bg-[#1a1f2e] group cursor-pointer">
                          <td className="px-4 py-2 text-[#68d391] font-semibold">{c.collection}</td>
                          <td className="px-4 py-2 font-mono text-[#f6ad55]">{c.doc_count}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5 max-w-[440px]">
                              <span className="font-mono text-[10px] text-[#718096] truncate" title={c.url ?? ''}>{c.url ?? '—'}</span>
                              {c.url && <CopyButton value={c.url} />}
                            </div>
                          </td>
                          {apiCell(c.api_key)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'crawl' && (
        crawls.length === 0 ? (
          <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-8 text-center">
            <p className="text-[#718096] text-sm mb-1">Chưa có dữ liệu crawl</p>
            <p className="text-[#4a5568] text-xs">
              Bấm <span className="text-[#a78bfa]">◉ Run Crawl</span> để dump toàn bộ document của các collection đã phát hiện
              (chạy Firestore/Fuzz trước để có collection).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
                Output <span className="text-[#4a5568] font-normal">
                  ({crawlTotalDocs.toLocaleString('vi-VN')} document · {crawlGroups.length} target)
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <select value={crawlTarget} onChange={e => setCrawlTarget(e.target.value)}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#553c9a]">
                  <option value="">Tất cả target ({crawlGroupsAll.length})</option>
                  {crawlGroupsAll.map(g => <option key={g.key} value={g.key}>{g.name}</option>)}
                </select>
                <input type="text" placeholder="Tìm collection..." value={crawlSearch} onChange={e => setCrawlSearch(e.target.value)}
                  className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-1.5 text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a] w-48" />
              </div>
            </div>
            {crawlGroups.length === 0 && (
              <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
                <p className="text-[#4a5568] text-xs">Không có collection khớp bộ lọc</p>
              </div>
            )}
            {crawlGroups.map(g => (
              <div key={g.key} className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
                {/* Header nhóm theo target */}
                <div className="px-4 py-2 bg-[#0d1117] border-b border-[#1e2330] flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#805ad5] flex-shrink-0" />
                  <span className="text-[#e2e8f0] font-semibold">{g.name}</span>
                  <span className="text-[#4a5568] font-mono">· project: {g.projectId}</span>
                  <span className="text-[#4a5568]">· {g.totalDocs.toLocaleString('vi-VN')} document</span>
                  {g.collectedAt && <span className="text-[#4a5568]">· {new Date(g.collectedAt).toLocaleString('vi-VN')}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2330] text-[#4a5568]">
                        {['Collection', 'Documents', 'Size', 'Status', ''].map((h, i) =>
                          <th key={i} className="px-4 py-2 text-left">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(c => (
                        <tr key={c.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e]">
                          <td className="px-4 py-2 text-[#68d391] font-semibold">{c.collection}</td>
                          <td className="px-4 py-2 font-mono text-[#f6ad55]">{c.doc_count.toLocaleString('vi-VN')}</td>
                          <td className="px-4 py-2 font-mono text-[#718096]">{fmtBytes(c.byte_size)}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${CRAWL_STATUS[c.status] ?? ''}`}
                              title={c.error ?? undefined}>
                              {c.status}{c.truncated ? ' (cắt)' : ''}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {c.doc_count > 0 && (
                              <a href={firestoreApi.crawlDownloadUrl(wsid, c.file_path)} download
                                className="text-[#63b3ed] hover:text-[#90cdf4] transition-colors">↓ Tải JSON</a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {selectedFinding && (
        <VulnHistoryDrawer
          wsid={wsid}
          domain={domain}
          tool="firebase-firestore"
          label={selectedFinding.title}
          isNuclei={false}
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
        />
      )}

      {collHist && (
        <CollectionsHistoryDrawer
          wsid={wsid}
          target={collHist.focus?.targetId ?? colTarget}
          focus={collHist.focus}
          onClose={() => setCollHist(null)}
        />
      )}
    </>
  )
}

// Drawer "Lịch sử chạy" cho Collections (append-only, rules/data-model.md R3+R6).
// focus=null → per-run (group job_id = từng phiên fuzz/scan); focus set → timeline 1 collection.
function CollectionsHistoryDrawer({ wsid, target, focus, onClose }: {
  wsid: string
  target: string
  focus: { collection: string; targetId: string | null; name: string } | null
  onClose: () => void
}) {
  const [items, setItems]   = useState<FirestoreCollection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    firestoreApi.collectionsHistory(wsid, { target: target || undefined })
      .then(r => setItems(r.data ?? [])).catch(console.error).finally(() => setLoading(false))
  }, [wsid, target])

  const eq = (a: string | null, b: string | null) => (a ?? '') === (b ?? '')

  // PER-COLLECTION: timeline 1 collection (theo identity collection + target_id)
  const occ = focus
    ? items.filter(c => c.collection === focus.collection && eq(c.target_id, focus.targetId))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    : null

  // PER-RUN: nhóm theo job_id = từng phiên chạy
  const sessions = focus ? [] : items.reduce<{ jobId: string | null; at: string; rows: FirestoreCollection[] }[]>((acc, c) => {
    const key = c.job_id ?? 'unknown'
    const ex = acc.find(s => (s.jobId ?? 'unknown') === key)
    if (ex) ex.rows.push(c)
    else acc.push({ jobId: c.job_id, at: c.created_at, rows: [c] })
    return acc
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2330] flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-[#4a5568] mb-0.5">
              {focus ? 'Lịch sử chạy của collection' : 'Lịch sử chạy — Collections'}
            </p>
            <p className="text-sm text-[#e2e8f0] break-words">
              {focus ? focus.collection : 'Tất cả phiên fuzz/scan'}
            </p>
            {focus && <p className="font-mono text-[10px] text-[#4a5568] mt-0.5 truncate">{focus.name}</p>}
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
                {occ.map((c, i) => (
                  <div key={c.id} className={`px-5 py-4 ${i === 0 ? 'bg-[#141720]' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {i === 0 && <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>}
                      {i === occ.length - 1 && occ.length > 1 && <span className="px-1.5 py-0.5 bg-[#1a2a3a] text-[#63b3ed] text-[9px] rounded font-semibold">LẦN ĐẦU</span>}
                      <span className="text-xs text-[#e2e8f0]">{new Date(c.created_at).toLocaleString('vi-VN')}</span>
                      <span className="text-[10px] text-[#f6ad55] font-mono">{c.doc_count} docs</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      {c.project_id && <div className="flex gap-2"><span className="text-[#4a5568] w-16 flex-shrink-0">Project</span><span className="text-[#cbd5e0] font-mono break-all">{c.project_id}</span></div>}
                      {c.url && <div className="flex gap-2"><span className="text-[#4a5568] w-16 flex-shrink-0">URL</span><span className="text-[#cbd5e0] font-mono break-all">{c.url}</span></div>}
                      {c.api_key && <div className="flex gap-2"><span className="text-[#4a5568] w-16 flex-shrink-0">API key</span><span className="text-[#cbd5e0] font-mono break-all">{c.api_key}</span></div>}
                      {c.job_id && <div className="flex gap-2"><span className="text-[#4a5568] w-16 flex-shrink-0">Job</span><span className="text-[#2d3748] font-mono">{c.job_id.slice(0, 8)}…</span></div>}
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
                    {i === 0 && <span className="px-1.5 py-0.5 bg-[#2d1f52] text-[#b794f4] text-[9px] rounded font-semibold">MỚI NHẤT</span>}
                    <span className="text-xs text-[#e2e8f0] font-medium">{new Date(s.at).toLocaleString('vi-VN')}</span>
                    <span className="text-[10px] text-[#4a5568]">· {s.rows.length} collection</span>
                  </div>
                  <div className="space-y-1">
                    {s.rows.sort((a, b) => b.doc_count - a.doc_count).map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[#68d391] truncate flex-1" title={c.collection}>{c.collection}</span>
                        <span className="text-[#f6ad55] font-mono flex-shrink-0">{c.doc_count} docs</span>
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

function Table({ head, count, empty, children }: { head: string[]; count: number; empty: string; children: ReactNode }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
        Output <span className="text-[#4a5568] font-normal">({count})</span>
      </h3>
      {count === 0 ? (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg p-6 text-center">
          <p className="text-[#4a5568] text-xs">{empty}</p>
        </div>
      ) : (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[#1e2330] text-[#4a5568]">{head.map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
              <tbody>{children}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

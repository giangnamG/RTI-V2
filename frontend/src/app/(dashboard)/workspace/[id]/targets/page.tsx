'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Target, targetApi } from '@/lib/api'
import { TargetForm } from '@/components/target/TargetForm'

export default function TargetsPage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [showSingle, setShowSingle] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editTarget, setEditTarget] = useState<Target | undefined>()
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const ts = await targetApi.list(wsid)
      setTargets(ts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [wsid])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSingleSaved(t: Target) {
    setTargets(prev => editTarget
      ? prev.map(x => x.id === t.id ? t : x)
      : [t, ...prev]
    )
    setShowSingle(false)
    setEditTarget(undefined)
    showToast(editTarget ? 'Đã cập nhật target' : 'Đã thêm target')
  }

  function handleBulkSaved({ created, skipped }: { created: number; skipped: number }) {
    setShowBulk(false)
    showToast(`Đã import ${created} domain${skipped > 0 ? `, bỏ qua ${skipped} trùng` : ''}`)
    load()
  }

  async function handleDelete(t: Target) {
    if (!confirm(`Xóa target "${t.domain}"?`)) return
    try {
      await targetApi.delete(wsid, t.id)
      setTargets(prev => prev.filter(x => x.id !== t.id))
      showToast('Đã xóa target')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  async function toggleActive(t: Target) {
    try {
      const updated = await targetApi.update(wsid, t.id, {
        domain: t.domain,
        notes: t.notes,
        is_active: !t.is_active,
      })
      setTargets(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-[#4a5568]">
            {loading ? 'Đang tải...' : `${targets.length} domain`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] hover:border-[#4a5568] text-xs rounded transition-colors"
          >
            Import bulk
          </button>
          <button
            onClick={() => { setEditTarget(undefined); setShowSingle(true) }}
            className="px-3 py-1.5 bg-[#553c9a] hover:bg-[#6b46c1] text-white text-xs rounded font-medium transition-colors"
          >
            + Thêm Target
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-xs text-[#4a5568]">Đang tải danh sách target...</div>
        </div>
      ) : targets.length === 0 ? (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg">
          <div className="text-center py-16">
            <div className="text-2xl mb-3 text-[#2d3748]">◎</div>
            <p className="text-sm text-[#4a5568] mb-1">Chưa có target nào</p>
            <p className="text-xs text-[#2d3748] mb-4">Thêm domain để bắt đầu quá trình recon</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowSingle(true)}
                className="px-4 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-white text-xs rounded font-medium transition-colors"
              >
                + Thêm domain
              </button>
              <button
                onClick={() => setShowBulk(true)}
                className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors"
              >
                Import danh sách
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2330]">
                <th className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">Domain</th>
                <th className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">IP</th>
                <th className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">Ghi chú</th>
                <th className="text-left px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">Trạng thái</th>
                <th className="text-right px-4 py-2.5 text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {targets.map(t => (
                <tr key={t.id} className="border-b border-[#1e2330] last:border-0 hover:bg-[#1a1f2e] transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[#e2e8f0] text-xs">{t.domain}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[#718096] text-xs">{t.ip_address ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-[#4a5568] text-xs max-w-[200px] truncate">
                    {t.notes || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        t.is_active
                          ? 'bg-[#1a2f1a] text-[#68d391] hover:bg-[#1f3a1f]'
                          : 'bg-[#1a1f2e] text-[#4a5568] hover:bg-[#1e2330]'
                      }`}
                    >
                      {t.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditTarget(t); setShowSingle(true) }}
                        className="px-2 py-1 text-[10px] text-[#718096] hover:text-[#e2e8f0] border border-[#2d3748] hover:border-[#4a5568] rounded transition-colors"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="px-2 py-1 text-[10px] text-[#718096] hover:text-[#fc8181] border border-[#2d3748] hover:border-[#fc8181] rounded transition-colors"
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Table footer */}
          <div className="px-4 py-2.5 border-t border-[#1e2330] flex items-center justify-between">
            <span className="text-[10px] text-[#2d3748]">{targets.length} domain</span>
            <span className="text-[10px] text-[#2d3748]">
              {targets.filter(t => t.is_active).length} active
            </span>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 text-xs px-4 py-2.5 rounded-lg shadow-xl border transition-all ${
          toast.type === 'error'
            ? 'bg-[#141720] border-[#fc8181] text-[#fc8181]'
            : 'bg-[#141720] border-[#276749] text-[#68d391]'
        }`}>
          {toast.msg}
        </div>
      )}

      {showSingle && (
        <TargetForm
          mode="single"
          wsid={wsid}
          target={editTarget}
          onSaved={handleSingleSaved}
          onCancel={() => { setShowSingle(false); setEditTarget(undefined) }}
        />
      )}

      {showBulk && (
        <TargetForm
          mode="bulk"
          wsid={wsid}
          onSaved={handleBulkSaved}
          onCancel={() => setShowBulk(false)}
        />
      )}
    </div>
  )
}

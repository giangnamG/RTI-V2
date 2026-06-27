'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Workspace, workspaceApi } from '@/lib/api'

interface Props {
  workspace: Workspace
  onDeleted: () => void
  onEdit: (ws: Workspace) => void
}

export function WorkspaceCard({ workspace: ws, onDeleted, onEdit }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Xóa workspace "${ws.name}"? Toàn bộ target và dữ liệu sẽ bị xóa.`)) return
    setDeleting(true)
    try {
      await workspaceApi.delete(ws.id)
      onDeleted()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation()
    onEdit(ws)
  }

  return (
    <div
      onClick={() => router.push(`/workspace/${ws.id}/targets`)}
      className="bg-[#141720] border border-[#1e2330] rounded-lg p-4 hover:border-[#553c9a] hover:bg-[#161b28] transition-all cursor-pointer group relative"
    >
      {/* Color bar */}
      <div className="h-0.5 rounded-full mb-4 opacity-80 group-hover:opacity-100 transition-opacity" style={{ background: ws.color }} />

      {/* Name row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[#c4cdd8] text-sm truncate group-hover:text-[#a78bfa] transition-colors">
            {ws.name}
          </h3>
          {ws.description && (
            <p className="text-[11px] text-[#4a5568] mt-0.5 line-clamp-2 leading-relaxed">
              {ws.description}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleEdit}
            className="px-2 py-1 text-[10px] text-[#718096] hover:text-[#e2e8f0] border border-[#2d3748] hover:border-[#4a5568] rounded transition-colors"
          >
            Sửa
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-2 py-1 text-[10px] text-[#718096] hover:text-[#fc8181] border border-[#2d3748] hover:border-[#fc8181] rounded transition-colors disabled:opacity-40"
          >
            {deleting ? '...' : 'Xóa'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#4a5568]">
            <span className="text-[#a0aec0] font-medium">{ws.target_count}</span>
            <span className="text-[#2d3748]"> targets</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#2d3748]">
            {new Date(ws.created_at).toLocaleDateString('vi-VN')}
          </span>
          <span className="text-[10px] text-[#553c9a] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Mở →
          </span>
        </div>
      </div>
    </div>
  )
}

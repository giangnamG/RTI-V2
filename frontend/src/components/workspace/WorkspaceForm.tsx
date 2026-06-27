'use client'

import { useState } from 'react'
import { Workspace, workspaceApi } from '@/lib/api'

const COLORS = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#db2777', '#0891b2']

interface Props {
  workspace?: Workspace
  onSaved: (ws: Workspace) => void
  onCancel: () => void
}

export function WorkspaceForm({ workspace, onSaved, onCancel }: Props) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [description, setDescription] = useState(workspace?.description ?? '')
  const [color, setColor] = useState(workspace?.color ?? COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Tên workspace là bắt buộc'); return }
    setLoading(true)
    setError('')
    try {
      const ws = workspace
        ? await workspaceApi.update(workspace.id, { name, description, color })
        : await workspaceApi.create({ name, description, color })
      onSaved(ws)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330]">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">
            {workspace ? 'Sửa Workspace' : 'Tạo Workspace mới'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-[#718096] mb-1">Tên *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Bank Target 2025"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#718096] mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Mô tả ngắn về chiến dịch..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-[#718096] mb-2">Màu</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor: color === c ? '#e2e8f0' : 'transparent',
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e2e8f0] text-sm rounded font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : workspace ? 'Cập nhật' : 'Tạo Workspace'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-sm rounded transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

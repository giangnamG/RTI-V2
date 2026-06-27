'use client'

import { useEffect, useState } from 'react'
import { Workspace, workspaceApi } from '@/lib/api'
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard'
import { WorkspaceForm } from '@/components/workspace/WorkspaceForm'

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Workspace | undefined>()

  async function load() {
    try {
      setWorkspaces(await workspaceApi.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSaved(ws: Workspace) {
    setWorkspaces(prev =>
      editTarget
        ? prev.map(w => w.id === ws.id ? ws : w)
        : [{ ...ws, target_count: 0 }, ...prev]
    )
    setShowForm(false)
    setEditTarget(undefined)
  }

  function handleEdit(ws: Workspace) {
    setEditTarget(ws)
    setShowForm(true)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[#e2e8f0]">Workspaces</h1>
          <p className="text-xs text-[#4a5568] mt-0.5">Quản lý các chiến dịch pentest/redteam</p>
        </div>
        <button
          onClick={() => { setEditTarget(undefined); setShowForm(true) }}
          className="px-4 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e2e8f0] text-sm rounded font-medium transition-colors"
        >
          + Tạo Workspace
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 text-[#4a5568] text-sm">Đang tải...</div>
      ) : workspaces.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[#4a5568] text-sm">Chưa có workspace nào.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-[#a78bfa] text-sm hover:underline"
          >
            Tạo workspace đầu tiên →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onDeleted={() => setWorkspaces(prev => prev.filter(w => w.id !== ws.id))}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {showForm && (
        <WorkspaceForm
          workspace={editTarget}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditTarget(undefined) }}
        />
      )}
    </div>
  )
}

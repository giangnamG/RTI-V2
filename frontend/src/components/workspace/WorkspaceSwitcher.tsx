'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Workspace, workspaceApi } from '@/lib/api'

export function WorkspaceSwitcher() {
  const params = useParams<{ id?: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [current, setCurrent] = useState<Workspace | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workspaceApi.list()
      .then(setWorkspaces)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (params.id && workspaces.length > 0) {
      setCurrent(workspaces.find(w => w.id === params.id) ?? null)
    } else {
      setCurrent(null)
    }
  }, [params.id, workspaces])

  // Close dropdown khi click ngoài
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function getCurrentTab(): string {
    const match = pathname.match(/\/workspace\/[^/]+\/([^/]+)/)
    return match ? match[1] : 'targets'
  }

  function switchTo(ws: Workspace) {
    const tab = getCurrentTab()
    router.push(`/workspace/${ws.id}/${tab}`)
    setOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative px-2 py-2 border-b border-[#1e2330]">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1a1f2e] transition-colors text-left group"
      >
        {loading ? (
          <div className="w-2 h-2 rounded-full bg-[#2d3748] flex-shrink-0" />
        ) : current ? (
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: current.color }} />
        ) : (
          <div className="w-2 h-2 rounded-full border border-[#2d3748] flex-shrink-0" />
        )}

        <span className={`flex-1 text-xs truncate ${current ? 'text-[#c4cdd8]' : 'text-[#4a5568]'}`}>
          {loading ? 'Đang tải...' : current?.name ?? 'Chọn workspace...'}
        </span>

        <svg
          className={`w-3 h-3 text-[#4a5568] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-[#0d1117] border border-[#1e2330] rounded-lg shadow-2xl z-50 overflow-hidden">
          {/* Header: về trang workspaces */}
          <Link
            href="/workspaces"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[10px] text-[#4a5568] hover:text-[#a78bfa] hover:bg-[#1a1f2e] transition-colors border-b border-[#1e2330]"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Tất cả workspaces
          </Link>

          {/* Danh sách workspaces */}
          <div className="max-h-48 overflow-y-auto">
            {workspaces.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-[#4a5568] text-center">
                Chưa có workspace nào
              </p>
            ) : (
              workspaces.map(ws => {
                const isCurrent = ws.id === current?.id
                return (
                  <button
                    key={ws.id}
                    onClick={() => switchTo(ws)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#1a1f2e] ${
                      isCurrent ? 'bg-[#16192a]' : ''
                    }`}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: ws.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${isCurrent ? 'text-[#a78bfa]' : 'text-[#c4cdd8]'}`}>
                        {ws.name}
                      </p>
                      <p className="text-[10px] text-[#2d3748]">{ws.target_count} targets</p>
                    </div>
                    {isCurrent && (
                      <svg className="w-3 h-3 text-[#a78bfa] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer: tạo mới */}
          <div className="border-t border-[#1e2330]">
            <Link
              href="/workspaces"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[10px] text-[#4a5568] hover:text-[#68d391] hover:bg-[#1a1f2e] transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Tạo workspace mới
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

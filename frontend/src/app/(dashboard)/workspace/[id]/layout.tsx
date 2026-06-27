'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Workspace, workspaceApi } from '@/lib/api'

const TABS = [
  { key: 'targets',  label: 'Targets',  icon: '◎' },
  { key: 'recon',    label: 'Recon',    icon: '⟡', disabled: true },
  { key: 'attack',   label: 'Attack',   icon: '◈', disabled: true },
  { key: 'findings', label: 'Findings', icon: '⚑', disabled: true },
]

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const pathname = usePathname()
  const [ws, setWs] = useState<Workspace | null>(null)

  useEffect(() => {
    workspaceApi.get(id).then(setWs).catch(console.error)
  }, [id])

  return (
    <div className="flex flex-col min-h-full">
      {/* Workspace header + tabs */}
      <div className="bg-[#141720] border-b border-[#1e2330]">
        <div className="px-6 pt-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#4a5568] mb-3">
            <Link href="/workspaces" className="hover:text-[#a78bfa] transition-colors">
              Workspaces
            </Link>
            <span>›</span>
            <span className="text-[#a78bfa]">{ws?.name ?? '...'}</span>
          </div>

          {/* Workspace identity */}
          {ws && (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ws.color }} />
              <h1 className="text-sm font-bold text-[#e2e8f0]">{ws.name}</h1>
              {ws.description && (
                <span className="text-xs text-[#4a5568] truncate max-w-[300px]">{ws.description}</span>
              )}
              <span className="ml-auto text-[10px] text-[#2d3748]">
                {ws.target_count} targets
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(tab => {
              const href = `/workspace/${id}/${tab.key}`
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={tab.key}
                  href={tab.disabled ? '#' : href}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
                    ${active
                      ? 'text-[#a78bfa] border-[#7c3aed]'
                      : tab.disabled
                        ? 'text-[#2d3748] border-transparent cursor-not-allowed'
                        : 'text-[#4a5568] border-transparent hover:text-[#718096] hover:border-[#2d3748]'
                    }`}
                >
                  <span className="mr-1.5 text-[10px]">{tab.icon}</span>
                  {tab.label}
                  {tab.disabled && (
                    <span className="ml-1.5 text-[9px] text-[#2d3748]">soon</span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}

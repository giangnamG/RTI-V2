'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'

const DOT_COLOR: Record<string, string> = {
  purple: '#805ad5',
  green:  '#48bb78',
  blue:   '#4299e1',
  orange: '#ed8936',
  red:    '#fc8181',
  gray:   '#4a5568',
}

interface NavItem {
  label: string
  dot: string
  href: (wsid?: string) => string
  wsRequired?: boolean
}

const NAV_GROUPS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Campaign',
    items: [
      { label: 'Workspaces', dot: 'purple', href: () => '/workspaces' },
      { label: 'Targets',    dot: 'purple', href: (id) => id ? `/workspace/${id}/targets` : '#', wsRequired: true },
    ],
  },
  {
    section: 'Recon',
    items: [
      { label: 'Subdomains',      dot: 'green',  href: (id) => id ? `/workspace/${id}/recon/subdomains`    : '#', wsRequired: true },
      { label: 'Ports & Services',dot: 'green',  href: (id) => id ? `/workspace/${id}/recon/ports`         : '#', wsRequired: true },
      { label: 'Web Probing',     dot: 'blue',   href: (id) => id ? `/workspace/${id}/recon/web`           : '#', wsRequired: true },
    ],
  },
  {
    section: 'Attack',
    items: [
      { label: 'Pentest Modules', dot: 'purple', href: (id) => id ? `/workspace/${id}/attack/pentest`      : '#', wsRequired: true },
      { label: 'Fuzzing',         dot: 'orange', href: (id) => id ? `/workspace/${id}/attack/fuzzing`      : '#', wsRequired: true },
      { label: 'Findings',        dot: 'red',    href: (id) => id ? `/workspace/${id}/findings`            : '#', wsRequired: true },
    ],
  },
  {
    section: 'Tools',
    items: [
      { label: 'Service Categories', dot: 'blue', href: () => '/tools/service-categories' },
      { label: 'Jobs & Logs',        dot: 'gray', href: () => '#' },
      { label: 'Wordlists',          dot: 'gray', href: () => '#' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const params = useParams<{ id?: string }>()
  const wsid = params?.id

  return (
    <div className="w-[200px] bg-[#141720] border-r border-[#1e2330] flex-shrink-0 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-[#1e2330] font-bold text-[#7c3aed] text-sm tracking-widest">
        ◈ RTI v2
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map(group => (
          <div key={group.section} className="mb-1">
            <div className="px-4 py-1.5 text-[9px] text-[#4a5568] uppercase tracking-widest font-medium">
              {group.section}
            </div>

            {group.items.map(item => {
              const href = item.href(wsid)
              const disabled = href === '#' || (item.wsRequired && !wsid)
              const active = !disabled && pathname.startsWith(href)

              return (
                <Link
                  key={item.label}
                  href={disabled ? '#' : href}
                  title={item.wsRequired && !wsid ? 'Chọn workspace trước' : undefined}
                  className={`flex items-center gap-2 px-4 py-1.5 text-xs border-l-[3px] transition-colors
                    ${active
                      ? 'text-[#a78bfa] border-[#7c3aed] bg-[#1a1f2e]'
                      : disabled
                        ? 'text-[#2d3748] border-transparent cursor-not-allowed'
                        : 'text-[#718096] border-transparent hover:text-[#e2e8f0] hover:bg-[#1a1f2e]'
                    }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: disabled ? '#2d3748' : DOT_COLOR[item.dot] }}
                  />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#1e2330]">
        <p className="text-[9px] text-[#2d3748]">RTI v2 — Pentest Platform</p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { VULN_MODULES, moduleTools, submoduleOfTool } from './vulnConfig'

const DOT_COLOR: Record<string, string> = {
  purple: '#805ad5', green: '#48bb78', blue: '#4299e1',
  orange: '#ed8936', red: '#fc8181', gray: '#4a5568',
}

// Hàng module: Overview + các module trong config
const MODULE_TABS = [
  { seg: '', label: 'Overview', dot: 'purple' },
  ...VULN_MODULES.map(m => ({ seg: m.seg, label: m.title, dot: m.dot })),
]

export function VulnSubNav({ wsid }: { wsid: string }) {
  const pathname = usePathname()
  const search   = useSearchParams()

  const hrefOf = (seg: string) => seg ? `/workspace/${wsid}/vuln/${seg}` : `/workspace/${wsid}/vuln`

  // Module đang mở
  const activeModuleTab = MODULE_TABS.find(t => {
    const h = hrefOf(t.seg)
    return t.seg ? (pathname === h || pathname.startsWith(h + '/')) : pathname === h
  })
  const activeDef = VULN_MODULES.find(m => m.seg === activeModuleTab?.seg)

  // Tool đang chọn (qua ?tool=), mặc định tool đầu của module
  const allTools      = activeDef ? moduleTools(activeDef) : []
  const activeToolKey = search.get('tool') || allTools[0]?.key

  // Module con đang chọn (suy từ tool đang chọn) — chỉ với module 3 tầng
  const activeSub = activeDef?.submodules
    ? (submoduleOfTool(activeDef, activeToolKey ?? '') ?? activeDef.submodules[0])
    : undefined

  // Hàng tool: của module con đang chọn (3 tầng) hoặc của module (2 tầng)
  const toolRow      = activeSub?.tools ?? activeDef?.tools ?? []
  const toolRowLabel = activeSub?.toolLabel ?? 'Tools'

  const toolHref = (seg: string, key: string) => `${hrefOf(seg)}?tool=${encodeURIComponent(key)}`

  return (
    <div>
      {/* Hàng MODULE */}
      <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6 overflow-x-auto">
        {MODULE_TABS.map(tab => {
          const on = tab === activeModuleTab
          return (
            <a key={tab.seg || 'overview'} href={hrefOf(tab.seg)}
              className={`flex items-center gap-2 px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
                ${on
                  ? 'text-[#a78bfa] border-[#7c3aed]'
                  : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[tab.dot] }} />
              {tab.label}
            </a>
          )
        })}
      </div>

      {/* Hàng MODULE CON — chỉ với module 3 tầng (vd: Cloud → Nuclei/Firebase) */}
      {activeDef?.submodules && (
        <div className="flex items-center gap-1 border-b border-[#1e2330] bg-[#0d1117] px-6 py-1 overflow-x-auto">
          <span className="text-[9px] text-[#4a5568] uppercase tracking-wider mr-2 flex-shrink-0">Module</span>
          {activeDef.submodules.map(sub => {
            const on = sub.key === activeSub?.key
            return (
              <Link key={sub.key} scroll={false}
                href={toolHref(activeDef.seg, sub.tools[0]?.key ?? '')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] whitespace-nowrap transition-colors
                  ${on ? 'bg-[#1a1f2e] text-[#a78bfa]' : 'text-[#718096] hover:text-[#a0aec0]'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[sub.dot] ?? '#4a5568' }} />
                {sub.label}
              </Link>
            )
          })}
        </div>
      )}

      {/* Hàng TOOL — tool của module con (3 tầng) hoặc của module (2 tầng) */}
      {activeDef && toolRow.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[#1e2330] bg-[#0a0c12] px-6 py-1 overflow-x-auto">
          <span className="text-[9px] text-[#4a5568] uppercase tracking-wider mr-2 flex-shrink-0">{toolRowLabel}</span>
          {toolRow.map(t => {
            const on = t.key === activeToolKey
            return (
              <Link key={t.key} scroll={false}
                href={toolHref(activeDef.seg, t.key)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] whitespace-nowrap transition-colors
                  ${on ? 'bg-[#1a1f2e] text-[#a78bfa]' : 'text-[#718096] hover:text-[#a0aec0]'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[t.dot] ?? '#4a5568' }} />
                {t.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

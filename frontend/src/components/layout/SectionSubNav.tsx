'use client'

import { usePathname } from 'next/navigation'

const DOT_COLOR: Record<string, string> = {
  purple: '#805ad5', green: '#48bb78', blue: '#4299e1',
  orange: '#ed8936', red: '#fc8181', gray: '#4a5568',
}

interface ToolItem {
  name: string
  dot:  string
}

interface NavItem {
  seg:    string          // segment cuối của route ('subdomains', 'ports'...)
  label:  string
  dot:    string
  tools?: ToolItem[]      // (các) tool chạy ở trang này — liệt kê thành hàng riêng
}

function SubNav({ wsid, base, items }: { wsid: string; base: string; items: NavItem[] }) {
  const pathname = usePathname()
  const hrefOf = (seg: string) => `/workspace/${wsid}/${base}/${seg}`
  const active = items.find(it => {
    const h = hrefOf(it.seg)
    return pathname === h || pathname.startsWith(h + '/')
  })

  return (
    <div>
      {/* Hàng MODULE — các trang trong section */}
      <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6 overflow-x-auto">
        {items.map(it => {
          const on = it === active
          return (
            <a key={it.seg} href={hrefOf(it.seg)}
              className={`flex items-center gap-2 px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
                ${on
                  ? 'text-[#a78bfa] border-[#7c3aed]'
                  : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[it.dot] }} />
              {it.label}
            </a>
          )
        })}
      </div>

      {/* Hàng TOOL — tool của trang đang mở, liệt kê giống hàng module */}
      {active?.tools && active.tools.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[#1e2330] bg-[#0a0c12] px-6 py-1 overflow-x-auto">
          <span className="text-[9px] text-[#4a5568] uppercase tracking-wider mr-2 flex-shrink-0">Tools</span>
          {active.tools.map(t => (
            <span key={t.name}
              className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-[#718096] whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[t.dot] }} />
              {t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReconSubNav({ wsid }: { wsid: string }) {
  return (
    <SubNav wsid={wsid} base="recon" items={[
      { seg: 'subdomains', label: 'Subdomains',      dot: 'green', tools: [{ name: 'subfinder', dot: 'purple' }] },
      { seg: 'ports',      label: 'Ports & Services', dot: 'green', tools: [{ name: 'naabu',     dot: 'green'  }] },
      { seg: 'web',        label: 'Web Probe',        dot: 'blue',  tools: [{ name: 'httpx',     dot: 'blue'   }] },
      { seg: 'crawler',    label: 'Web Crawler',      dot: 'blue',  tools: [{ name: 'katana',    dot: 'blue'   }] },
      { seg: 'endpoints',  label: 'Endpoints',        dot: 'blue',  tools: [{ name: 'internal',  dot: 'gray'   }] },
    ]} />
  )
}

export function FuzzingSubNav({ wsid }: { wsid: string }) {
  return (
    <SubNav wsid={wsid} base="fuzzing" items={[
      { seg: 'params', label: 'Param Discovery',   dot: 'orange', tools: [{ name: 'arjun', dot: 'orange' }] },
      { seg: 'dirs',   label: 'Directory Fuzzing', dot: 'orange', tools: [{ name: 'ffuf',  dot: 'orange' }] },
    ]} />
  )
}

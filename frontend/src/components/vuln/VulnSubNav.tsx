'use client'

import { usePathname } from 'next/navigation'

const VULN_TABS = [
  { href: 'vuln',          label: 'Overview'        },
  { href: 'vuln/common',   label: 'Common'          },
  { href: 'vuln/cms',      label: 'CMS'             },
  { href: 'vuln/software', label: 'Software'        },
  { href: 'vuln/cloud',    label: 'Cloud'           },
  { href: 'vuln/discovery',label: 'Discovery'       },
  { href: 'vuln/network',  label: 'Network Service' },
  { href: 'vuln/web-params', label: 'Web Params'    },
]

export function VulnSubNav({ wsid }: { wsid: string }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6 overflow-x-auto">
      {VULN_TABS.map(tab => {
        const href = `/workspace/${wsid}/${tab.href}`
        const active = pathname === href || (tab.href !== 'vuln' && pathname.startsWith(href))
        return (
          <a key={tab.href} href={href}
            className={`px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
              ${active
                ? 'text-[#a78bfa] border-[#7c3aed]'
                : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

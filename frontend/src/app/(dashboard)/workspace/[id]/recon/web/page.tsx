'use client'

import { useParams } from 'next/navigation'

function ReconSubNav({ wsid }: { wsid: string }) {
  const items = [
    { href: `/workspace/${wsid}/recon/subdomains`, label: 'Subdomains' },
    { href: `/workspace/${wsid}/recon/ports`,      label: 'Ports & Services' },
    { href: `/workspace/${wsid}/recon/web`,        label: 'Web Probe' },
  ]
  return (
    <div className="flex gap-0 border-b border-[#1e2330] bg-[#0d1117] px-6">
      {items.map(item => {
        const active = typeof window !== 'undefined' && window.location.pathname === item.href
        return (
          <a key={item.href} href={item.href}
            className={`px-4 py-2 text-[11px] border-b-2 transition-colors -mb-px whitespace-nowrap
              ${active ? 'text-[#68d391] border-[#48bb78]' : 'text-[#4a5568] border-transparent hover:text-[#718096]'}`}
          >
            {item.label}
          </a>
        )
      })}
    </div>
  )
}

export default function WebProbePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex flex-col h-full">
      <ReconSubNav wsid={id} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 text-[#2d3748]">◌</div>
          <p className="text-sm text-[#4a5568] mb-1">Web Probe</p>
          <p className="text-xs text-[#2d3748]">Đang phát triển — sẽ hỗ trợ httpx, whatweb</p>
        </div>
      </div>
    </div>
  )
}

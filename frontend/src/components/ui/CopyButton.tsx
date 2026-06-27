'use client'

import { useState } from 'react'

interface Props {
  value: string
  className?: string
}

/**
 * Nút copy inline — hiện khi hover row (cần class `group` trên <tr>).
 * Click không bubble lên row để tránh trigger row handler.
 */
export function CopyButton({ value, className = '' }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy: ${value}`}
      className={`
        opacity-0 group-hover:opacity-100 transition-all duration-150
        flex-shrink-0 rounded px-1 py-0.5 text-[10px] leading-none
        ${copied
          ? 'text-[#68d391] opacity-100'
          : 'text-[#4a5568] hover:text-[#a0aec0] hover:bg-[#1e2330]'
        }
        ${className}
      `}
    >
      {copied ? (
        '✓'
      ) : (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6z"/>
          <path d="M2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h-1v1H2V6h1V5H2z"/>
        </svg>
      )}
    </button>
  )
}

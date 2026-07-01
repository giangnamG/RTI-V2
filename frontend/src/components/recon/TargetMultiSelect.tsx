'use client'

import { Target } from '@/lib/api'

/**
 * Multi-select target cho các dialog Recon — checkbox + "Chọn tất cả".
 * Gửi `target_ids` (mảng) vào payload job; worker loop qua từng target (scan pool).
 * Hiển thị thành phần đã chuẩn hoá (scheme/host/port) để user thấy target được parse thế nào.
 */
export function TargetMultiSelect({
  targets, selected, onChange, label = 'Chọn target',
}: {
  targets: Target[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  label?: string
}) {
  const allSelected = targets.length > 0 && selected.size === targets.length

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(next)
  }
  const toggleAll = () =>
    onChange(allSelected ? new Set() : new Set(targets.map(t => t.id)))

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-[#718096]">
          {label} <span className="text-[#4a5568]">({selected.size}/{targets.length})</span>
        </label>
        {targets.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-[11px] text-[#805ad5] hover:text-[#a78bfa] transition-colors"
          >
            {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
        )}
      </div>

      {targets.length === 0 ? (
        <p className="text-xs text-[#fc8181]">Workspace chưa có target active.</p>
      ) : (
        <div className="max-h-52 overflow-y-auto bg-[#0d1117] border border-[#2d3748] rounded divide-y divide-[#1e2330]">
          {targets.map(t => {
            const on = selected.has(t.id)
            return (
              <label
                key={t.id}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                  on ? 'bg-[#1a1f2e]' : 'hover:bg-[#141720]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(t.id)}
                  className="accent-[#553c9a]"
                />
                <span className="font-mono text-xs text-[#e2e8f0] truncate">{t.domain}</span>
                {t.host && (
                  <span className="ml-auto font-mono text-[10px] text-[#4a5568] flex-shrink-0">
                    {t.scheme || 'auto'} · {t.host}{t.port != null ? `:${t.port}` : ''}
                    {t.is_ip ? ' · IP' : ''}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Target, targetApi } from '@/lib/api'

interface SingleProps {
  mode: 'single'
  wsid: string
  target?: Target
  onSaved: (t: Target) => void
  onCancel: () => void
}

interface BulkProps {
  mode: 'bulk'
  wsid: string
  onSaved: (result: { created: number; skipped: number }) => void
  onCancel: () => void
}

type Props = SingleProps | BulkProps

export function TargetForm(props: Props) {
  const [domain, setDomain] = useState(props.mode === 'single' ? (props.target?.domain ?? '') : '')
  const [bulkText, setBulkText] = useState('')
  const [ip, setIp] = useState(props.mode === 'single' ? (props.target?.ip_address ?? '') : '')
  const [notes, setNotes] = useState(props.mode === 'single' ? (props.target?.notes ?? '') : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (props.mode === 'bulk') {
        const result = await targetApi.bulkCreate(props.wsid, bulkText, notes)
        props.onSaved({ created: result.created, skipped: result.skipped })
      } else if (props.target) {
        const t = await targetApi.update(props.wsid, props.target.id, { domain, ip_address: ip, notes })
        props.onSaved(t)
      } else {
        const t = await targetApi.create(props.wsid, { domain, ip_address: ip, notes })
        props.onSaved(t)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isBulk = props.mode === 'bulk'
  const isEdit = props.mode === 'single' && !!props.target

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-[#1e2330]">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">
            {isEdit ? 'Sửa Target' : isBulk ? 'Import nhiều domain' : 'Thêm Target'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {isBulk ? (
            <div>
              <label className="block text-xs text-[#718096] mb-1">
                Danh sách domain <span className="text-[#4a5568]">(mỗi dòng 1 domain, hoặc cách nhau bởi dấu phẩy)</span>
              </label>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={8}
                placeholder={"example.com\napi.example.com\ndev.example.com"}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] resize-none font-mono"
              />
              <p className="text-[10px] text-[#4a5568] mt-1">
                Domain trùng sẽ bị bỏ qua tự động
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-[#718096] mb-1">Domain *</label>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-[#718096] mb-1">IP Address <span className="text-[#4a5568]">(tùy chọn)</span></label>
                <input
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] font-mono"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-[#718096] mb-1">Ghi chú</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ghi chú về target này..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e2e8f0] text-sm rounded font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật' : isBulk ? 'Import' : 'Thêm Target'}
            </button>
            <button
              type="button"
              onClick={props.onCancel}
              className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-sm rounded transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { firebaseConfigApi, targetApi, type ExtractedFirebaseConfig, type Target } from '@/lib/api'
import { CopyButton } from '@/components/ui/CopyButton'

// Bảng config Firebase trích từ target — mỗi target 1 row.
// Cột: Target + apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId.
const COLS: { key: keyof ExtractedFirebaseConfig; label: string }[] = [
  { key: 'api_key',             label: 'apiKey' },
  { key: 'auth_domain',         label: 'authDomain' },
  { key: 'project_id',          label: 'projectId' },
  { key: 'storage_bucket',      label: 'storageBucket' },
  { key: 'messaging_sender_id', label: 'messagingSenderId' },
  { key: 'app_id',              label: 'appId' },
]

export function FirebaseConfigTable({ wsid }: { wsid: string }) {
  const [configs, setConfigs] = useState<ExtractedFirebaseConfig[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      firebaseConfigApi.list(wsid).then(r => setConfigs(r.data ?? [])),
      targetApi.list(wsid).then(setTargets).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [wsid])

  const nameOf = (c: ExtractedFirebaseConfig) =>
    targets.find(t => t.id === c.target_id)?.domain ?? c.host ?? c.project_id ?? '—'

  return (
    <div className="bg-[#141720] border border-[#1e2330] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1e2330] flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] flex-shrink-0" />
        <span className="text-xs font-semibold text-[#e2e8f0]">Firebase config trích được từ target</span>
        {!loading && <span className="text-[10px] text-[#4a5568]">· {configs.length} target</span>}
      </div>
      {loading ? (
        <div className="py-10 text-center text-xs text-[#4a5568]">Đang tải...</div>
      ) : configs.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#4a5568]">
          Chưa có config — chạy một component Firebase (RTDB / Firestore / …) để trích config từ target.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e2330] text-[#4a5568]">
                <th className="px-4 py-2 text-left">Target</th>
                {COLS.map(c => <th key={c.key} className="px-4 py-2 text-left font-mono">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {configs.map(c => (
                <tr key={c.id} className="border-b border-[#1e2330] hover:bg-[#1a1f2e] group">
                  <td className="px-4 py-2 text-[#e2e8f0] font-semibold font-mono whitespace-nowrap">{nameOf(c)}</td>
                  {COLS.map(col => {
                    const v = c[col.key] as string | null
                    return (
                      <td key={col.key} className="px-4 py-2">
                        {v ? (
                          <div className="flex items-center gap-1.5 max-w-[240px]">
                            <span className="font-mono text-[10px] text-[#a0aec0] truncate" title={v}>{v}</span>
                            <CopyButton value={v} />
                          </div>
                        ) : <span className="text-[#2d3748]">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

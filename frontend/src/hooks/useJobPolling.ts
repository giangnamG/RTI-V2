'use client'

import { useEffect, useRef, useState } from 'react'
import { Job, jobApi } from '@/lib/api'

/**
 * Quản lý vòng đời một job scan: restore từ server khi mount,
 * poll mỗi intervalMs ms, gọi onCompleted() khi job xong.
 *
 * Sử dụng:
 *   const { activeJob, setActiveJob } = useJobPolling(wsid, 'SCAN_PORT', loadPorts)
 *
 * - Khi user navigate đi rồi quay lại, hook tự fetch lại job đang running/pending
 *   → banner và polling được restore mà không cần thêm code ở page.
 * - onCompleted KHÔNG cần wrap bằng useCallback — hook tự ổn định qua ref.
 */
export function useJobPolling(
  wsid: string,
  jobType: string,
  onCompleted: () => Promise<void>,
  intervalMs = 3000,
) {
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompletedRef = useRef(onCompleted)

  // Giữ ref luôn trỏ đến phiên bản mới nhất của callback
  useEffect(() => { onCompletedRef.current = onCompleted }, [onCompleted])

  // Restore job đang chạy khi component mount (navigate đi rồi quay lại)
  useEffect(() => {
    jobApi.list(wsid)
      .then(jobs => {
        const active = jobs.find(j =>
          j.job_type === jobType &&
          (j.status === 'running' || j.status === 'pending')
        )
        if (active) setActiveJob(active)
      })
      .catch(console.error)
  }, [wsid, jobType])

  // Poll khi có activeJob đang pending/running
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return

    pollRef.current = setInterval(async () => {
      try {
        const updated = await jobApi.get(wsid, activeJob.id)
        setActiveJob(updated)
        if (updated.status === 'completed') {
          clearInterval(pollRef.current!)
          await onCompletedRef.current()
        } else if (updated.status === 'failed') {
          clearInterval(pollRef.current!)
        }
      } catch {}
    }, intervalMs)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob?.id, activeJob?.status, wsid, intervalMs])

  return { activeJob, setActiveJob }
}

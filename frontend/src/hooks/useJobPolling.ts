'use client'

import { useEffect, useRef, useState } from 'react'
import { Job, jobApi } from '@/lib/api'

/** Định dạng giây → "HH:MM:SS". */
function fmtHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return [hh, mm, ss].map(n => String(n).padStart(2, '0')).join(':')
}

/** Thời gian chạy job (started_at → finished_at nếu xong, ngược lại → hiện tại). */
function elapsedOf(job: Job | null): string {
  if (!job?.started_at) return '00:00:00'
  const start = new Date(job.started_at).getTime()
  const end = (job.status === 'completed' || job.status === 'failed') && job.finished_at
    ? new Date(job.finished_at).getTime()
    : Date.now()
  return fmtHMS((end - start) / 1000)
}

interface JobPollingOpts {
  /** Gọi mỗi lần poll (mỗi intervalMs) — dùng để refresh kết quả realtime trong khi job chạy. */
  onProgress?: (job: Job) => void
  /** Lọc job khi restore-on-mount (vd khớp theo payload.domains cho module Vuln). */
  matchJob?: (job: Job) => boolean
}

/**
 * Cơ chế polling CHUNG cho mọi background job (recon, fuzzing, vuln...).
 * - Poll `GET /jobs/:id` mỗi intervalMs (mặc định 3000ms).
 * - Restore job đang running/pending khi mount (navigate đi rồi quay lại).
 * - Đo elapsed dạng HH:MM:SS (re-render mỗi 1s khi đang chạy).
 * - onCompleted() khi job xong; onProgress() mỗi lần poll.
 *
 *   const { activeJob, setActiveJob, elapsed } = useJobPolling(wsid, 'SCAN_PORT', loadData)
 */
export function useJobPolling(
  wsid: string,
  jobType: string,
  onCompleted: () => void | Promise<void>,
  intervalMs = 3000,
  opts?: JobPollingOpts,
) {
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [, setTick] = useState(0)   // ép re-render mỗi 1s để cập nhật elapsed

  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompletedRef = useRef(onCompleted)
  const onProgressRef  = useRef(opts?.onProgress)
  const matchRef       = useRef(opts?.matchJob)

  // Giữ ref trỏ tới phiên bản mới nhất của callback
  useEffect(() => { onCompletedRef.current = onCompleted }, [onCompleted])
  useEffect(() => { onProgressRef.current = opts?.onProgress }, [opts?.onProgress])
  useEffect(() => { matchRef.current = opts?.matchJob }, [opts?.matchJob])

  // Restore job đang chạy khi mount
  useEffect(() => {
    jobApi.list(wsid)
      .then(jobs => {
        const active = jobs.find(j =>
          j.job_type === jobType &&
          (j.status === 'running' || j.status === 'pending') &&
          (matchRef.current ? matchRef.current(j) : true)
        )
        if (active) setActiveJob(active)
      })
      .catch(console.error)
  }, [wsid, jobType])

  // Poll khi có activeJob pending/running
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return

    pollRef.current = setInterval(async () => {
      try {
        const updated = await jobApi.get(wsid, activeJob.id)
        setActiveJob(updated)
        onProgressRef.current?.(updated)
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

  // Tick 1s để elapsed cập nhật khi đang chạy
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [activeJob?.id, activeJob?.status])

  return { activeJob, setActiveJob, elapsed: elapsedOf(activeJob) }
}

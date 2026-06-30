"""Scan pool DÙNG CHUNG — ngân sách tổng số scan (target × url) chạy đồng thời trong 1 worker.

Triết lý: TÁCH điều phối khỏi thực thi.
- Job pool (dispatcher) = bao nhiêu JOB điều phối song song (tầng "tool").
- Scan pool (file này)   = bao nhiêu SCAN thực thi song song (tầng "target × url"), dùng chung mọi job.

Tách 2 pool để tránh DEADLOCK (job thread chờ scan task không chiếm slot của scan pool) và để
TỔNG subprocess scan luôn ≤ SCAN_CONCURRENCY dù có bao nhiêu job/target/url (không nhân bội).

An toàn vì: worker stateless, DB connection mở per-call, findings append-only (xem dispatcher).
"""
import concurrent.futures
import logging

from . import config

logger = logging.getLogger("concurrency")

# 1 pool process-wide. import-time tạo 1 lần, mọi job share.
_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=config.SCAN_CONCURRENCY, thread_name_prefix="scan"
)


def run_tasks(items, fn):
    """Chạy fn(item) SONG SONG cho mỗi item qua scan pool dùng chung (bounded = SCAN_CONCURRENCY).

    - Trả list kết quả theo ĐÚNG thứ tự items.
    - 1 item lỗi → kết quả None (cô lập, KHÔNG kéo sập cả mẻ).
    - KHÔNG được gọi từ chính scan thread (tránh nested-submit deadlock); chỉ gọi từ job thread.
    """
    if not items:
        return []
    futures = [_pool.submit(fn, item) for item in items]
    results = []
    for i, fut in enumerate(futures):
        try:
            results.append(fut.result())
        except Exception as exc:
            logger.error(f"scan task #{i} lỗi: {exc}")
            results.append(None)
    return results

import concurrent.futures
import json
import logging
import signal
import threading
import time

import redis as redis_lib

from . import config, db
from .base_handler import BaseJobHandler

logger = logging.getLogger("dispatcher")


class Dispatcher:
    """
    Đọc job từ Redis Streams, route đến đúng handler theo job_type.
    Xử lý ĐỒNG THỜI tối đa MAX_CONCURRENT_JOBS job qua thread pool (vd WPScan + WPProbe
    chạy song song). get_connection() mở connection per-call nên thread-safe; redis-py thread-safe.
    """

    def __init__(self):
        self._handlers: dict[str, BaseJobHandler] = {}
        self._running = True
        self._rdb = self._connect_redis()
        self._ensure_consumer_group()
        self._pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=config.MAX_CONCURRENT_JOBS, thread_name_prefix="job"
        )
        # Giới hạn số job in-flight = số slot pool → backpressure khi đọc stream
        self._sem = threading.Semaphore(config.MAX_CONCURRENT_JOBS)

    # ── Setup ──────────────────────────────────────────────

    def _connect_redis(self) -> redis_lib.Redis:
        rdb = redis_lib.from_url(config.REDIS_URL, decode_responses=True)
        rdb.ping()
        logger.info("✓ Kết nối Redis thành công")
        return rdb

    def _ensure_consumer_group(self):
        try:
            self._rdb.xgroup_create(
                config.STREAM_NAME, config.CONSUMER_GROUP, id="0", mkstream=True
            )
            logger.info(f"Tạo consumer group '{config.CONSUMER_GROUP}'")
        except redis_lib.exceptions.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    def register(self, handler: BaseJobHandler):
        for jt in handler.job_types():
            self._handlers[jt] = handler
            logger.info(f"  ↳ {jt} → {handler.__class__.__name__}")

    # ── Reclaim pending ────────────────────────────────────

    def _reclaim_pending(self):
        """Claim lại pending messages từ consumer chết (vd: sau khi worker restart)."""
        try:
            result = self._rdb.xautoclaim(
                config.STREAM_NAME,
                config.CONSUMER_GROUP,
                config.WORKER_ID,
                min_idle_time=60_000,   # 60 giây idle = consumer cũ chắc chắn chết
                start_id="0-0",
                count=100,
            )
            messages = result[1] if result and len(result) > 1 else []
            if messages:
                logger.info(f"Reclaim {len(messages)} pending messages từ consumer chết")
                # Submit vào pool (KHÔNG chạy đồng bộ) → không block startup nếu job reclaim chạy lâu
                for msg_id, data in messages:
                    self._sem.acquire()
                    self._pool.submit(self._process_and_release, msg_id, data)
        except Exception as exc:
            logger.warning(f"xautoclaim không khả dụng, bỏ qua reclaim: {exc}")

    # ── Main loop ──────────────────────────────────────────

    def run(self):
        signal.signal(signal.SIGINT,  self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)

        logger.info(
            f"Dispatcher '{config.WORKER_ID}' started, lắng nghe '{config.STREAM_NAME}' "
            f"(đồng thời tối đa {config.MAX_CONCURRENT_JOBS} job)"
        )
        self._reclaim_pending()

        while self._running:
            try:
                messages = self._rdb.xreadgroup(
                    groupname=config.CONSUMER_GROUP,
                    consumername=config.WORKER_ID,
                    streams={config.STREAM_NAME: ">"},
                    count=1,
                    block=5000,
                )
            except redis_lib.exceptions.ConnectionError:
                logger.warning("Redis mất kết nối, thử lại sau 3s...")
                time.sleep(3)
                self._rdb = self._connect_redis()
                continue

            if not messages:
                continue

            for _stream, entries in messages:
                for msg_id, data in entries:
                    # Chặn đọc thêm khi đã đủ job in-flight (backpressure)
                    self._sem.acquire()
                    self._pool.submit(self._process_and_release, msg_id, data)

        self._pool.shutdown(wait=False)

    def _process_and_release(self, msg_id: str, data: dict):
        try:
            self._process(msg_id, data)
        finally:
            self._sem.release()

    def _process(self, msg_id: str, data: dict):
        job_id   = data.get("job_id", "")
        job_type = data.get("job_type", "")

        status = db.get_job_status(job_id) if job_id else None

        # Skip job đã kết thúc (vd message mồ côi của job đã failed/cancelled bị reclaim lại)
        # → ACK + bỏ qua, KHÔNG chạy lại scan (tránh poison message chạy vô hạn mỗi lần restart).
        if status in ("completed", "failed", "cancelled"):
            logger.info(f"[{job_type}] job_id={job_id} đã kết thúc → ACK, bỏ qua (không chạy lại)")
            self._ack(msg_id)
            return

        # Job đang 'running' khi message được reclaim = worker trước đã set running rồi CHẾT
        # (OOM/crash) giữa chừng. Job worker KHÔNG checkpoint được → chạy lại thường re-crash
        # (crash loop). → đánh dấu failed + ACK, KHÔNG chạy lại; UI phản ánh đúng.
        # (Giả định 1 worker/consumer; multi-worker sẽ cần heartbeat + ownership để phân biệt.)
        if status == "running":
            logger.warning(
                f"[{job_type}] job_id={job_id} orphaned (running khi reclaim) "
                f"→ đánh dấu failed, KHÔNG chạy lại"
            )
            db.update_job_status(
                job_id, "failed",
                error="worker chết giữa chừng (OOM/crash) — job không được resume",
            )
            self._ack(msg_id)
            return

        try:
            payload = json.loads(data.get("payload", "{}"))
        except json.JSONDecodeError:
            payload = {}

        handler = self._handlers.get(job_type)
        if handler is None:
            # Job type không có handler → ACK ngay để không block stream
            logger.debug(f"Không có handler cho job_type='{job_type}', bỏ qua")
            self._ack(msg_id)
            return

        logger.info(f"[{job_type}] job_id={job_id} bắt đầu xử lý")
        db.update_job_status(job_id, "running")

        try:
            result = handler.handle(job_id, job_type, payload)
            db.update_job_status(job_id, "completed", result=result)
            self._ack(msg_id)
            logger.info(f"[{job_type}] job_id={job_id} hoàn thành")
        except Exception as exc:
            db.update_job_status(job_id, "failed", error=str(exc))
            self._ack(msg_id)
            logger.error(f"[{job_type}] job_id={job_id} thất bại: {exc}")

    def _ack(self, msg_id: str):
        self._rdb.xack(config.STREAM_NAME, config.CONSUMER_GROUP, msg_id)

    def _shutdown(self, *_):
        logger.info("Shutting down dispatcher...")
        self._running = False

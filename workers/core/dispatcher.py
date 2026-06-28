import json
import logging
import signal
import time

import redis as redis_lib

from . import config, db
from .base_handler import BaseJobHandler

logger = logging.getLogger("dispatcher")


class Dispatcher:
    """
    Đọc job từ Redis Streams, route đến đúng handler theo job_type.
    """

    def __init__(self):
        self._handlers: dict[str, BaseJobHandler] = {}
        self._running = True
        self._rdb = self._connect_redis()
        self._ensure_consumer_group()

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
                for msg_id, data in messages:
                    self._process(msg_id, data)
        except Exception as exc:
            logger.warning(f"xautoclaim không khả dụng, bỏ qua reclaim: {exc}")

    # ── Main loop ──────────────────────────────────────────

    def run(self):
        signal.signal(signal.SIGINT,  self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)

        logger.info(f"Dispatcher '{config.WORKER_ID}' started, lắng nghe '{config.STREAM_NAME}'")
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
                    self._process(msg_id, data)

    def _process(self, msg_id: str, data: dict):
        job_id   = data.get("job_id", "")
        job_type = data.get("job_type", "")
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

import os

REDIS_URL    = os.environ.get("REDIS_URL",    "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://rti:rti@localhost:5432/rti_v2")

STREAM_NAME   = "rti:jobs"
CONSUMER_GROUP = "workers"

# Tên consumer — mỗi container có thể override qua env
WORKER_ID = os.environ.get("WORKER_ID", "worker-1")

# Số JOB điều phối đồng thời (vd WPScan job ∥ WPProbe job). Tầng "tool".
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "4"))

# NGÂN SÁCH scan đồng thời (tổng số target/url quét cùng lúc trong 1 worker, dùng chung mọi job).
# Tầng "target × url". Tách khỏi job pool để tránh deadlock + giới hạn tổng subprocess (không nhân bội).
SCAN_CONCURRENCY = int(os.environ.get("SCAN_CONCURRENCY", "8"))

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

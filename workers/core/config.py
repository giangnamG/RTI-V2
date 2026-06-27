import os

REDIS_URL    = os.environ.get("REDIS_URL",    "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://rti:rti@localhost:5432/rti_v2")

STREAM_NAME   = "rti:jobs"
CONSUMER_GROUP = "workers"

# Tên consumer — mỗi container có thể override qua env
WORKER_ID = os.environ.get("WORKER_ID", "worker-1")

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

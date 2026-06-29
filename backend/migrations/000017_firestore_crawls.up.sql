-- ── Firestore crawl (full document dump) ──────────────────────
-- Append-only: mỗi lần crawl append rows mới, gắn job_id (xem rules/data-model.md R7).
-- Postgres CHỈ giữ METADATA + con trỏ tới file; raw data (full document) nằm ở FILE JSON
-- trên volume worker_data (/data/firestore_crawl/...). Bảng hiển thị run mới nhất per target.

-- 1 row = 1 collection của 1 lần crawl (1 job) cho 1 target.
CREATE TABLE IF NOT EXISTS firestore_crawls (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id     UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id        UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    project_id    TEXT        NOT NULL,
    collection    TEXT        NOT NULL,
    doc_count     INTEGER     NOT NULL DEFAULT 0,
    byte_size     BIGINT      NOT NULL DEFAULT 0,
    file_path     TEXT        NOT NULL,   -- path TƯƠNG ĐỐI dưới FIRESTORE_CRAWL_DIR: {ws}/{target}/{job}/{collection}.json
    status        TEXT        NOT NULL DEFAULT 'ok',   -- ok | partial | error
    error         TEXT,
    truncated     BOOLEAN     NOT NULL DEFAULT FALSE,  -- true = chạm cap doc/collection, chưa lấy hết
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_firestore_crawls_ws  ON firestore_crawls(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firestore_crawls_job ON firestore_crawls(job_id);

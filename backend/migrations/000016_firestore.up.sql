-- ── Firestore enumeration (OpenFirebase) ──────────────────────
-- Append-only: mỗi lần scan/fuzz append rows mới, gắn job_id (xem rules/data-model.md).
-- Bảng chính hiển thị run mới nhất (latest job_id), lịch sử qua job_id.

-- Collections có dữ liệu (từ --read-firestore + --fuzz-collections)
CREATE TABLE IF NOT EXISTS firestore_collections (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id     UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id        UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    project_id    TEXT        NOT NULL,
    api_key       TEXT,
    collection    TEXT        NOT NULL,
    url           TEXT,
    doc_count     INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_firestore_collections_ws  ON firestore_collections(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firestore_collections_job ON firestore_collections(job_id);

-- Documents tool tìm được (parse từ response_content của firestore read)
CREATE TABLE IF NOT EXISTS firestore_documents (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id     UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id        UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    project_id    TEXT        NOT NULL,
    api_key       TEXT,
    collection    TEXT,
    doc_path      TEXT        NOT NULL,   -- projects/<pid>/databases/(default)/documents/<col>/<docId>
    url           TEXT,                   -- full Firestore REST URL tới document
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_firestore_documents_ws  ON firestore_documents(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_firestore_documents_job ON firestore_documents(job_id);

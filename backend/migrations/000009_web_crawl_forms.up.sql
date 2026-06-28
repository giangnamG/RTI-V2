-- ============================================================
-- WEB CRAWL FORMS (migration 000009)
-- Thêm job types mới vào enum (IF NOT EXISTS để idempotent)
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'RECON_WEB_CRAWL';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'RECON_ENDPOINT_NORMALIZE';

--
-- Raw forms được extract bởi katana — append-only
-- ============================================================

CREATE TABLE IF NOT EXISTS web_crawl_forms (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    base_url     TEXT NOT NULL,         -- seed URL (host:port gốc)
    source_url   TEXT NOT NULL,         -- page chứa form này
    action_url   TEXT NOT NULL,         -- form action đã resolve thành full URI
    method       VARCHAR(10) NOT NULL DEFAULT 'POST',
    enctype      VARCHAR(100),          -- application/x-www-form-urlencoded | multipart/form-data | application/json
    fields       JSONB NOT NULL DEFAULT '[]',
    -- fields schema: [{name, type, value, required, dynamic}]
    -- dynamic=true: field này cần fetch lại mỗi lần gửi (CSRF token, nonce...)
    has_csrf     BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_crawl_forms_workspace
    ON web_crawl_forms(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_crawl_forms_job
    ON web_crawl_forms(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_crawl_forms_action
    ON web_crawl_forms(workspace_id, action_url, created_at DESC);

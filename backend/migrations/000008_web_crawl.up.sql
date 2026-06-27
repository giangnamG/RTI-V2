-- ============================================================
-- WEB CRAWL URLS (migration 000008)
-- Kết quả crawl từ katana — append-only
-- Mỗi RECON_WEB_CRAWL job = nhiều rows mới
-- ============================================================

CREATE TABLE IF NOT EXISTS web_crawl_urls (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    base_url     TEXT NOT NULL,      -- seed URL (từ web_probes.url)
    url          TEXT NOT NULL,      -- URL tìm được
    method       VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code  INTEGER,
    content_type VARCHAR(255),
    source_tag   VARCHAR(50),        -- a | script | form | link | iframe | ...
    source_attr  VARCHAR(50),        -- href | src | action | ...
    source_url   TEXT,               -- page chứa link này (katana request.source)
    depth        INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho query theo workspace (list tất cả URLs mới nhất)
CREATE INDEX IF NOT EXISTS idx_web_crawl_workspace
    ON web_crawl_urls(workspace_id, created_at DESC);

-- Index cho DISTINCT ON (url) query
CREATE INDEX IF NOT EXISTS idx_web_crawl_url_latest
    ON web_crawl_urls(workspace_id, url, created_at DESC);

-- Index cho filter theo base_url
CREATE INDEX IF NOT EXISTS idx_web_crawl_base_url
    ON web_crawl_urls(workspace_id, base_url, created_at DESC);

-- Index cho history theo job
CREATE INDEX IF NOT EXISTS idx_web_crawl_job
    ON web_crawl_urls(job_id, created_at DESC);

-- ============================================================
-- FUZZ ENDPOINTS (migration 000010)
-- Normalized endpoints sau bước RECON_ENDPOINT_NORMALIZE
-- Gộp GET (từ web_crawl_urls) và POST (từ web_crawl_forms)
-- ============================================================

CREATE TABLE IF NOT EXISTS fuzz_endpoints (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,  -- normalize job
    url          TEXT NOT NULL,          -- full URL (scheme://host:port/path)
    method       VARCHAR(10) NOT NULL,   -- GET | POST
    content_type VARCHAR(100),           -- chỉ có với POST
    params       JSONB NOT NULL DEFAULT '[]',
    -- GET params schema:  [{name, value, source}]
    --   source: "query_string" | "path_param"
    -- POST params schema: [{name, type, value, dynamic, source}]
    --   source: "form_html" | "js_fetch"
    has_csrf     BOOLEAN NOT NULL DEFAULT false,
    source_url   TEXT,                   -- page nguồn (để trace)
    source_type  VARCHAR(20) NOT NULL,   -- "crawl_url" | "crawl_form"
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuzz_endpoints_workspace
    ON fuzz_endpoints(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuzz_endpoints_method
    ON fuzz_endpoints(workspace_id, method, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuzz_endpoints_url
    ON fuzz_endpoints(workspace_id, url, created_at DESC);

-- ── Thêm job types mới cho Vulnerability Scan ──────────────
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_DISPATCH';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_COMMON';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_CMS';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_SOFTWARE';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_CLOUD';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_DISCOVERY';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_NETWORK_SERVICE';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VULN_WEB_PARAMS';

-- ── Bổ sung findings: source_tool + source_domain ──────────
ALTER TABLE findings
    ADD COLUMN IF NOT EXISTS source_tool   TEXT,
    ADD COLUMN IF NOT EXISTS source_domain TEXT;
    -- source_tool:   'nuclei' | 'wpscan' | 'sqlmap' | 'dalfox' | ...
    -- source_domain: 'common' | 'cms' | 'software' | 'cloud' |
    --                'discovery' | 'network_service' | 'web_params'

CREATE INDEX IF NOT EXISTS idx_findings_source_domain
    ON findings(workspace_id, source_domain)
    WHERE source_domain IS NOT NULL;

-- ── vuln_scan_runs — track từng tool đã chạy ────────────────
-- Mỗi row = 1 lần chạy 1 tool trên 1 target URL/host
CREATE TABLE IF NOT EXISTS vuln_scan_runs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id      UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id         UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    domain         TEXT        NOT NULL,
    -- common | cms | software | cloud | discovery | network_service | web_params
    tool           TEXT        NOT NULL,
    -- nuclei | wpscan | joomscan | sqlmap | dalfox | testssl | nikto | ...
    target_url     TEXT,
    -- URL hoặc host:port tuỳ theo domain
    status         TEXT        NOT NULL DEFAULT 'pending',
    -- pending | running | completed | failed | skipped
    skip_reason    TEXT,
    -- not_installed | not_applicable | error
    findings_count INTEGER     NOT NULL DEFAULT 0,
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vuln_scan_runs_workspace
    ON vuln_scan_runs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vuln_scan_runs_job
    ON vuln_scan_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_vuln_scan_runs_domain
    ON vuln_scan_runs(workspace_id, domain);

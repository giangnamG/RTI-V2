-- ── Bảng riêng cho kết quả Nuclei scan ─────────────────────
-- Lưu đầy đủ extracted_results (JSONB), template_id, matcher_name
-- thay vì gộp chung vào bảng findings.

CREATE TABLE IF NOT EXISTS findings_nuclei (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id        UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id           UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    template_id      TEXT,
    matcher_name     TEXT,
    title            TEXT        NOT NULL,
    severity         TEXT        NOT NULL DEFAULT 'info',
    type             TEXT        NOT NULL DEFAULT 'vulnerability',
    status           TEXT        NOT NULL DEFAULT 'open',
    protocol         TEXT,
    host             TEXT,
    url              TEXT,
    port             INTEGER,
    extracted_results JSONB      NOT NULL DEFAULT '[]',
    cve_id           TEXT,
    cvss_score       NUMERIC(5,2),
    evidence         TEXT,
    remediation      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_nuclei_workspace
    ON findings_nuclei(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_nuclei_severity
    ON findings_nuclei(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_nuclei_job
    ON findings_nuclei(job_id);

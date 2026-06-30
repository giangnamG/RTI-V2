-- ── Bảng riêng cho kết quả WPScan + WPProbe (dedicated, append-only) ──
-- Mỗi tool 1 bảng vì output khác shape `findings` chung (component/plugin/version,
-- refs/raw JSONB). Theo tiền lệ findings_nuclei (migration 000015).
-- Append-only: mỗi lần scan = rows mới gắn job_id + created_at; bảng chính hiện run mới nhất
-- (rules/data-model.md R6), lịch sử qua endpoint /history.

CREATE TABLE IF NOT EXISTS wpscan_finding (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id         UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id            UUID REFERENCES jobs(id)    ON DELETE SET NULL,
    host              TEXT,
    url               TEXT,
    port              INTEGER,
    scheme            TEXT,
    component         TEXT,          -- core | plugin | theme | interesting
    component_name    TEXT,          -- slug (vd 'contact-form-7') hoặc 'WordPress'
    component_version TEXT,
    fixed_in          TEXT,
    title             TEXT NOT NULL,
    severity          TEXT NOT NULL DEFAULT 'info',
    type              TEXT NOT NULL DEFAULT 'vulnerability',
    status            TEXT NOT NULL DEFAULT 'open',
    cve_id            TEXT,
    cvss_score        NUMERIC(5,2),
    refs              JSONB NOT NULL DEFAULT '{}',   -- references (cve/url/wpvulndb)
    evidence          TEXT,
    remediation       TEXT,
    raw               JSONB NOT NULL DEFAULT '{}',   -- bản ghi gốc của tool
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wpscan_finding_workspace ON wpscan_finding(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpscan_finding_severity  ON wpscan_finding(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_wpscan_finding_job       ON wpscan_finding(job_id);
CREATE INDEX IF NOT EXISTS idx_wpscan_finding_target    ON wpscan_finding(workspace_id, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wpprobe_finding (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id         UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id            UUID REFERENCES jobs(id)    ON DELETE SET NULL,
    host              TEXT,
    url               TEXT,
    port              INTEGER,
    component         TEXT,          -- plugin | theme
    plugin            TEXT,          -- slug
    version           TEXT,
    confidence        TEXT,
    title             TEXT NOT NULL,
    severity          TEXT NOT NULL DEFAULT 'info',
    type              TEXT NOT NULL DEFAULT 'vulnerability',
    status            TEXT NOT NULL DEFAULT 'open',
    cve_id            TEXT,
    cvss_score        NUMERIC(5,2),
    cvss_vector       TEXT,
    auth_type         TEXT,          -- Unauth | Auth | ...
    refs              JSONB NOT NULL DEFAULT '{}',
    raw               JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wpprobe_finding_workspace ON wpprobe_finding(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpprobe_finding_severity  ON wpprobe_finding(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_wpprobe_finding_job       ON wpprobe_finding(job_id);
CREATE INDEX IF NOT EXISTS idx_wpprobe_finding_target    ON wpprobe_finding(workspace_id, target_id, created_at DESC);

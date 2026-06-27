CREATE TABLE IF NOT EXISTS findings (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id       UUID          REFERENCES targets(id) ON DELETE SET NULL,
    job_id          UUID          REFERENCES jobs(id)    ON DELETE SET NULL,
    title           VARCHAR(500)  NOT NULL,
    severity        VARCHAR(20)   NOT NULL DEFAULT 'medium',
    type            VARCHAR(50)   NOT NULL DEFAULT 'vulnerability',
    status          VARCHAR(20)   NOT NULL DEFAULT 'open',
    cve_id          VARCHAR(30),
    cvss_score      NUMERIC(4,1),
    host            VARCHAR(255),
    url             TEXT,
    port            INTEGER,
    evidence        TEXT,
    source          VARCHAR(100),
    remediation     TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- severity: critical / high / medium / low / info
-- type: vulnerability / misconfiguration / exposure / credential / informational
-- status: open / confirmed / false_positive / fixed

CREATE INDEX IF NOT EXISTS idx_findings_workspace ON findings(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_severity  ON findings(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_status    ON findings(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_cve       ON findings(cve_id) WHERE cve_id IS NOT NULL;

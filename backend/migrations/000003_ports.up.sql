CREATE TABLE IF NOT EXISTS ports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id)  ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id)     ON DELETE SET NULL,
    host         VARCHAR(255) NOT NULL,
    ip_address   VARCHAR(45),
    port         INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    protocol     VARCHAR(10)  NOT NULL DEFAULT 'tcp',
    state        VARCHAR(20)  NOT NULL DEFAULT 'open',
    service_name VARCHAR(100),
    banner       TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, host, port, protocol)
);

CREATE INDEX IF NOT EXISTS idx_ports_workspace_id   ON ports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ports_workspace_host  ON ports(workspace_id, host);

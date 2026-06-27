CREATE TABLE IF NOT EXISTS web_probes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id      UUID         REFERENCES targets(id) ON DELETE SET NULL,
    job_id         UUID         REFERENCES jobs(id)    ON DELETE SET NULL,
    host           VARCHAR(255) NOT NULL,
    port           INTEGER      NOT NULL,
    url            TEXT         NOT NULL,
    scheme         VARCHAR(10),
    status_code    INTEGER,
    title          TEXT,
    web_server     TEXT,
    technologies   TEXT[]       NOT NULL DEFAULT '{}',
    content_type   TEXT,
    content_length BIGINT,
    response_time  VARCHAR(30),
    ip_address     VARCHAR(45),
    is_alive       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_probes_workspace ON web_probes(workspace_id, host, port, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_probes_job       ON web_probes(job_id);
CREATE INDEX IF NOT EXISTS idx_web_probes_host      ON web_probes(workspace_id, host);

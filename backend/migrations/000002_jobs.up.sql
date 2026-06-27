CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TYPE job_type AS ENUM (
    'RECON_SUBDOMAIN',
    'SCAN_PORT',
    'SCAN_SERVICE',
    'SCAN_WEB_INFO',
    'SCAN_CVE',
    'FUZZ_DIR',
    'FUZZ_FILE',
    'FUZZ_VHOST',
    'FUZZ_PARAM',
    'FUZZ_BACKUP',
    'FUZZ_API',
    'PENTEST_WEB',
    'PENTEST_NETWORK'
);

CREATE TABLE jobs (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id     UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_type      job_type    NOT NULL,
    status        job_status  NOT NULL DEFAULT 'pending',
    payload       JSONB       NOT NULL DEFAULT '{}',
    result        JSONB       NOT NULL DEFAULT '{}',
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_workspace  ON jobs(workspace_id);
CREATE INDEX idx_jobs_status     ON jobs(status);
CREATE INDEX idx_jobs_type       ON jobs(job_type);

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Subdomain kết quả từ RECON_SUBDOMAIN
CREATE TABLE subdomains (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID        NOT NULL REFERENCES targets(id)    ON DELETE CASCADE,
    job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    domain       TEXT        NOT NULL,
    ip_addresses TEXT[]      NOT NULL DEFAULT '{}',
    sources      TEXT[]      NOT NULL DEFAULT '{}',
    is_alive     BOOLEAN,
    http_status  INT,
    title        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, domain)
);

CREATE INDEX idx_subdomains_workspace ON subdomains(workspace_id);
CREATE INDEX idx_subdomains_target    ON subdomains(target_id);

CREATE TRIGGER subdomains_updated_at
    BEFORE UPDATE ON subdomains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

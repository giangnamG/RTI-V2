# RTI - Database Schema

---

## PostgreSQL Schema

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- full-text search

-- ============================================================
-- ENUMS
-- ============================================================
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
CREATE TYPE severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
CREATE TYPE port_state AS ENUM ('open', 'closed', 'filtered');
CREATE TYPE port_protocol AS ENUM ('tcp', 'udp');
CREATE TYPE wordlist_category AS ENUM (
    'directories',
    'files',
    'parameters',
    'subdomains',
    'passwords',
    'usernames',
    'api_endpoints',
    'tech_specific',
    'custom'
);
CREATE TYPE fuzz_type AS ENUM ('dir', 'file', 'vhost', 'param', 'backup', 'api');

-- ============================================================
-- WORKSPACES
-- ============================================================
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    color       VARCHAR(7),               -- hex color cho UI
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TARGETS (domain chính của workspace)
-- ============================================================
CREATE TABLE targets (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    domain       VARCHAR(255) NOT NULL,
    ip_address   INET,
    notes        TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, domain)
);
CREATE INDEX idx_targets_workspace ON targets(workspace_id);

-- ============================================================
-- SUBDOMAINS
-- ============================================================
CREATE TABLE subdomains (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    subdomain    VARCHAR(255) NOT NULL,
    ip_address   INET,
    cname        VARCHAR(255),
    source       VARCHAR(100),             -- subfinder, amass, brute, etc.
    is_wildcard  BOOLEAN DEFAULT FALSE,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen    TIMESTAMPTZ,
    UNIQUE(workspace_id, subdomain)
);
CREATE INDEX idx_subdomains_workspace ON subdomains(workspace_id);
CREATE INDEX idx_subdomains_target ON subdomains(target_id);

-- ============================================================
-- HOSTS (domain + subdomain gộp lại, là host để scan port)
-- ============================================================
-- View để gộp targets + subdomains thành danh sách host duy nhất
CREATE VIEW hosts AS
    SELECT
        workspace_id,
        id AS source_id,
        'target' AS source_type,
        domain AS host,
        ip_address
    FROM targets
    UNION ALL
    SELECT
        workspace_id,
        id AS source_id,
        'subdomain' AS source_type,
        subdomain AS host,
        ip_address
    FROM subdomains;

-- ============================================================
-- PORTS
-- ============================================================
CREATE TABLE ports (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    host         VARCHAR(255) NOT NULL,   -- domain hoặc IP
    ip_address   INET,
    port         INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    protocol     port_protocol NOT NULL DEFAULT 'tcp',
    state        port_state NOT NULL DEFAULT 'open',
    banner       TEXT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen    TIMESTAMPTZ,
    UNIQUE(workspace_id, host, port, protocol)
);
CREATE INDEX idx_ports_workspace ON ports(workspace_id);
CREATE INDEX idx_ports_host ON ports(workspace_id, host);

-- ============================================================
-- SERVICES (service chạy trên 1 port)
-- ============================================================
CREATE TABLE services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    port_id         UUID NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    service_name    VARCHAR(100),          -- http, https, smb, ftp, ...
    service_type    VARCHAR(100),          -- wordpress, gitlab, laravel, mssql, ...
    version         VARCHAR(255),
    product         VARCHAR(255),
    extra_info      TEXT,
    os_type         VARCHAR(100),
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_services_port ON services(port_id);
CREATE INDEX idx_services_workspace ON services(workspace_id);
CREATE INDEX idx_services_type ON services(workspace_id, service_type);

-- ============================================================
-- WEB INFO (thông tin web cho HTTP/HTTPS service)
-- ============================================================
CREATE TABLE web_info (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    title           TEXT,
    status_code     INTEGER,
    content_length  INTEGER,
    content_type    VARCHAR(255),
    server          VARCHAR(255),
    technologies    TEXT[],               -- ['WordPress 6.4', 'PHP 8.1', 'Nginx 1.24']
    headers         JSONB,                -- raw response headers
    screenshot_path TEXT,                 -- path đến screenshot
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_web_info_service ON web_info(service_id);
CREATE INDEX idx_web_info_workspace ON web_info(workspace_id);

-- ============================================================
-- CVE / VULNERABILITIES
-- ============================================================
CREATE TABLE vulnerabilities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    service_id      UUID REFERENCES services(id) ON DELETE CASCADE,
    web_info_id     UUID REFERENCES web_info(id) ON DELETE CASCADE,
    cve_id          VARCHAR(50),           -- CVE-2024-XXXX hoặc nuclei template id
    name            VARCHAR(500) NOT NULL,
    severity        severity NOT NULL DEFAULT 'info',
    cvss_score      DECIMAL(3,1),
    description     TEXT,
    solution        TEXT,
    references      TEXT[],
    matcher_name    VARCHAR(255),          -- nuclei matcher
    extracted_results TEXT[],
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vuln_workspace ON vulnerabilities(workspace_id);
CREATE INDEX idx_vuln_severity ON vulnerabilities(workspace_id, severity);
CREATE INDEX idx_vuln_cve ON vulnerabilities(cve_id);

-- ============================================================
-- PENTEST FINDINGS (kết quả từ pentest modules)
-- ============================================================
CREATE TABLE findings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
    module          VARCHAR(100) NOT NULL,  -- 'wordpress', 'gitlab', 'smb', ...
    title           VARCHAR(500) NOT NULL,
    severity        severity NOT NULL DEFAULT 'info',
    description     TEXT,
    proof           TEXT,                   -- PoC, screenshot path, request/response
    remediation     TEXT,
    tags            TEXT[],
    is_false_positive BOOLEAN DEFAULT FALSE,
    verified        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_findings_workspace ON findings(workspace_id);
CREATE INDEX idx_findings_severity ON findings(workspace_id, severity);
CREATE INDEX idx_findings_module ON findings(workspace_id, module);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type            job_type NOT NULL,
    status          job_status NOT NULL DEFAULT 'pending',
    params          JSONB NOT NULL DEFAULT '{}',   -- input params
    result          JSONB,                          -- summary result
    error_message   TEXT,
    progress        INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    parent_job_id   UUID REFERENCES jobs(id)       -- cho nested jobs
);
CREATE INDEX idx_jobs_workspace ON jobs(workspace_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(workspace_id, type);

-- ============================================================
-- JOB LOGS
-- ============================================================
CREATE TABLE job_logs (
    id          BIGSERIAL PRIMARY KEY,
    job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level       VARCHAR(10) NOT NULL DEFAULT 'info',  -- info, warn, error
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_logs_job ON job_logs(job_id);

-- ============================================================
-- TRIGGERS: auto update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- WORDLISTS
-- ============================================================
CREATE TABLE wordlists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        wordlist_category NOT NULL,
    tags            TEXT[],
    file_path       TEXT NOT NULL,           -- đường dẫn tuyệt đối trên server
    line_count      INTEGER,
    file_size       BIGINT,                  -- bytes
    is_builtin      BOOLEAN NOT NULL DEFAULT FALSE,
    workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    -- NULL = wordlist global (dùng được ở mọi workspace)
    -- có giá trị = wordlist riêng của workspace đó
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, workspace_id)
);
CREATE INDEX idx_wordlists_category ON wordlists(category);
CREATE INDEX idx_wordlists_workspace ON wordlists(workspace_id);

-- ============================================================
-- FUZZ CONFIGS (tham số mỗi lần chạy fuzzing)
-- ============================================================
CREATE TABLE fuzz_configs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_url       TEXT NOT NULL,
    fuzz_type        fuzz_type NOT NULL,
    tool             VARCHAR(50) NOT NULL,   -- ffuf | feroxbuster | dirsearch | gobuster
    wordlist_ids     UUID[],                 -- danh sách wordlist đã dùng
    extensions       TEXT[],                 -- ['.php', '.bak', '.sql', '.env']
    threads          INTEGER NOT NULL DEFAULT 40,
    rate_limit       INTEGER,                -- req/giây, NULL = không giới hạn
    timeout          INTEGER NOT NULL DEFAULT 10,
    follow_redirects BOOLEAN NOT NULL DEFAULT FALSE,
    status_filter    INTEGER[],              -- chỉ giữ các status code này
    size_filter      INTEGER[],              -- loại bỏ content-length khớp
    recursive        BOOLEAN NOT NULL DEFAULT FALSE,
    extra_args       JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUZZ RESULTS (kết quả từng URL tìm được)
-- ============================================================
CREATE TABLE fuzz_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    fuzz_config_id  UUID NOT NULL REFERENCES fuzz_configs(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    method          VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code     INTEGER NOT NULL,
    content_length  INTEGER,
    content_type    VARCHAR(255),
    redirect_url    TEXT,
    words           INTEGER,
    lines           INTEGER,
    response_time   INTEGER,                 -- milliseconds
    is_interesting  BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,                    -- ghi chú thủ công
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fuzz_results_job        ON fuzz_results(job_id);
CREATE INDEX idx_fuzz_results_workspace  ON fuzz_results(workspace_id);
CREATE INDEX idx_fuzz_results_status     ON fuzz_results(workspace_id, status_code);
CREATE INDEX idx_fuzz_results_interesting ON fuzz_results(workspace_id, is_interesting)
    WHERE is_interesting = TRUE;
```

---

## Quan hệ dữ liệu

```
Workspace
  ├── Targets (1:N)
  ├── Subdomains (1:N)     ←── target_id (optional FK)
  ├── Ports (1:N)          ←── host (domain/subdomain/IP)
  │     └── Services (1:N)
  │           ├── WebInfo (1:1)
  │           └── Vulnerabilities (1:N)
  ├── Findings (1:N)       ←── service_id (optional FK)
  ├── Wordlists (1:N)      ←── workspace_id NULL = global
  └── Jobs (1:N)
        ├── JobLogs (1:N)
        └── FuzzConfigs (1:1)
              └── FuzzResults (1:N)
```

## Ghi chú thiết kế

- **Raw output**: cột `raw_output JSONB` trong bảng `job_logs` hoặc lưu trực tiếp trong `fuzz_results.notes`. Không dùng MongoDB — PostgreSQL JSONB đủ linh hoạt và hỗ trợ GIN index để query.
- **Wordlist global vs workspace**: `wordlist.workspace_id IS NULL` = global (built-in, tất cả workspace dùng được). Có giá trị = chỉ workspace đó thấy.
- **is_interesting**: auto-set bởi worker dựa trên status_code không phải 404 và content_length không khớp baseline.

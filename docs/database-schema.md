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
    'RECON_WEB_CRAWL',           -- migration 000008
    'RECON_ENDPOINT_NORMALIZE',  -- migration 000009
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
-- WEB PROBES (migration 000006 — kết quả httpx probe)
-- ============================================================
-- Append-only: mỗi lần SCAN_WEB_INFO = nhiều rows mới
-- DISTINCT ON (host, port) ORDER BY created_at DESC → trạng thái mới nhất
CREATE TABLE web_probes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id       UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
    host            VARCHAR(255) NOT NULL,
    port            INTEGER NOT NULL,
    url             TEXT NOT NULL,          -- URL cuối sau redirect (httpx "url" field)
    scheme          VARCHAR(10),            -- http | https
    status_code     INTEGER,
    title           TEXT,
    web_server      VARCHAR(255),
    technologies    TEXT[],                 -- ['WordPress 6.4', 'PHP 8.1', 'Nginx 1.24']
    content_type    VARCHAR(255),
    content_length  INTEGER,
    response_time   VARCHAR(50),
    ip_address      INET,
    is_alive        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Latest state per (host, port)
CREATE INDEX idx_web_probes_latest
    ON web_probes(workspace_id, host, port, created_at DESC);
-- History per host
CREATE INDEX idx_web_probes_history
    ON web_probes(workspace_id, host, created_at DESC);

-- ============================================================
-- WEB CRAWL URLs (migration 000008 — kết quả crawl của katana)
-- ============================================================
-- Append-only: mỗi RECON_WEB_CRAWL job = nhiều rows mới
CREATE TABLE web_crawl_urls (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    url          TEXT NOT NULL,
    base_url     TEXT NOT NULL,         -- seed URL gốc có cùng host:port
    method       VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code  INTEGER,
    content_type TEXT,
    source_tag   VARCHAR(50),           -- a, script, form, link, img, ...
    source_attr  VARCHAR(50),           -- href, src, action, ...
    source_url   TEXT,                  -- page chứa link này (null nếu là seed)
    depth        INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_web_crawl_urls_workspace ON web_crawl_urls(workspace_id, created_at DESC);
CREATE INDEX idx_web_crawl_urls_job       ON web_crawl_urls(job_id);

-- ============================================================
-- WEB CRAWL FORMS (migration 000009 — HTML forms extracted từ crawl)
-- ============================================================
-- Append-only. Được extract bởi WebCrawlWorker (katana -fx + BeautifulSoup)
CREATE TABLE web_crawl_forms (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    base_url     TEXT NOT NULL,
    source_url   TEXT NOT NULL,         -- page chứa form
    action_url   TEXT NOT NULL,         -- form action đã resolve thành full URI
    method       VARCHAR(10) NOT NULL DEFAULT 'POST',
    enctype      VARCHAR(100),          -- application/x-www-form-urlencoded | multipart/form-data
    fields       JSONB NOT NULL DEFAULT '[]',
    -- fields schema: [{name, type, value, required, dynamic}]
    -- dynamic=true: field cần fetch lại mỗi request (CSRF token, nonce...)
    has_csrf     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_web_crawl_forms_workspace ON web_crawl_forms(workspace_id, created_at DESC);
CREATE INDEX idx_web_crawl_forms_job       ON web_crawl_forms(job_id);

-- ============================================================
-- FUZZ ENDPOINTS (migration 000010 — normalized endpoints cho fuzzing)
-- ============================================================
-- Output của RECON_ENDPOINT_NORMALIZE. Append-only.
-- DISTINCT ON (url, method) ORDER BY created_at DESC → trạng thái mới nhất
CREATE TABLE fuzz_endpoints (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    url          TEXT NOT NULL,
    method       VARCHAR(10) NOT NULL DEFAULT 'GET',
    content_type TEXT,                  -- application/x-www-form-urlencoded | multipart/form-data | null
    params       JSONB NOT NULL DEFAULT '[]',
    -- params schema: [{name, type, value, source, dynamic, required}]
    -- source: "query_string" | "path_param" | "form_html"
    has_csrf     BOOLEAN NOT NULL DEFAULT FALSE,
    source_url   TEXT,                  -- page chứa link/form này
    source_type  VARCHAR(20) NOT NULL DEFAULT 'crawl_url',
    -- source_type: "crawl_url" (GET từ web_crawl_urls) | "crawl_form" (POST từ web_crawl_forms)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fuzz_endpoints_workspace ON fuzz_endpoints(workspace_id, created_at DESC);
CREATE INDEX idx_fuzz_endpoints_method    ON fuzz_endpoints(workspace_id, method);
CREATE INDEX idx_fuzz_endpoints_latest
    ON fuzz_endpoints(workspace_id, url, method, created_at DESC);

-- ============================================================
-- FUZZ PARAM RESULTS (migration 000011 — arjun output)
-- ============================================================
-- Output của FUZZ_PARAM job (ParamFuzzWorker dùng arjun).
-- Append-only: mỗi job = rows mới.
-- DISTINCT ON (url, method) ORDER BY created_at DESC → kết quả mới nhất.
CREATE TABLE fuzz_param_results (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    url          TEXT        NOT NULL,
    method       TEXT        NOT NULL DEFAULT 'GET',
    params       JSONB       NOT NULL DEFAULT '[]',
    -- params schema: ["param1", "param2", ...] — flat string array
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fuzz_param_results_workspace  ON fuzz_param_results(workspace_id);
CREATE INDEX idx_fuzz_param_results_target     ON fuzz_param_results(target_id);
CREATE INDEX idx_fuzz_param_results_url_method ON fuzz_param_results(url, method);

-- ============================================================
-- DIR FUZZ RESULTS (migration 000012 — ffuf output)
-- ============================================================
-- Output của FUZZ_DIR job (DirFuzzWorker dùng ffuf).
-- Append-only. Không DISTINCT — mỗi hit là 1 row riêng.
CREATE TABLE dir_fuzz_results (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id      UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id         UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    base_url       TEXT        NOT NULL,    -- origin của target (scheme://host)
    path           TEXT        NOT NULL,    -- đường dẫn tìm được (e.g. /admin)
    url            TEXT        NOT NULL,    -- full URL (base_url + path)
    status_code    INTEGER     NOT NULL DEFAULT 0,
    content_length INTEGER     NOT NULL DEFAULT 0,
    content_type   TEXT,
    words          INTEGER     NOT NULL DEFAULT 0,
    lines          INTEGER     NOT NULL DEFAULT 0,
    redirect_url   TEXT,
    is_interesting BOOLEAN     NOT NULL DEFAULT FALSE,
    -- is_interesting = status not in {404, 429} AND content_length > 200
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dir_fuzz_results_workspace   ON dir_fuzz_results(workspace_id);
CREATE INDEX idx_dir_fuzz_results_target      ON dir_fuzz_results(target_id);
CREATE INDEX idx_dir_fuzz_results_base_url    ON dir_fuzz_results(base_url);
CREATE INDEX idx_dir_fuzz_results_interesting ON dir_fuzz_results(workspace_id, is_interesting);

-- ============================================================
-- FINDINGS (migration 000007 — vulnerability tracker)
-- ============================================================
-- Mutable: mỗi finding là 1 record duy nhất, có thể UPDATE status/severity
-- CVE không phải entity riêng — chỉ là optional field trên finding
CREATE TABLE findings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id       UUID REFERENCES targets(id) ON DELETE SET NULL,
    job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
    title           VARCHAR(500) NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'medium',
    -- critical | high | medium | low | info
    type            VARCHAR(50) NOT NULL DEFAULT 'vulnerability',
    -- vulnerability | misconfiguration | exposure | credential | informational
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
    -- open | confirmed | false_positive | fixed
    cve_id          VARCHAR(30),            -- CVE-2024-XXXX (optional)
    cvss_score      NUMERIC(4,1),           -- 0.0 – 10.0 (optional)
    host            VARCHAR(255),
    url             TEXT,
    port            INTEGER,
    evidence        TEXT,                   -- PoC, request/response, payload
    source          VARCHAR(100),           -- nuclei | manual | wpscan | ...
    remediation     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_findings_workspace ON findings(workspace_id, created_at DESC);
CREATE INDEX idx_findings_severity  ON findings(workspace_id, severity);
CREATE INDEX idx_findings_status    ON findings(workspace_id, status);
CREATE INDEX idx_findings_cve       ON findings(cve_id) WHERE cve_id IS NOT NULL;

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
  ├── Subdomains (1:N)      ←── target_id (optional FK)              [append-only]
  ├── Ports (1:N)           ←── host (domain/subdomain/IP)           [append-only]
  ├── WebProbes (1:N)       ←── host + port                          [append-only]
  ├── WebCrawlUrls (1:N)    ←── RECON_WEB_CRAWL output               [append-only]
  ├── WebCrawlForms (1:N)   ←── HTML forms extracted during crawl    [append-only]
  ├── FuzzEndpoints (1:N)    ←── RECON_ENDPOINT_NORMALIZE output      [append-only]
  ├── FuzzParamResults (1:N) ←── FUZZ_PARAM output (arjun)           [append-only]
  ├── DirFuzzResults (1:N)   ←── FUZZ_DIR output (ffuf)              [append-only]
  ├── Findings (1:N)         ←── target_id (optional FK)             [mutable]
  ├── Wordlists (1:N)        ←── workspace_id NULL = global
  └── Jobs (1:N)
        ├── JobLogs (1:N)
        └── FuzzConfigs (1:1)
              └── FuzzResults (1:N)
```

## Append-only vs Mutable

| Bảng | Model | Lý do |
|------|-------|-------|
| `subdomains` | Append-only | Mỗi scan = snapshot mới. History tracking. |
| `ports` | Append-only | Mỗi port scan = snapshot mới. |
| `web_probes` | Append-only | Mỗi `SCAN_WEB_INFO` job = snapshot mới. |
| `web_crawl_urls` | Append-only | Mỗi `RECON_WEB_CRAWL` job = snapshot mới. |
| `web_crawl_forms` | Append-only | Forms extracted trong mỗi crawl job. |
| `fuzz_endpoints` | Append-only | Mỗi `RECON_ENDPOINT_NORMALIZE` job = snapshot mới. |
| `fuzz_param_results` | Append-only | Mỗi `FUZZ_PARAM` job = rows mới (arjun output). |
| `dir_fuzz_results` | Append-only | Mỗi `FUZZ_DIR` job = rows mới (ffuf output). |
| `findings` | Mutable | Finding cần UPDATE status (open → fixed → false_positive). |
| `jobs` | Mutable | Job cần UPDATE status (pending → running → completed). |

**DISTINCT ON** — pattern truy vấn trạng thái mới nhất từ bảng append-only:

```sql
-- Web probe mới nhất per (host, port)
SELECT DISTINCT ON (host, port) *
FROM web_probes
WHERE workspace_id = $1
ORDER BY host, port, created_at DESC
```

## Ghi chú thiết kế

- **Raw output**: lưu trực tiếp trong `job_logs` hoặc `fuzz_results.notes`. Không dùng MongoDB — PostgreSQL JSONB đủ linh hoạt.
- **Wordlist global vs workspace**: `wordlist.workspace_id IS NULL` = global (built-in, tất cả workspace dùng được). Có giá trị = chỉ workspace đó thấy.
- **is_interesting**: auto-set bởi worker dựa trên status_code không phải 404 và content_length không khớp baseline.
- **CVE trong Findings**: `cve_id` là optional field trên `findings`, không phải entity riêng. Tránh over-normalization khi CVE chỉ là metadata reference.
- **Service category**: bảng `ports` có cột `service_category` (web/mail/remote/database/other) để phân loại port scan kết quả phục vụ việc điều phối module tiếp theo.

-- Chuyển sang append-only history model:
-- Xóa UNIQUE constraints để cho phép mỗi scan tạo row mới độc lập.
-- UI dùng DISTINCT ON (latest per entity) để hiển thị trạng thái mới nhất.

ALTER TABLE subdomains DROP CONSTRAINT IF EXISTS subdomains_workspace_id_domain_key;
ALTER TABLE ports      DROP CONSTRAINT IF EXISTS ports_workspace_id_host_port_protocol_key;

-- Index cho DISTINCT ON query (latest per domain)
CREATE INDEX IF NOT EXISTS idx_subdomains_domain_latest
    ON subdomains(workspace_id, domain, created_at DESC);

-- Index cho DISTINCT ON query (latest per host+port+protocol)
CREATE INDEX IF NOT EXISTS idx_ports_host_port_latest
    ON ports(workspace_id, host, port, protocol, created_at DESC);

-- Index cho history query (tất cả records của một domain)
CREATE INDEX IF NOT EXISTS idx_subdomains_domain_history
    ON subdomains(workspace_id, domain);

-- Index cho history query (tất cả records của một host)
CREATE INDEX IF NOT EXISTS idx_ports_host_history
    ON ports(workspace_id, host);

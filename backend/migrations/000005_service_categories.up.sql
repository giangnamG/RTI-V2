-- Bảng quản lý service categories (global, không thuộc workspace nào)
CREATE TABLE IF NOT EXISTS service_categories (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(50)  UNIQUE NOT NULL,
    label         VARCHAR(100) NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    color         VARCHAR(7)   NOT NULL DEFAULT '#718096',
    service_names TEXT[]       NOT NULL DEFAULT '{}',
    module_types  TEXT[]       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Thêm service_category vào bảng ports
ALTER TABLE ports ADD COLUMN IF NOT EXISTS service_category VARCHAR(50);

-- Index để filter ports theo category
CREATE INDEX IF NOT EXISTS idx_ports_service_category ON ports(workspace_id, service_category);

-- Seed dữ liệu mặc định
INSERT INTO service_categories (name, label, description, color, service_names, module_types) VALUES
(
    'web',
    'Web Services',
    'HTTP/HTTPS web services và web applications',
    '#4299e1',
    ARRAY['http','https','http-alt','https-alt','http-proxy'],
    ARRAY['SCAN_WEB_INFO','FUZZ_DIR','FUZZ_API','FUZZ_VHOST','PENTEST_WEB']
),
(
    'remote',
    'Remote Access',
    'Remote access services: SSH, RDP, VNC, FTP, Telnet',
    '#b794f4',
    ARRAY['ssh','rdp','vnc','ftp','telnet','microsoft-rdp','winrm'],
    ARRAY['PENTEST_NETWORK']
),
(
    'database',
    'Database',
    'Database services: MySQL, PostgreSQL, MSSQL, Oracle, Redis, MongoDB, Elasticsearch',
    '#fc8181',
    ARRAY['mysql','postgresql','mssql','oracle','redis','mongodb','elasticsearch','mariadb','cassandra','couchdb','neo4j'],
    ARRAY['PENTEST_DATABASE']
),
(
    'mail',
    'Mail Services',
    'Email services: SMTP, IMAP, POP3',
    '#68d391',
    ARRAY['smtp','smtps','imap','imaps','pop3','pop3s'],
    ARRAY['PENTEST_MAIL']
),
(
    'other',
    'Other Services',
    'Các dịch vụ khác chưa được phân loại',
    '#718096',
    ARRAY['dns','smb','socks5','ldap','ldaps','snmp','nfs','rpcbind','kerberos'],
    ARRAY[]::TEXT[]
)
ON CONFLICT (name) DO NOTHING;

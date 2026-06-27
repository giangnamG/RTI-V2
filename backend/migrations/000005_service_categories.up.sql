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

-- Seed dữ liệu mặc định.
-- ON CONFLICT DO UPDATE: mỗi lần khởi chạy mới đều đảm bảo dữ liệu mặc định tồn tại
-- và được cập nhật lên phiên bản mới nhất.
INSERT INTO service_categories (name, label, description, color, service_names, module_types) VALUES
(
    'web',
    'Web Services',
    'HTTP/HTTPS services, web frameworks, CMS, web servers — detected by port scan or web probe',
    '#4299e1',
    ARRAY[
        -- HTTP protocols
        'http','https','http-alt','https-alt','http-proxy',
        'ssl/http','ssl/https','http-rpc-epmap',
        -- Web servers
        'apache','nginx','iis','tomcat','jetty','lighttpd','caddy','haproxy','traefik','gunicorn','uvicorn',
        -- CMS
        'wordpress','drupal','joomla','magento','typo3','prestashop','opencart','woocommerce',
        'ghost','strapi','directus','payload','contentful',
        -- PHP frameworks
        'laravel','symfony','codeigniter','yii','cakephp','lumen','slim',
        -- Python frameworks
        'django','flask','fastapi','tornado','bottle','pyramid','falcon',
        -- Node.js frameworks
        'express','nextjs','nuxtjs','nestjs','koa','hapi','fastify','remix','sveltekit',
        -- Java frameworks
        'spring','springboot','struts','jsf','quarkus','micronaut','play',
        -- Ruby frameworks
        'rails','sinatra','hanami',
        -- Go frameworks
        'gin','echo','fiber','beego','chi',
        -- .NET frameworks
        'aspnet','dotnet','blazor',
        -- API styles
        'graphql','rest-api','soap',
        -- DevOps / Infra web UIs
        'grafana','kibana','jenkins','gitlab','gitea','minio',
        'rabbitmq-management','kubernetes-api','portainer','vault-ui'
    ],
    ARRAY['SCAN_WEB_INFO','FUZZ_DIR','FUZZ_API','FUZZ_VHOST','PENTEST_WEB']
),
(
    'remote',
    'Remote Access',
    'Remote access, file sharing, directory services, network management',
    '#b794f4',
    ARRAY[
        -- Shell & Desktop
        'ssh','telnet','rlogin','rsh',
        'rdp','microsoft-rdp','vnc','x11','xrdp',
        'winrm','wsman',
        -- File transfer
        'ftp','sftp','tftp','rsync','nfs','smb','samba',
        -- Directory & Auth
        'ldap','ldaps','kerberos','msrpc','rpcbind',
        -- Network management
        'snmp','snmptrap','bgp','ntp',
        -- Windows networking
        'netbios-ssn','netbios-ns','netbios-dgm',
        -- Other remote protocols
        'socks5','socks4','pptp','l2tp','openvpn','ike'
    ],
    ARRAY['PENTEST_NETWORK']
),
(
    'database',
    'Database',
    'Relational, NoSQL, cache, search, time-series, and graph databases',
    '#fc8181',
    ARRAY[
        -- Relational
        'mysql','mariadb','postgresql','mssql','oracle','db2','sybase',
        -- NoSQL Document
        'mongodb','couchdb','ravendb','arangodb',
        -- Key-Value / Cache
        'redis','memcached','valkey',
        -- Search / Analytics
        'elasticsearch','opensearch','solr','clickhouse',
        -- Time-series
        'influxdb','prometheus','victoriametrics','timescaledb',
        -- Graph
        'neo4j','janusgraph',
        -- Wide-column
        'cassandra','hbase','scylladb',
        -- Distributed coordination
        'etcd','zookeeper','consul',
        -- Message queue (với persistence)
        'cockroachdb','yugabytedb'
    ],
    ARRAY['PENTEST_DATABASE']
),
(
    'mail',
    'Mail Services',
    'Email sending, receiving, and relay services',
    '#68d391',
    ARRAY[
        'smtp','smtps','submission','smtp-submission',
        'imap','imaps',
        'pop3','pop3s',
        'ews','exchange','autodiscover',
        'lmtp','qmtp'
    ],
    ARRAY['PENTEST_MAIL']
),
(
    'messaging',
    'Messaging & Streaming',
    'Message brokers, event streaming, and IoT protocols',
    '#f6ad55',
    ARRAY[
        'amqp','amqps','rabbitmq',
        'kafka','kafka-broker',
        'mqtt','mqtts',
        'stomp','stomps',
        'nats','nats-streaming',
        'activemq','zeromq',
        'pulsar'
    ],
    ARRAY[]::TEXT[]
),
(
    'other',
    'Other Services',
    'Services not yet classified into a specific category',
    '#718096',
    ARRAY[
        'unknown','tcpwrapped','ident','echo','discard',
        'finger','whois','gopher','daytime','chargen'
    ],
    ARRAY[]::TEXT[]
)
ON CONFLICT (name) DO UPDATE SET
    label        = EXCLUDED.label,
    description  = EXCLUDED.description,
    color        = EXCLUDED.color,
    service_names = EXCLUDED.service_names,
    module_types  = EXCLUDED.module_types,
    updated_at   = NOW();

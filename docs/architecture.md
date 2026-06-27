# RTI - Redteam Intelligence
## Kiến trúc hệ thống

---

## 1. Tổng quan

RTI là nền tảng quản lý các chiến dịch pentest/redteam theo workspace. Mỗi workspace chứa nhiều target domain, và các module scan/pentest chạy bất đồng bộ qua hệ thống job queue.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│     Workspace UI │ Target Manager │ Scan Dashboard │ Findings    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API / WebSocket
┌──────────────────────────────▼──────────────────────────────────┐
│                       Backend (Go - Fiber)                       │
│  Workspace API │ Target API │ Job Manager │ Results API │ Auth   │
└──────┬─────────────────────────────────────┬────────────────────┘
       │                                     │
┌──────▼──────────────────┐       ┌──────────▼──────────┐
│ PostgreSQL               │       │   Redis              │
│ - core data              │       │   - Job Queue        │
│ - fuzz results           │       │   - Cache            │
│ - raw output (JSONB)     │       │   - Pub/Sub WS       │
│ - wordlist metadata      │       └──────────┬───────────┘
└─────────────────────────┘                  │ consume
┌────────────────────────────────────────────▼────────────────────┐
│                      Python Workers                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Recon Worker │  │  Scan Worker │  │   Pentest Worker     │  │
│  │ - subfinder  │  │ - nmap       │  │   Adapter Pattern    │  │
│  │ - amass      │  │ - masscan    │  │   - WordPressAdapter │  │
│  │ - dnsx       │  │ - httpx      │  │   - GitLabAdapter    │  │
│  └──────────────┘  │ - nuclei     │  │   - SMBAdapter       │  │
│                    │ - katana     │  │   - ...              │  │
│  ┌──────────────┐  └──────────────┘  └──────────────────────┘  │
│  │ Fuzz Worker  │                                                │
│  │ - ffuf       │  ← Plugin adapter pattern (xem fuzzing.md)   │
│  │ - feroxbuster│                                                │
│  │ - dirsearch  │                                                │
│  │ - gobuster   │                                                │
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu trúc thư mục

```
RTI-V2/
├── frontend/                    # Next.js App
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── workspaces/
│   │   │   ├── workspace/[id]/
│   │   │   │   ├── targets/
│   │   │   │   ├── subdomains/
│   │   │   │   ├── ports/
│   │   │   │   ├── services/
│   │   │   │   ├── findings/
│   │   │   │   └── jobs/
│   │   └── api/
│   ├── components/
│   └── lib/
│
├── backend/                     # Go (Fiber framework)
│   ├── cmd/
│   │   └── server/main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── handlers/
│   │   │   │   ├── workspace.go
│   │   │   │   ├── target.go
│   │   │   │   ├── job.go
│   │   │   │   ├── subdomain.go
│   │   │   │   ├── port.go
│   │   │   │   ├── service.go
│   │   │   │   └── finding.go
│   │   │   ├── middleware/
│   │   │   └── routes.go
│   │   ├── models/
│   │   ├── repository/          # DB layer
│   │   ├── services/            # Business logic
│   │   └── queue/               # Redis job publisher
│   ├── pkg/
│   │   ├── config/
│   │   ├── database/
│   │   └── websocket/
│   └── go.mod
│
├── workers/                     # Python Workers
│   ├── core/
│   │   ├── worker_base.py       # Base worker class
│   │   ├── redis_client.py
│   │   ├── db_client.py
│   │   └── job_types.py
│   ├── recon/
│   │   ├── subdomain_worker.py  # subfinder, amass, dnsx
│   │   └── tools/
│   ├── scan/
│   │   ├── portscan_worker.py   # nmap, masscan
│   │   ├── service_worker.py    # httpx, whatweb
│   │   ├── cve_worker.py        # nuclei
│   │   └── tools/
│   ├── fuzz/
│   │   ├── fuzz_worker.py       # ffuf, feroxbuster
│   │   └── wordlists/
│   ├── pentest/
│   │   ├── pentest_worker.py    # điều phối adapter
│   │   └── adapters/
│   │       ├── base_adapter.py
│   │       ├── web/
│   │       │   ├── wordpress_adapter.py
│   │       │   ├── gitlab_adapter.py
│   │       │   ├── laravel_adapter.py
│   │       │   └── jira_adapter.py
│   │       └── network/
│   │           ├── smb_adapter.py
│   │           ├── ftp_adapter.py
│   │           ├── rdp_adapter.py
│   │           ├── mssql_adapter.py
│   │           └── mysql_adapter.py
│   ├── requirements.txt
│   └── main.py                  # worker entry point
│
├── docker-compose.yml
├── docker-compose.dev.yml
└── docs/
    ├── architecture.md          # file này
    ├── database-schema.md
    └── api-contracts.md
```

---

## 3. Luồng dữ liệu (Data Flow)

### 3.1 Luồng Scan Job

```
User trigger scan (Frontend)
    → POST /api/jobs  (Backend Go)
    → Job saved to PostgreSQL (status: pending)
    → Job pushed to Redis Queue
    → Python Worker picks up job
    → Worker runs tool (subfinder, nmap, etc.)
    → Worker writes raw result → MongoDB
    → Worker writes structured result → PostgreSQL
    → Worker updates job status → Redis → Backend (WebSocket)
    → Frontend receives real-time update
```

### 3.2 Luồng Pentest Module

Mỗi `PentestAdapter` là một **coordinator** — nó không tự chạy tool, mà điều phối
nhiều `ToolAdapter` phù hợp với framework/service đó, rồi tổng hợp kết quả.

```
Service identified (e.g., WordPress on port 443)
    → Backend tạo PENTEST_WEB job
    → PentestWorker nhận job
    → AdapterRegistry.get_adapter(service_ctx) → WordPressAdapter

    → WordPressAdapter.run()
        │
        ├── tool: wpscan       → WpscanToolAdapter.run()   → list[Finding]
        ├── tool: nuclei       → NucleiToolAdapter.run()   → list[Finding]  (wordpress templates)
        ├── tool: ffuf/dir     → FfufToolAdapter.run()     → list[FuzzHit]  (wp-plugins.txt)
        └── tool: nikto        → NiktoToolAdapter.run()    → list[Finding]
        │
        └── aggregate tất cả findings → list[Finding] đã dedup + severity

    → Findings (đã chuẩn hoá) lưu vào PostgreSQL (bảng findings)
    → Raw output từng tool lưu vào PostgreSQL (bảng job_logs, cột raw_output JSONB)
```

Cách thêm tool mới cho WordPress (ví dụ thêm `semgrep`):
- Tạo `SemgrepToolAdapter` (kế thừa `BaseToolAdapter`)
- Thêm vào danh sách tool trong `WordPressAdapter`
- Không sửa gì khác

Cách thêm framework mới (ví dụ `DrupalAdapter`):
- Tạo `DrupalAdapter` (kế thừa `BasePentestAdapter`)
- Khai báo danh sách tool nó dùng: `drupal-check`, `nuclei`, `ffuf` (drupal paths)
- Đăng ký vào `ADAPTER_REGISTRY`
- Không sửa gì khác

---

## 4. Job Types (Redis Queue)

```
RECON_SUBDOMAIN    - Tìm subdomain từ target domain
SCAN_PORT          - Port scan trên host list
SCAN_SERVICE       - Service detection trên port list
SCAN_WEB_INFO      - Probe HTTP/HTTPS (httpx): title, status, tech stack
SCAN_CVE           - CVE / vulnerability scan (nuclei, cvemap)

FUZZ_DIR           - Brute force thư mục (ffuf, feroxbuster, dirsearch, gobuster)
FUZZ_FILE          - Tìm file ẩn theo extension (.bak, .sql, .env, .php)
FUZZ_VHOST         - Virtual host enumeration
FUZZ_PARAM         - Fuzzing GET/POST parameter
FUZZ_BACKUP        - Tìm file backup (db.sql, site.zip, .git/HEAD, ...)
FUZZ_API           - Brute force API endpoint

PENTEST_WEB        - Pentest module cho web service (WordPress, GitLab, ...)
PENTEST_NETWORK    - Pentest module cho network service (SMB, FTP, LDAP, ...)
```

---

## 5. Tech Stack

| Layer     | Technology          | Lý do                                      |
|-----------|---------------------|--------------------------------------------|
| Frontend  | Next.js 14 (App Router) | SSR, real-time via WebSocket           |
| Backend   | Go + Fiber          | Hiệu năng cao, concurrent job management   |
| Workers   | Python 3.11+        | Ecosystem tool security phong phú          |
| Queue     | Redis (Streams)     | Reliable job queue, pub/sub cho real-time  |
| Cache     | Redis               | Cache subdomain, port results              |
| DB chính  | PostgreSQL 15       | Structured data, JSONB cho raw output      |
| Container | Docker Compose      | Môi trường nhất quán                       |

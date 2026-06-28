# RTI V2 — Task List

## Trạng thái
- `[ ]` Chưa làm
- `[~]` Đang làm
- `[x]` Xong

---

## Phase 1 — Foundation (Backend + DB)

### 1.1 Project scaffold
- [x] Cấu trúc thư mục Go backend
- [x] go.mod
- [x] Cấu trúc thư mục Next.js frontend
- [x] Docker Compose (postgres, redis, backend, frontend, worker)
- [x] Migration file 001_init.sql

### 1.2 Workspace Management
- [x] `GET    /api/workspaces`          — liệt kê workspace
- [x] `POST   /api/workspaces`          — tạo workspace
- [x] `GET    /api/workspaces/:id`      — chi tiết workspace
- [x] `PUT    /api/workspaces/:id`      — sửa workspace
- [x] `DELETE /api/workspaces/:id`      — xóa workspace
- [x] Frontend: Workspace list page + WorkspaceCard + WorkspaceForm

### 1.3 Target Management
- [x] `GET    /api/workspaces/:id/targets`        — liệt kê target
- [x] `POST   /api/workspaces/:id/targets`        — thêm 1 target
- [x] `POST   /api/workspaces/:id/targets/bulk`   — import nhiều domain
- [x] `PUT    /api/workspaces/:id/targets/:tid`   — sửa target
- [x] `DELETE /api/workspaces/:id/targets/:tid`   — xóa target
- [x] Frontend: Target list page + TargetForm (single + bulk)

---

## Phase 2 — Recon Pipeline

### 2.1 Job Queue System
- [x] Redis Streams producer (Go)
- [x] Python worker base class + consumer
- [x] Job status update → PostgreSQL
- [x] WebSocket pub/sub (Go → Frontend) — polling-based via `useJobPolling`

### 2.2 Subdomain Enumeration (`RECON_SUBDOMAIN`)
- [x] Job type: `RECON_SUBDOMAIN`
- [x] Python: SubdomainWorker — subfinder
- [x] Normalize → bảng `subdomains`
- [x] Frontend: subdomain table + filter + trigger scan + history drawer
- [x] CopyButton inline trên bảng

### 2.3 Port Scan (`SCAN_PORT`)
- [x] Job type: `SCAN_PORT`
- [x] Python: PortWorker — naabu (TCP connect, không cần CAP_NET_RAW)
- [x] Normalize → bảng `ports`
- [x] Frontend: port list + filter by host/service + trigger scan + history drawer
- [x] Service category detection (web, db, ssh, ftp…)

### 2.4 Web Probe (`SCAN_WEB_INFO`)
- [x] Job type: `SCAN_WEB_INFO`
- [x] Python: WebProbeWorker — httpx (title, status, tech, response time)
- [x] WhatWeb integration — CMS detection (WordPress, Joomla, Drupal + version)
- [x] Redirect chain handling — merge tech của final URL về input URL
- [x] Technology merge — httpx + WhatWeb, ưu tiên entry có version info
- [x] Normalize → bảng `web_probes` (1 row per endpoint per job)
- [x] Frontend: web probe table + tech tag filter + history drawer (full tech list)

### 2.5 Web Crawler (`RECON_WEB_CRAWL`)
- [x] Job type: `RECON_WEB_CRAWL`
- [x] Python: WebCrawlWorker — katana v1.1.2
- [x] Seed URLs từ `web_probes WHERE is_alive=true`
- [x] Normalize → bảng `web_crawl_urls` + `web_crawl_forms`
- [x] Frontend: crawler table + SourceBadge

### 2.5.1 Endpoint Normalize (`RECON_ENDPOINT_NORMALIZE`)
- [x] Job type: `RECON_ENDPOINT_NORMALIZE`
- [x] Python: EndpointNormalizeWorker
- [x] Normalize GET endpoints + POST forms → bảng `fuzz_endpoints`
- [x] Go: FuzzEndpointRepo + FuzzEndpointHandler
- [x] Frontend: Endpoints page

---

## Phase 3 — Findings

### 3.1 Findings Module
- [x] Bảng `findings` — severity, title, description, proof, request/response
- [x] API: CRUD findings per workspace
- [x] Frontend: findings page + severity filter + add/edit/delete finding

---

## Phase 4 — Fuzzing

### 4.1 Param Discovery (`FUZZ_PARAM`)
- [x] Job type: `FUZZ_PARAM` — Python: ParamFuzzWorker (arjun)
- [x] Migrate → bảng `fuzz_param_results` (migration 000011)
- [x] Go: FuzzParamRepo + FuzzParamHandler
- [x] Frontend: `/fuzzing/params`

### 4.2 Directory Fuzzing (`FUZZ_DIR`)
- [x] Job type: `FUZZ_DIR` — Python: DirFuzzWorker (ffuf)
- [x] Wordlist catalog: migration 000013 + SecLists download tự động (entrypoint.sh)
- [x] Migrate → bảng `dir_fuzz_results` (migration 000012)
- [x] Go: DirFuzzRepo + DirFuzzHandler + WordlistRepo + WordlistHandler
- [x] Frontend: `/fuzzing/dirs` — dynamic wordlist dropdown theo SecLists structure

### 4.3 Fuzzing — Còn lại
- [ ] FUZZ_FILE — fuzz file extensions trên paths đã tìm được
- [ ] FUZZ_VHOST — virtual host enumeration (ffuf `-H "Host: FUZZ"`)
- [ ] FUZZ_BACKUP — bruteforce backup files (.bak, .sql, .zip, ~)
- [ ] Real-time streaming kết quả qua WebSocket

---

## Phase 5 — Vulnerability Scan

> Thiết kế chi tiết: `docs/vuln-scan-design.md`

### 5.0 Framework / Scaffold
- [x] DB: migration 000014 — job types, findings.source_tool/domain, vuln_scan_runs table
- [x] Worker: BaseVulnHandler + registry pattern (`workers/vuln/`)
- [x] Worker: VulnDispatchWorker — tech-aware routing
- [x] Frontend: `/vuln/` overview page + VULN_DISPATCH modal
- [x] Frontend: Sidebar section "Vuln Scan" với 8 items
- [x] Docs: `docs/vuln-scan-design.md`
- [ ] Go: VulnScanRepo + VulnScanHandler (GET /vuln-runs, findings filter by domain)
- [ ] `core/db.py`: `get_open_ports()`, `get_fuzz_param_results_for_vuln()`, `insert_vuln_findings()`

### 5.1 Common Domain
- [ ] **Nuclei** — nuclei_worker.py: `-tags cves,misconfigurations,exposures,default-login`
- [ ] **Nikto** — nikto_worker.py: `-Format json`
- [ ] **testssl.sh** — testssl_worker.py: HTTPS targets only, `--jsonfile`
- [ ] Frontend: `/vuln/common` — findings table filter by tool + severity

### 5.2 CMS Domain
- [ ] **WPScan** — wpscan_worker.py: `--enumerate vp,vt,u --format json`
- [ ] **JoomScan** — joomscan_worker.py
- [ ] **Droopescan** — droopescan_worker.py: `scan drupal -u {url}`
- [ ] Frontend: `/vuln/cms` — grouped by CMS type

### 5.3 Software Domain
- [ ] **GitLab** — gitlab_worker.py: nuclei gitlab tags + custom checks
- [ ] **Jenkins** — jenkins_worker.py: CVE-2024-23897, script console
- [ ] **Confluence** — confluence_worker.py: CVE-2021-26084, CVE-2022-26134
- [ ] **Grafana** — grafana_worker.py: CVE-2021-43798, default creds
- [ ] **Tomcat** — tomcat_worker.py: manager panel, PUT upload
- [ ] **Spring Boot** — springboot_worker.py: actuator, Spring4Shell
- [ ] Frontend: `/vuln/software` — grouped by platform

### 5.4 Cloud Domain
- [ ] **AWS** — aws_worker.py: S3 listing, metadata SSRF, CloudFront
- [ ] **GCP** — gcp_worker.py: GCS exposure, metadata SSRF
- [ ] **Azure** — azure_worker.py: Blob exposure, metadata SSRF
- [ ] **Subdomain Takeover** — subdomain_takeover_worker.py
- [ ] Frontend: `/vuln/cloud`

### 5.5 Discovery Domain
- [ ] **Git Exposure** — git_worker.py: /.git/config, git-dumper
- [ ] **Env/Config** — env_worker.py: .env, *.bak, database.yml
- [ ] **CORS** — cors_worker.py: corsy hoặc nuclei cors templates
- [ ] Frontend: `/vuln/discovery`

### 5.6 Network Service Domain
- [ ] **Redis** — redis_worker.py: unauth PING, CONFIG GET
- [ ] **MySQL** — mysql_worker.py: anonymous login, version banner
- [ ] **MongoDB** — mongodb_worker.py: unauth connect, db listing
- [ ] **Elasticsearch** — elasticsearch_worker.py: unauth read, index listing
- [ ] Frontend: `/vuln/network`

### 5.7 Web Params Domain
- [ ] **SQLMap** — sqlmap_worker.py: `--batch --level 2 --risk 1`
- [ ] **Dalfox** — dalfox_worker.py: `--format json`
- [ ] Frontend: `/vuln/web-params` — ⚠️ warning về tính xâm nhập

### 5.8 Frontend — Findings per Domain
- [ ] Shared `VulnSubNav` component cho tất cả domain pages
- [ ] Findings table với filter: severity + source_tool + status
- [ ] Severity distribution chart per domain
- [ ] Export findings (JSON/CSV)

---

## Phase 6 — Interactive Service Modules

### 6.1 Web Terminal
- [ ] WebSocket terminal component (xterm.js)
- [ ] FTP interactive session
- [ ] SMB shell (smbclient)
- [ ] LDAP browser

---

## Ghi chú triển khai

- Backend Go dùng **Fiber v2**
- ORM: thuần **pgx/v5** (không dùng GORM)
- Frontend: **Next.js 14 App Router** + **Tailwind CSS**
- Realtime: **WebSocket** qua Fiber + Redis Pub/Sub (hiện tại polling)
- Migration: **golang-migrate**
- Worker image: python:3.13-slim + subfinder + httpx + nuclei + naabu + katana + whatweb + ffuf + arjun
- Wordlists: SecLists tải tự động qua `workers/entrypoint.sh` khi container khởi động lần đầu

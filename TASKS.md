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
- [x] Fix response_time: httpx v1.6+ field `"time"` thay vì `"response_time"`

### 2.5 Web Crawler (`RECON_WEB_CRAWL`)
- [x] Job type: `RECON_WEB_CRAWL`
- [x] Python: WebCrawlWorker — katana v1.1.2
- [x] Seed URLs từ `web_probes WHERE is_alive=true`
- [x] Depth calculation từ source chain (katana v1.1.2 không có field `depth`)
- [x] Normalize → bảng `web_crawl_urls` (append-only, 1 row per URL per job)
- [x] Form extraction — katana `-fx` flag: response.body include trong JSONL → parse `<form>` bằng BeautifulSoup
- [x] Normalize forms → bảng `web_crawl_forms` (action_url resolved via urljoin, enctype detect từ `<input type="file">`)
- [x] Frontend: crawler table + SourceBadge (a, script, js, link, img, header, file…)
- [x] JS crawl option (`-jc`) + known files option (`-kf all`)

### 2.5.1 Endpoint Normalize (`RECON_ENDPOINT_NORMALIZE`)
- [x] Job type: `RECON_ENDPOINT_NORMALIZE`
- [x] Python: EndpointNormalizeWorker
- [x] Bước 1 — Normalize GET endpoints từ `web_crawl_urls`: filter static ext, JS-source URLs, JS-expression params; normalize path params (`/user/123` → `/user/{id}`)
- [x] Bước 2 — Fetch HTML pages trực tiếp (requests, 20 threads song song) → extract form — fallback khi katana không capture body
- [x] Bước 3 — Normalize POST forms từ `web_crawl_forms` (DB) + fetched forms; dedup theo (url, method)
- [x] Ghi vào bảng `fuzz_endpoints` (append-only): url, method, content_type, params JSONB, has_csrf, source_type
- [x] Go: FuzzEndpointRepo, FuzzEndpointHandler (`GET /api/workspaces/:wsid/fuzz-endpoints`)
- [x] Frontend: Endpoints page — stats bar, filter (method/source/có-params toggle), table, detail drawer, curl snippet
- [x] Sidebar: thêm mục "Endpoints" + ReconSubNav trong tất cả trang recon

### 2.6 CVE / Nuclei Scan (`SCAN_CVE`)
- [ ] Job type: `SCAN_CVE`
- [ ] Python: NucleiWorker, CvemapWorker
- [ ] Normalize → bảng `vulnerabilities`
- [ ] Frontend: CVE list với severity filter

---

## Phase 3 — Findings

### 3.1 Findings Module
- [x] Bảng `findings` — severity, title, description, proof, request/response
- [x] API: CRUD findings per workspace
- [x] Frontend: findings page + severity filter + add/edit/delete finding

---

## Phase 4 — Fuzzing

### 4.1 Param Discovery (`FUZZ_PARAM`)
- [x] Job type: `FUZZ_PARAM`
- [x] Python: ParamFuzzWorker — arjun discover hidden GET/POST params từ `fuzz_endpoints`
- [x] Dedup theo `(url, method)`, giới hạn 100 endpoints/job
- [x] Graceful no-op nếu arjun chưa cài (`shutil.which` check)
- [x] Migrate → bảng `fuzz_param_results` (migration 000011)
- [x] Go: FuzzParamRepo + FuzzParamHandler (`GET /:wsid/fuzz-params?method=`)
- [x] Frontend: `/fuzzing/params` — stats bar, param chip badges, detail drawer + curl snippet
- [x] Dockerfile: `arjun` cài qua pip (`pip install arjun`)

### 4.2 Directory Fuzzing (`FUZZ_DIR`)
- [x] Job type: `FUZZ_DIR`
- [x] Python: DirFuzzWorker — ffuf bruteforce paths trên live web probes
- [x] Wordlist bundled: `workers/wordlists/common.txt` (386 entries) → `/app/wordlists/common.txt`
- [x] Dedup base URLs theo `(scheme, netloc)`, giới hạn 20 URLs/job
- [x] `is_interesting` heuristic: status not in {404, 429} AND content_length > 200
- [x] Graceful no-op nếu ffuf chưa cài
- [x] Migrate → bảng `dir_fuzz_results` (migration 000012)
- [x] Go: DirFuzzRepo + DirFuzzHandler (`GET /:wsid/dir-fuzz?status_code=&interesting_only=1`)
- [x] Frontend: `/fuzzing/dirs` — status color-coded, interesting badge, filter bar
- [x] Dockerfile: `ffuf v2.1.0` binary từ GitHub releases
- [x] Sidebar: mục "Fuzzing" với Param Discovery + Directory Fuzzing (accent cam)

### 4.3 Fuzzing — Còn lại (chưa làm)
- [ ] FUZZ_FILE — fuzz file extensions trên paths đã tìm được
- [ ] FUZZ_VHOST — virtual host enumeration (ffuf `-H "Host: FUZZ"`)
- [ ] FUZZ_BACKUP — bruteforce backup files (.bak, .sql, .zip, ~) trên assets
- [ ] Wordlist management API — upload + catalog wordlist toàn hệ thống
- [ ] Real-time streaming kết quả qua WebSocket (hiện tại là polling)

---

## Phase 5 — Pentest Modules

### 5.1 Framework Detection
- [x] httpx tech stack + WhatWeb → technologies field trong web_probes
- [x] Frontend: tech tag badge trên web probe table

### 5.2 Pentest Adapter System
- [ ] BasePentestAdapter interface
- [ ] Job type: `PENTEST_WEB`, `PENTEST_NETWORK`
- [ ] AdapterRegistry
- [ ] Frontend: Pentest Module view (checklist technique per adapter)

### 5.3 Web Adapters
- [ ] WordPressAdapter (wpscan + custom scripts)
- [ ] GitLabAdapter
- [ ] LaravelAdapter
- [ ] JiraAdapter
- [ ] JenkinsAdapter
- [ ] GenericWebAdapter (fallback)

### 5.4 Network Adapters
- [ ] SMBAdapter (enum4linux, null session)
- [ ] FTPAdapter (anonymous login, writable dirs)
- [ ] LDAPAdapter (anonymous bind, domain dump)
- [ ] MSSQLAdapter
- [ ] MySQLAdapter

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
- Frontend: **Next.js 14 App Router** + **Tailwind CSS** + **shadcn/ui**
- Realtime: **WebSocket** qua Fiber + Redis Pub/Sub (hiện tại polling)
- Migration: **golang-migrate**
- Worker image: python:3.13-slim + subfinder + httpx + nuclei + naabu + katana + whatweb

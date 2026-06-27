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
- [x] Docker Compose (postgres, redis, backend, frontend)
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
- [ ] Redis Streams producer (Go)
- [ ] Python worker base class + consumer
- [ ] Job status update → PostgreSQL
- [ ] WebSocket pub/sub (Go → Frontend)

### 2.2 Subdomain Enumeration
- [ ] Job type: `RECON_SUBDOMAIN`
- [ ] Python: SubfinderAdapter, DnsxAdapter
- [ ] Normalize → bảng `subdomains`
- [ ] Frontend: danh sách subdomain + trigger scan

### 2.3 Port Scan
- [ ] Job type: `SCAN_PORT`
- [ ] Python: NaabuAdapter, NmapAdapter
- [ ] Normalize → bảng `ports`
- [ ] Frontend: port list + filter by host

### 2.4 Web Probe
- [ ] Job type: `SCAN_WEB_INFO`
- [ ] Python: HttpxAdapter (title, status, tech, screenshot)
- [ ] Normalize → bảng `services` + `web_info`
- [ ] Frontend: web service table với tech tag + screenshot preview

### 2.5 CVE / Nuclei Scan
- [ ] Job type: `SCAN_CVE`
- [ ] Python: NucleiAdapter, CvemapAdapter
- [ ] Normalize → bảng `vulnerabilities`
- [ ] Frontend: CVE list với severity filter

---

## Phase 3 — Fuzzing

### 3.1 Wordlist Management
- [ ] Upload wordlist API
- [ ] Built-in wordlist catalog (seeded khi start)
- [ ] Frontend: wordlist browser + upload form

### 3.2 Fuzz Jobs
- [ ] Job types: `FUZZ_DIR`, `FUZZ_FILE`, `FUZZ_VHOST`, `FUZZ_PARAM`, `FUZZ_BACKUP`
- [ ] Python: FfufAdapter, FeroxbusterAdapter, DirsearchAdapter
- [ ] Normalize → bảng `fuzz_configs` + `fuzz_results`
- [ ] Frontend: fuzz config form + real-time result stream + filter interesting

---

## Phase 4 — Pentest Modules

### 4.1 Framework Detection
- [ ] httpx tech stack → service_type mapping
- [ ] Frontend: badge hiển thị framework trên service list

### 4.2 Pentest Adapter System
- [ ] BasePentestAdapter interface
- [ ] Job type: `PENTEST_WEB`, `PENTEST_NETWORK`
- [ ] AdapterRegistry
- [ ] Frontend: Pentest Module view (checklist technique per adapter)

### 4.3 Web Adapters
- [ ] WordPressAdapter (wpscan + custom scripts)
- [ ] GitLabAdapter
- [ ] LaravelAdapter
- [ ] JiraAdapter
- [ ] JenkinsAdapter
- [ ] GenericWebAdapter (fallback)

### 4.4 Network Adapters
- [ ] SMBAdapter (enum4linux, null session)
- [ ] FTPAdapter (anonymous login, writable dirs)
- [ ] LDAPAdapter (anonymous bind, domain dump)
- [ ] MSSQLAdapter
- [ ] MySQLAdapter

---

## Phase 5 — Frontend

### 5.1 Layout & Navigation
- [ ] Sidebar navigation
- [ ] Workspace switcher
- [ ] Dark theme (design system)

### 5.2 Workspace & Target Pages
- [~] Workspace list page
- [~] Workspace create/edit modal
- [~] Target list page (per workspace)
- [~] Target bulk import (paste nhiều domain)

### 5.3 Recon Pages
- [ ] Subdomain page (table + filter + export)
- [ ] Port & Services page
- [ ] Web Probe page (screenshot gallery)
- [ ] Recon pipeline progress view

### 5.4 Pentest Module Page
- [ ] Service list với framework tag
- [ ] Technique checklist per adapter
- [ ] Live terminal output (WebSocket)
- [ ] Run individual technique / Run all

### 5.5 Fuzzing Page
- [ ] Fuzz config form (URL, type, tool, wordlist)
- [ ] Real-time result table (WebSocket)
- [ ] Filter: status code, interesting flag
- [ ] Mark finding từ fuzz result

### 5.6 Findings Page
- [ ] Vulnerability board (filter severity/module)
- [ ] Finding detail (proof, request/response)
- [ ] Export report (PDF/Markdown)

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
- Realtime: **WebSocket** qua Fiber + Redis Pub/Sub
- Migration: **golang-migrate**

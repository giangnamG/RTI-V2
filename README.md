# RTI V2 — Redteam Intelligence Platform

Nền tảng quản lý chiến dịch pentest/redteam theo workspace. Hỗ trợ quản lý target, tự động hoá recon pipeline, fuzzing, pentest theo framework, và theo dõi findings toàn bộ qua một giao diện thống nhất.

---

## Mục lục

- [Tính năng](#tính-năng)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [API Endpoints](#api-endpoints)
- [Tài liệu chi tiết](#tài-liệu-chi-tiết)
- [Roadmap](#roadmap)

---

## Tính năng

### Đã hoàn thiện
- **Quản lý Workspace** — tạo, sửa, xoá các chiến dịch pentest độc lập với nhau
- **Quản lý Target** — thêm từng domain hoặc import hàng loạt, theo dõi trạng thái active/inactive
- **Workspace Switcher** — chuyển đổi nhanh giữa các workspace ngay trên sidebar

### Đang phát triển
- **Recon Pipeline** — tự động subdomain enumeration, port scan, web probe, CVE scan theo hàng đợi bất đồng bộ
- **Fuzzing Engine** — hỗ trợ ffuf, feroxbuster, dirsearch, gobuster với wordlist tùy chỉnh
- **Pentest Modules** — adapter riêng cho từng framework: WordPress, GitLab, Laravel, Jira, SMB, FTP, LDAP...
- **Findings & Reporting** — bảng theo dõi lỗ hổng theo severity, xuất báo cáo PDF/Markdown
- **Interactive Terminal** — WebSocket terminal tương tác trực tiếp với FTP, SMB, LDAP

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js 14)                      │
│    Workspace UI │ Target Manager │ Scan Dashboard │ Findings     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API / WebSocket
┌──────────────────────────────▼──────────────────────────────────┐
│                       Backend (Go + Fiber v2)                    │
│   Workspace API │ Target API │ Job Manager │ Results API         │
└──────┬──────────────────────────────────────┬───────────────────┘
       │                                      │
┌──────▼──────────────┐            ┌──────────▼──────────┐
│     PostgreSQL       │            │        Redis         │
│  - Workspace/Target  │            │  - Job Queue         │
│  - Recon results     │            │  - Cache             │
│  - Findings          │            │  - Pub/Sub WebSocket │
│  - Raw output (JSONB)│            └──────────┬───────────┘
└─────────────────────┘                        │ consume
┌──────────────────────────────────────────────▼────────────────┐
│                        Python Workers                           │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────────┐ │
│  │ Recon Worker│   │  Scan Worker│   │   Pentest Worker     │ │
│  │ - subfinder │   │ - nmap      │   │   (Adapter Pattern)  │ │
│  │ - dnsx      │   │ - masscan   │   │   - WordPressAdapter │ │
│  └─────────────┘   │ - httpx     │   │   - GitLabAdapter    │ │
│                    │ - nuclei    │   │   - SMBAdapter ...   │ │
│  ┌─────────────┐   └─────────────┘   └──────────────────────┘ │
│  │ Fuzz Worker │                                                │
│  │ - ffuf      │                                                │
│  │ - feroxbust │                                                │
│  │ - dirsearch │                                                │
│  └─────────────┘                                                │
└────────────────────────────────────────────────────────────────┘
```

### Luồng xử lý job

```
Người dùng kích hoạt scan (Frontend)
    → POST /api/jobs  (Go Backend)
    → Job lưu vào PostgreSQL (status: pending)
    → Job đẩy vào Redis Streams
    → Python Worker nhận job
    → Worker chạy tool (subfinder, nmap,...)
    → Kết quả chuẩn hoá → PostgreSQL
    → Cập nhật trạng thái → Redis Pub/Sub → WebSocket
    → Frontend nhận cập nhật real-time
```

### Mô hình dữ liệu lịch sử (Append-Only)

RTI V2 dùng mô hình **append-only** cho tất cả dữ liệu thu thập được từ các công cụ recon/scan. Đây là nguyên tắc cốt lõi của hệ thống:

**Nguyên tắc:**
- Mỗi lần chạy tool tạo ra **records mới hoàn toàn độc lập** — không UPDATE, không DELETE records cũ
- Giao diện luôn hiển thị **trạng thái mới nhất** (dùng `DISTINCT ON ... ORDER BY created_at DESC`)
- Click vào bất kỳ entity nào (domain, host) để xem **toàn bộ lịch sử** thu thập theo thứ tự thời gian

**Ví dụ thực tế:**

| Thời điểm | Domain | IP | Nguồn | Alive |
|-----------|--------|-----|-------|-------|
| T1 (27/6) | admin-partner.vnpay.vn | 103.220.86.209 | netlas | true |
| T2 (30/6) | admin-partner.vnpay.vn | 103.220.80.100 | crt.sh | false |

→ Giao diện hiển thị record T2 (mới nhất). Click vào domain → drawer hiện cả T1 lẫn T2.

**Quy tắc áp dụng cho từng bảng:**

| Bảng | Tool ghi | Ghi đè? |
|------|----------|---------|
| `subdomains` | subfinder, naabu (alive check) | ❌ Không — mỗi scan = row mới |
| `ports` | naabu | ❌ Không — mỗi scan = row mới |
| `jobs` | backend API | ✅ Có — cập nhật status/result |

**API endpoints:**
```
GET /api/workspaces/:wsid/subdomains              → Latest state (DISTINCT ON domain)
GET /api/workspaces/:wsid/subdomains/history?domain=xxx  → Toàn bộ lịch sử
GET /api/workspaces/:wsid/ports                   → Latest state (DISTINCT ON host+port+protocol)
GET /api/workspaces/:wsid/ports/history?host=xxx  → Toàn bộ lịch sử
```

**Mỗi tool đóng góp vào `subdomains` table theo cách riêng:**
- **subfinder**: thêm row với `sources=["hackertarget", "crtsh", ...]`, `is_alive=NULL`
- **naabu**: thêm row với `sources=["naabu"]`, `is_alive=true/false`, `ip_addresses=[...]` — **tất cả IPs** mà naabu scan được (một domain có thể có nhiều A record: CDN, load balancer, round-robin DNS)

---

### Frontend — useJobPolling hook

Tất cả các tính năng có job scan (subdomain, port, web probe, CVE...) dùng chung hook `useJobPolling` thay vì tự triển khai polling riêng.

**File:** `frontend/src/hooks/useJobPolling.ts`

```typescript
const { activeJob, setActiveJob } = useJobPolling(
  wsid,          // workspace ID
  'SCAN_PORT',   // job_type cần theo dõi
  loadPorts,     // callback gọi khi job hoàn thành
)
```

**Hook xử lý tự động:**
- **Restore khi mount** — khi user navigate đi rồi quay lại, hook tự fetch `jobApi.list()` và tìm job `running`/`pending` → banner hiện lại đúng trạng thái
- **Poll mỗi 3s** — gọi `jobApi.get()`, cập nhật `activeJob`, clear interval khi `completed`/`failed`
- **Stable callback** — `onCompleted` được giữ qua `ref`, không cần wrap `useCallback` phía page
- **Cleanup** — clear interval tự động khi component unmount

**Quy ước cho tính năng mới:** tất cả page có banner job status đều phải dùng hook này, không tự viết polling logic.

---

### Mô hình Adapter hai tầng

RTI dùng hai tầng adapter tách biệt:

- **BaseToolAdapter** — bọc từng công cụ riêng lẻ (subfinder, nuclei, ffuf...), chuẩn hoá output thành định dạng chung
- **BasePentestAdapter** — điều phối nhiều ToolAdapter theo đúng phương pháp pentest của framework đó (WordPress, GitLab, SMB...)

Recon pipeline (subfinder, nmap, httpx, nuclei) chạy cho **mọi target**. Framework adapter chỉ chạy khi đã xác định được framework của target.

---

## Tech Stack

| Tầng        | Công nghệ               | Lý do chọn                                    |
|-------------|-------------------------|-----------------------------------------------|
| Frontend    | Next.js 14 (App Router) | SSR, routing linh hoạt, WebSocket dễ tích hợp |
| Backend     | Go + Fiber v2           | Hiệu năng cao, xử lý concurrent tốt           |
| Workers     | Python 3.13             | Hệ sinh thái công cụ bảo mật phong phú        |
| Queue       | Redis Streams           | Job queue bền vững, pub/sub cho real-time      |
| Database    | PostgreSQL 16           | Dữ liệu có cấu trúc, JSONB cho raw output     |
| Container   | Docker Compose          | Môi trường phát triển nhất quán               |

---

## Cấu trúc thư mục

```
RTI-V2/
├── frontend/                        # Next.js 14 App
│   └── src/
│       ├── app/
│       │   └── (dashboard)/
│       │       ├── workspaces/      # Danh sách workspace
│       │       └── workspace/[id]/  # Context một workspace
│       │           ├── targets/     # Quản lý target
│       │           ├── recon/       # Kết quả recon
│       │           ├── attack/      # Pentest modules
│       │           └── findings/    # Danh sách lỗ hổng
│       ├── components/
│       │   ├── layout/              # Sidebar, Header
│       │   ├── workspace/           # WorkspaceCard, WorkspaceForm, WorkspaceSwitcher
│       │   └── target/              # TargetForm
│       └── lib/
│           └── api.ts               # Typed API client
│
├── backend/                         # Go + Fiber
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── handlers/            # workspace, target, job...
│   │   │   ├── middleware/          # CORS, auth...
│   │   │   └── routes.go
│   │   ├── models/                  # Struct domain
│   │   └── repository/             # Tầng truy vấn DB (pgx thuần)
│   ├── migrations/                  # SQL migration files
│   └── pkg/
│       ├── config/                  # Biến môi trường
│       └── database/                # PostgreSQL pool
│
├── workers/                         # Python Workers (placeholder)
│   ├── main.py
│   └── requirements.txt
│
├── deploy_local/                    # Docker dev environment
│   ├── compose.yaml
│   └── dockerfiles/
│       ├── go.Dockerfile.dev        # Go + air (hot-reload)
│       ├── frontend.Dockerfile.dev  # Node + next dev
│       ├── postgres.Dockerfile.dev  # PostgreSQL + auto migration
│       └── worker.Dockerfile.dev    # Python worker
│
└── docs/
    ├── architecture.md              # Kiến trúc chi tiết
    ├── database-schema.md           # Schema PostgreSQL đầy đủ
    ├── adapter-pattern.md           # Thiết kế adapter hai tầng
    └── fuzzing-wordlist.md          # Hệ thống fuzzing và wordlist
```

---

## Cài đặt và chạy

### Yêu cầu

- Docker Desktop (Windows/macOS/Linux)
- Docker Compose v2+

### Khởi động môi trường phát triển

```bash
# Clone về
git clone https://github.com/giangnamG/RTI-V2.git
cd RTI-V2

# Tạo file biến môi trường cho backend
cp backend/.env.example deploy_local/.env.backend.local

# Tạo file biến môi trường cho frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8081" > deploy_local/.env.frontend.local

# Build và khởi động tất cả services
cd deploy_local
docker compose up -d --build
```

### Truy cập

| Service     | URL                      |
|-------------|--------------------------|
| Frontend    | http://localhost:3001     |
| Backend API | http://localhost:8081     |
| PostgreSQL  | localhost:5433            |
| Redis       | localhost:6380            |

> **Lưu ý:** Port dùng 5433/6380/8081/3001 để tránh xung đột với các dự án khác chạy ở 5432/6379/8080/3000.

### Xem logs

```bash
cd deploy_local

docker compose logs -f api-go      # Backend Go
docker compose logs -f frontend    # Next.js
docker compose logs -f postgres    # Database
```

### Dừng hệ thống

```bash
cd deploy_local
docker compose down
```

---

## API Endpoints

### Workspace

| Method | Endpoint                  | Mô tả                    |
|--------|---------------------------|--------------------------|
| GET    | `/api/workspaces`         | Danh sách workspace      |
| POST   | `/api/workspaces`         | Tạo workspace mới        |
| GET    | `/api/workspaces/:id`     | Chi tiết workspace       |
| PUT    | `/api/workspaces/:id`     | Cập nhật workspace       |
| DELETE | `/api/workspaces/:id`     | Xoá workspace            |

### Target

| Method | Endpoint                                   | Mô tả                    |
|--------|--------------------------------------------|--------------------------|
| GET    | `/api/workspaces/:id/targets`              | Danh sách target         |
| POST   | `/api/workspaces/:id/targets`              | Thêm một target          |
| POST   | `/api/workspaces/:id/targets/bulk`         | Import nhiều domain      |
| GET    | `/api/workspaces/:id/targets/:tid`         | Chi tiết target          |
| PUT    | `/api/workspaces/:id/targets/:tid`         | Cập nhật target          |
| DELETE | `/api/workspaces/:id/targets/:tid`         | Xoá target               |

---

## Tài liệu chi tiết

| Tài liệu                                        | Nội dung                                         |
|-------------------------------------------------|--------------------------------------------------|
| [docs/frontend-design.md](docs/frontend-design.md) | Kiến trúc frontend, styling, patterns, quy ước |
| [docs/backend-design.md](docs/backend-design.md)   | Kiến trúc Go backend, handler/repo pattern, SQL |
| [docs/worker-design.md](docs/worker-design.md)     | Python workers, dispatcher, tool runner pattern  |
| [docs/architecture.md](docs/architecture.md)       | Kiến trúc tổng thể, luồng dữ liệu, job types    |
| [docs/database-schema.md](docs/database-schema.md) | Toàn bộ schema PostgreSQL                       |
| [docs/adapter-pattern.md](docs/adapter-pattern.md) | Thiết kế BaseToolAdapter + BasePentestAdapter    |
| [docs/fuzzing-wordlist.md](docs/fuzzing-wordlist.md) | Hệ thống fuzzing, wordlist management          |
| [TASKS.md](TASKS.md)                               | Danh sách task và tiến độ phát triển             |

---

## Roadmap

```
Phase 1 — Foundation          ████████████████ 100%  ✓ Workspace + Target CRUD
Phase 2 — Recon Pipeline      ░░░░░░░░░░░░░░░░   0%  Job queue, subdomain, port, web probe, CVE
Phase 3 — Fuzzing             ░░░░░░░░░░░░░░░░   0%  Wordlist management, fuzz jobs
Phase 4 — Pentest Modules     ░░░░░░░░░░░░░░░░   0%  Framework detection, adapters
Phase 5 — Frontend            ████░░░░░░░░░░░░  25%  Workspace/Target pages xong, còn lại chưa
Phase 6 — Interactive Shell   ░░░░░░░░░░░░░░░░   0%  WebSocket terminal (FTP, SMB, LDAP)
```

# Backend Design — RTI V2

Tài liệu mô tả kiến trúc, convention và triết lý triển khai của backend Go. Dev mới đọc xong có thể tự thêm endpoint mà không phá vỡ tính nhất quán.

---

## Mục lục

- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bootstrap & Middleware](#bootstrap--middleware)
- [Kiến trúc 3 tầng](#kiến-trúc-3-tầng)
- [API & Response Format](#api--response-format)
- [Models & Entities](#models--entities)
- [Handler Pattern](#handler-pattern)
- [Repository Pattern](#repository-pattern)
- [SQL Patterns](#sql-patterns)
- [Queue System](#queue-system)
- [Database Migrations](#database-migrations)
- [Naming Conventions](#naming-conventions)
- [Thêm entity mới](#thêm-entity-mới)
- [Những điều KHÔNG nên làm](#những-điều-không-nên-làm)

---

## Tech Stack

| Thành phần | Công nghệ | Lý do |
|-----------|-----------|-------|
| Framework | Fiber v2 | Hiệu năng cao, cú pháp gần Express |
| DB Driver | pgx v5 | Connection pool tích hợp, type-safe |
| Redis | go-redis v9 | Redis Streams support đơn giản |
| UUID | google/uuid | Distributed-friendly IDs |
| Env | joho/godotenv | Load `.env` khi dev |

Không có ORM — SQL được viết tay trong repository layer.

---

## Cấu trúc thư mục

```
backend/
├── cmd/server/
│   └── main.go                    # Entrypoint duy nhất
├── internal/
│   ├── api/
│   │   ├── routes.go              # Đăng ký toàn bộ routes
│   │   ├── middleware/
│   │   │   └── cors.go
│   │   └── handlers/
│   │       ├── workspace_handler.go
│   │       ├── target_handler.go
│   │       ├── job_handler.go
│   │       ├── subdomain_handler.go
│   │       ├── port_handler.go
│   │       ├── service_category_handler.go
│   │       ├── web_probe_handler.go
│   │       └── finding_handler.go
│   ├── models/
│   │   ├── workspace.go
│   │   ├── target.go
│   │   ├── job.go
│   │   ├── subdomain.go
│   │   ├── port.go
│   │   ├── service_category.go
│   │   ├── web_probe.go
│   │   └── finding.go
│   └── repository/
│       ├── workspace_repo.go
│       ├── target_repo.go
│       ├── job_repo.go
│       ├── subdomain_repo.go
│       ├── port_repo.go
│       ├── service_category_repo.go
│       ├── web_probe_repo.go
│       └── finding_repo.go
├── migrations/
│   ├── 000001_init.up.sql
│   ├── 000002_jobs.up.sql
│   ├── 000003_ports.up.sql
│   ├── 000004_history_model.up.sql
│   ├── 000005_service_category.up.sql
│   ├── 000006_web_probes.up.sql
│   └── 000007_findings.up.sql
└── pkg/
    ├── config/config.go           # Env vars
    ├── database/
    │   ├── postgres.go            # pgxpool setup
    │   └── redis.go               # Redis client
    └── queue/
        └── producer.go            # Redis Streams producer
```

**Quy tắc đặt file:**
- Handler: `{entity}_handler.go`
- Repository: `{entity}_repo.go`
- Model: `{entity}.go` (cùng tên entity)
- Package `internal/` — không export ra ngoài module
- Package `pkg/` — infrastructure, có thể tái sử dụng

---

## Bootstrap & Middleware

`cmd/server/main.go` thực hiện theo thứ tự:

```
godotenv.Load()           // Load .env (bỏ qua nếu không có file)
config.Load()             // Parse env vars → struct
database.NewPool()        // Kết nối PostgreSQL pool
database.NewRedisClient() // Kết nối Redis
queue.NewProducer()       // Khởi tạo job producer
fiber.New()               // Tạo Fiber app
SetupRoutes()             // Đăng ký routes + inject dependencies
app.Listen(:PORT)         // Bắt đầu lắng nghe
```

**Middleware stack** (theo thứ tự):

| Middleware | Mục đích |
|-----------|---------|
| CORS | Allow `*`, methods GET/POST/PUT/DELETE/OPTIONS |
| Logger | `[time] METHOD /path → status latency` |
| Error Handler | Map Fiber errors → `{"error": "message"}` |

**Env vars cần thiết:**

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `PORT` | `8080` | HTTP port |

---

## Kiến trúc 3 tầng

```
HTTP Request
    │
    ▼
┌─────────────┐
│   Handler   │  Parse request, validate, format response
└──────┬──────┘
       │ gọi
       ▼
┌─────────────┐
│ Repository  │  SQL queries, không biết gì về HTTP
└──────┬──────┘
       │ gọi
       ▼
┌─────────────┐
│  pgxpool    │  Connection pool, PostgreSQL
└─────────────┘
```

**Nguyên tắc:**
- Handler **không** viết SQL. Repository **không** biết HTTP status code.
- Dependency được inject qua constructor, không dùng global variable.
- `c.Context()` được truyền từ handler xuống repo để timeout HTTP request lan xuống DB query.

---

## API & Response Format

### Toàn bộ endpoints

```
GET    /api/health

# Service Categories (global — không thuộc workspace)
GET    /api/service-categories
POST   /api/service-categories
PUT    /api/service-categories/:id
DELETE /api/service-categories/:id

# Workspace
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:id
PUT    /api/workspaces/:id
DELETE /api/workspaces/:id

# Target
GET    /api/workspaces/:wsid/targets
POST   /api/workspaces/:wsid/targets
POST   /api/workspaces/:wsid/targets/bulk
GET    /api/workspaces/:wsid/targets/:id
PUT    /api/workspaces/:wsid/targets/:id
DELETE /api/workspaces/:wsid/targets/:id

# Job
GET    /api/workspaces/:wsid/jobs
POST   /api/workspaces/:wsid/jobs
GET    /api/workspaces/:wsid/jobs/:id

# Subdomain (append-only history)
GET    /api/workspaces/:wsid/subdomains
GET    /api/workspaces/:wsid/subdomains/history?domain=xxx

# Port (append-only history)
GET    /api/workspaces/:wsid/ports
GET    /api/workspaces/:wsid/ports/history?host=xxx
PATCH  /api/workspaces/:wsid/ports/:port_id/service

# Web Probe (append-only history)
GET    /api/workspaces/:wsid/web-probes
GET    /api/workspaces/:wsid/web-probes/history?host=xxx

# Findings (mutable — CRUD)
GET    /api/workspaces/:wsid/findings?severity=&type=&status=
POST   /api/workspaces/:wsid/findings
GET    /api/workspaces/:wsid/findings/:id
PUT    /api/workspaces/:wsid/findings/:id
PATCH  /api/workspaces/:wsid/findings/:id/status
DELETE /api/workspaces/:wsid/findings/:id
```

**Notes về response của Findings List:**
```json
{
  "data": [...],
  "total": 12,
  "stats": {
    "critical": 1, "high": 3, "medium": 5, "low": 2, "info": 1
  }
}
```
`stats` chỉ đếm findings có `status != 'false_positive'`.

### Response format chuẩn

**Tất cả response** phải theo format này — không được tự ý thêm key bên ngoài:

```json
// List thành công
{ "data": [...] }

// Single entity thành công
{ "data": { ... } }

// Tạo mới thành công (HTTP 201)
{ "data": { ... } }

// Xoá thành công
{ "message": "đã xóa workspace" }

// Bulk create
{ "data": [...], "total": 10, "created": 8, "skipped": 2 }

// Lỗi (mọi HTTP 4xx/5xx)
{ "error": "mô tả lỗi bằng tiếng Việt" }
```

### HTTP status mapping

| Tình huống | Status |
|-----------|--------|
| GET/PUT thành công | 200 |
| POST tạo mới | 201 |
| DELETE thành công | 200 |
| Body parse fail | 400 |
| Validation fail | 400 |
| Không tìm thấy | 404 |
| Trùng lặp (unique) | 409 |
| DB error | 500 |

---

## Models & Entities

### Workspace

```go
type Workspace struct {
    ID          string    `json:"id"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    Color       string    `json:"color"`         // Hex, default #7c3aed
    TargetCount int       `json:"target_count"`  // Computed từ JOIN
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}
```

### Target

```go
type Target struct {
    ID          string    `json:"id"`
    WorkspaceID string    `json:"workspace_id"`
    Domain      string    `json:"domain"`
    IPAddress   *string   `json:"ip_address"`    // INET, nullable
    Notes       string    `json:"notes"`
    IsActive    bool      `json:"is_active"`     // Default: true
    CreatedAt   time.Time `json:"created_at"`
}
```

### Job

```go
type Job struct {
    ID           uuid.UUID  `json:"id"`
    WorkspaceID  uuid.UUID  `json:"workspace_id"`
    TargetID     *uuid.UUID `json:"target_id"`    // Optional
    JobType      string     `json:"job_type"`
    Status       string     `json:"status"`        // pending|running|completed|failed|cancelled
    Payload      []byte     `json:"payload"`       // JSONB — input
    Result       []byte     `json:"result"`        // JSONB — output
    ErrorMessage *string    `json:"error_message"`
    StartedAt    *time.Time `json:"started_at"`
    FinishedAt   *time.Time `json:"finished_at"`
    CreatedAt    time.Time  `json:"created_at"`
    UpdatedAt    time.Time  `json:"updated_at"`
}

// Job types được validate tại handler
var ValidJobTypes = map[string]bool{
    "RECON_SUBDOMAIN": true,
    "SCAN_PORT":       true,
    "SCAN_WEB_INFO":   true,
    "SCAN_CVE":        true,
    "FUZZ_DIR":        true,
    // ...
}
```

### Subdomain

```go
type Subdomain struct {
    ID          uuid.UUID  `json:"id"`
    WorkspaceID uuid.UUID  `json:"workspace_id"`
    TargetID    uuid.UUID  `json:"target_id"`
    JobID       *uuid.UUID `json:"job_id"`
    Domain      string     `json:"domain"`
    IPAddresses []string   `json:"ip_addresses"` // TEXT[] — nhiều IP (CDN, round-robin)
    Sources     []string   `json:"sources"`       // ["subfinder", "crtsh", ...]
    IsAlive     *bool      `json:"is_alive"`      // NULL cho đến khi port scan
    HTTPStatus  *int       `json:"http_status"`
    Title       *string    `json:"title"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
}
```

### Port

```go
type Port struct {
    ID              uuid.UUID  `json:"id"`
    WorkspaceID     uuid.UUID  `json:"workspace_id"`
    TargetID        *uuid.UUID `json:"target_id"`
    JobID           *uuid.UUID `json:"job_id"`
    Host            string     `json:"host"`              // Domain hoặc IP
    IPAddress       *string    `json:"ip_address"`        // Resolved IP
    Port            int        `json:"port"`              // 1-65535
    Protocol        string     `json:"protocol"`          // tcp | udp
    State           string     `json:"state"`             // open | closed | filtered
    ServiceName     *string    `json:"service_name"`      // http | ssh | mysql | ...
    ServiceCategory *string    `json:"service_category"`  // web | mail | remote | database | other
    Banner          *string    `json:"banner"`
    CreatedAt       time.Time  `json:"created_at"`
    UpdatedAt       time.Time  `json:"updated_at"`
}
```

### WebProbe

```go
type WebProbe struct {
    ID             uuid.UUID  `json:"id"`
    WorkspaceID    uuid.UUID  `json:"workspace_id"`
    TargetID       *uuid.UUID `json:"target_id"`
    JobID          *uuid.UUID `json:"job_id"`
    Host           string     `json:"host"`
    Port           int        `json:"port"`
    URL            string     `json:"url"`            // URL cuối sau redirect
    Scheme         *string    `json:"scheme"`         // http | https
    StatusCode     *int       `json:"status_code"`
    Title          *string    `json:"title"`
    WebServer      *string    `json:"web_server"`
    Technologies   []string   `json:"technologies"`
    ContentType    *string    `json:"content_type"`
    ContentLength  *int       `json:"content_length"`
    ResponseTime   *string    `json:"response_time"`
    IPAddress      *string    `json:"ip_address"`
    IsAlive        bool       `json:"is_alive"`
    CreatedAt      time.Time  `json:"created_at"`
    UpdatedAt      time.Time  `json:"updated_at"`
}
```

### Finding

```go
type Finding struct {
    ID          uuid.UUID  `json:"id"`
    WorkspaceID uuid.UUID  `json:"workspace_id"`
    TargetID    *uuid.UUID `json:"target_id"`
    JobID       *uuid.UUID `json:"job_id"`
    Title       string     `json:"title"`
    Severity    string     `json:"severity"`     // critical|high|medium|low|info
    Type        string     `json:"type"`         // vulnerability|misconfiguration|exposure|credential|informational
    Status      string     `json:"status"`       // open|confirmed|false_positive|fixed
    CVEID       *string    `json:"cve_id"`       // CVE-YYYY-NNNN (optional)
    CVSSScore   *float64   `json:"cvss_score"`   // 0.0-10.0 (optional)
    Host        *string    `json:"host"`
    URL         *string    `json:"url"`
    Port        *int       `json:"port"`
    Evidence    *string    `json:"evidence"`
    Source      *string    `json:"source"`
    Remediation *string    `json:"remediation"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
}
```

---

## Handler Pattern

Mỗi handler struct nhận repo qua constructor (Dependency Injection):

```go
type WorkspaceHandler struct {
    repo *repository.WorkspaceRepo
}

func NewWorkspaceHandler(repo *repository.WorkspaceRepo) *WorkspaceHandler {
    return &WorkspaceHandler{repo: repo}
}
```

### Template một method handler

```go
func (h *WorkspaceHandler) Create(c *fiber.Ctx) error {
    // 1. Parse body
    req := new(models.CreateWorkspaceRequest)
    if err := c.BodyParser(req); err != nil {
        return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
    }

    // 2. Validate
    if strings.TrimSpace(req.Name) == "" {
        return fiber.NewError(fiber.StatusBadRequest, "name là bắt buộc")
    }

    // 3. Gọi repo (truyền context để propagate timeout)
    ws, err := h.repo.Create(c.Context(), req)
    if err != nil {
        if strings.Contains(err.Error(), "unique") {
            return fiber.NewError(fiber.StatusConflict, "workspace đã tồn tại")
        }
        return fiber.NewError(fiber.StatusInternalServerError, err.Error())
    }

    // 4. Return
    return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": ws})
}
```

### Kiểm tra lỗi từ repository

```go
// 404
if strings.Contains(err.Error(), "no rows") ||
   strings.Contains(err.Error(), "not found") {
    return fiber.NewError(fiber.StatusNotFound, "không tìm thấy")
}

// 409
if strings.Contains(err.Error(), "unique") ||
   strings.Contains(err.Error(), "duplicate") {
    return fiber.NewError(fiber.StatusConflict, "đã tồn tại")
}

// 500 — mọi lỗi còn lại
return fiber.NewError(fiber.StatusInternalServerError, err.Error())
```

### JobHandler — Non-blocking queue

`JobHandler` là handler duy nhất có thêm `producer`:

```go
type JobHandler struct {
    repo     *repository.JobRepo
    producer *queue.Producer
}

func (h *JobHandler) Create(c *fiber.Ctx) error {
    // ... validate job_type với ValidJobTypes map

    job, err := h.repo.Create(c.Context(), ...)   // INSERT → status=pending
    if err != nil { /* return 500 */ }

    // Enqueue NON-BLOCKING — nếu Redis lỗi, log nhưng vẫn trả 201
    if err := h.producer.Enqueue(c.Context(), job.ID.String(), job.JobType, payload); err != nil {
        c.Locals("queue_error", err.Error())
    }

    return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": job})
}
```

**Tại sao non-blocking:** API trả về ngay sau khi ghi DB. Worker xử lý bất đồng bộ. Frontend poll `GET /jobs/:id` để theo dõi tiến trình.

---

## Repository Pattern

```go
type WorkspaceRepo struct {
    db *pgxpool.Pool
}

func NewWorkspaceRepo(db *pgxpool.Pool) *WorkspaceRepo {
    return &WorkspaceRepo{db: db}
}

func (r *WorkspaceRepo) List(ctx context.Context) ([]models.Workspace, error) {
    rows, err := r.db.Query(ctx, sql)
    if err != nil {
        return nil, fmt.Errorf("list workspaces: %w", err)
    }
    defer rows.Close()

    var result []models.Workspace
    for rows.Next() {
        var ws models.Workspace
        if err := rows.Scan(&ws.ID, &ws.Name, ...); err != nil {
            return nil, fmt.Errorf("scan workspace: %w", err)
        }
        result = append(result, ws)
    }
    return result, nil
}
```

**Quy tắc:**
- Luôn `defer rows.Close()` ngay sau `Query()`
- Wrap lỗi với `fmt.Errorf("context: %w", err)` để handler có thể check string
- Truyền `ctx` từ handler xuống mọi DB call — không dùng `context.Background()`
- Không trả về `nil, nil` — nếu không có kết quả, trả về `[]T{}` hoặc `error`

---

## SQL Patterns

### INSERT với RETURNING

```sql
INSERT INTO workspaces (name, description, color)
VALUES ($1, $2, $3)
RETURNING id, name, description, color, created_at, updated_at
```

Dùng `QueryRow()` + `Scan()` để lấy lại entity vừa tạo.

### UPDATE với RETURNING

```sql
UPDATE workspaces
SET name = $2, description = $3, color = $4, updated_at = NOW()
WHERE id = $1
RETURNING id, name, description, color, created_at, updated_at
```

### DELETE với kiểm tra RowsAffected

```sql
DELETE FROM targets WHERE id = $1 AND workspace_id = $2
```

```go
tag, err := r.db.Exec(ctx, sql, id, wsID)
if tag.RowsAffected() == 0 {
    return fmt.Errorf("target not found")
}
```

### JOIN để tính computed field

```sql
SELECT w.id, w.name, w.description, w.color,
       COUNT(t.id) AS target_count,
       w.created_at, w.updated_at
FROM workspaces w
LEFT JOIN targets t ON t.workspace_id = w.id
GROUP BY w.id
ORDER BY w.created_at DESC
```

### Bulk INSERT với ON CONFLICT DO NOTHING

```sql
INSERT INTO targets (workspace_id, domain, notes)
VALUES ($1, $2, $3)
ON CONFLICT (workspace_id, domain) DO NOTHING
RETURNING id, workspace_id, domain, notes, is_active, created_at
```

Dùng trong `BulkCreate` — bỏ qua silently các domain đã tồn tại.

### DISTINCT ON — lấy trạng thái mới nhất

Đây là pattern cốt lõi của mô hình append-only history:

```sql
SELECT DISTINCT ON (domain)
       id, workspace_id, target_id, job_id,
       domain, ip_addresses, sources, is_alive,
       http_status, title, created_at, updated_at
FROM subdomains
WHERE workspace_id = $1
ORDER BY domain, created_at DESC
```

`DISTINCT ON (domain)` giữ lại **một row duy nhất** cho mỗi giá trị `domain` — row đầu tiên theo `ORDER BY`, tức là `created_at DESC` → record mới nhất.

**Lưu ý PostgreSQL:** Columns trong `ORDER BY` phải bắt đầu bằng columns trong `DISTINCT ON`.

### History query

```sql
-- Subdomains: toàn bộ lịch sử một domain
SELECT id, workspace_id, ..., created_at
FROM subdomains
WHERE workspace_id = $1 AND domain = $2
ORDER BY created_at DESC

-- Ports: toàn bộ lịch sử một host, sorted by time rồi port
SELECT id, workspace_id, ..., created_at
FROM ports
WHERE workspace_id = $1 AND host = $2
ORDER BY created_at DESC, port ASC
```

Trả về **toàn bộ** records — frontend tự group theo `job_id` để tạo "phiên scan" trong history drawer.

**Lưu ý port history:** Nhiều port records có cùng `job_id` (cùng 1 lần scan). Frontend group chúng lại thành 1 session để hiển thị: "Phiên T1: port 80, 443 — Phiên T2: port 80, 443, 8443".

---

## Queue System

### Redis Streams Producer

```go
// pkg/queue/producer.go
const StreamName = "rti:jobs"

func (p *Producer) Enqueue(ctx context.Context, jobID, jobType string, payload any) error {
    data, _ := json.Marshal(payload)
    return p.rdb.XAdd(ctx, &redis.XAddArgs{
        Stream: StreamName,
        Values: map[string]any{
            "job_id":   jobID,
            "job_type": jobType,
            "payload":  string(data),
        },
    }).Err()
}
```

### Luồng xử lý job

```
POST /api/workspaces/:wsid/jobs
  │
  ├─ INSERT jobs (status=pending)          ← DB
  ├─ XAdd rti:jobs {job_id, job_type, ...} ← Redis (non-blocking)
  └─ Return 201 {data: job}

[Python Worker — container riêng]
  ├─ XREADGROUP rti:jobs (block 5s)
  ├─ UPDATE jobs SET status=running
  ├─ Chạy tool (subfinder/naabu/...)
  ├─ INSERT subdomains/ports (append-only)
  ├─ UPDATE jobs SET status=completed, result=...
  └─ XACK rti:jobs

[Frontend]
  └─ Poll GET /jobs/:id mỗi 3s → xem tiến trình
```

---

## Database Migrations

Migrations chạy tự động khi PostgreSQL container khởi động (mount vào `docker-entrypoint-initdb.d`).

### 000001_init — Core tables

Tạo `workspaces`, `targets`. Trigger `update_updated_at()` tự cập nhật `updated_at` khi UPDATE.

### 000002_jobs — Jobs & Subdomains

Tạo `jobs` (với ENUM `job_status`, `job_type`) và `subdomains`. Ban đầu có `UNIQUE(workspace_id, domain)`.

### 000003_ports — Port scan results

Tạo `ports`. Ban đầu có `UNIQUE(workspace_id, host, port, protocol)`.

### 000004_history_model — Append-only

```sql
-- Xoá UNIQUE constraints để cho phép nhiều rows cùng entity
ALTER TABLE subdomains DROP CONSTRAINT subdomains_workspace_id_domain_key;
ALTER TABLE ports      DROP CONSTRAINT ports_workspace_id_host_port_protocol_key;

-- Index cho DISTINCT ON query (latest state)
CREATE INDEX idx_subdomains_domain_latest
    ON subdomains(workspace_id, domain, created_at DESC);

-- Index cho history query
CREATE INDEX idx_subdomains_domain_history
    ON subdomains(workspace_id, domain);
```

### 000005_service_category — Port categorization

Tạo bảng `service_categories` và thêm cột `service_category` vào bảng `ports`. Service category (web, mail, remote, database, other) dùng để lọc ports khi chọn mục tiêu cho từng scan module.

### 000006_web_probes — Web probe results

Tạo bảng `web_probes` (append-only). DISTINCT ON `(host, port)` ORDER BY `created_at DESC` để lấy trạng thái mới nhất. Xem chi tiết schema ở `docs/database-schema.md`.

### 000007_findings — Vulnerability tracker

Tạo bảng `findings` (mutable — có thể UPDATE status). CVE là optional field trên finding, không phải entity riêng. Severity được sort theo rank (critical > high > medium > low > info) trong `FindingRepo.List()`.

**Thứ tự migration quan trọng.** Không thay đổi file cũ — chỉ thêm file mới.

---

## Naming Conventions

### Files & Packages

```
handlers/workspace_handler.go   → package handlers
repository/workspace_repo.go    → package repository
models/workspace.go             → package models
pkg/config/config.go            → package config
```

### Types

| Pattern | Ví dụ |
|---------|-------|
| Entity struct | `Workspace`, `Target`, `Job` |
| Request struct | `CreateWorkspaceRequest`, `UpdateTargetRequest` |
| Handler | `WorkspaceHandler` |
| Repo | `WorkspaceRepo` |
| Constructor | `NewWorkspaceHandler(repo)`, `NewWorkspaceRepo(db)` |

### Variables

```go
// Handler method params
func (h *WorkspaceHandler) List(c *fiber.Ctx) error  // c = Fiber context
func (r *WorkspaceRepo) List(ctx context.Context)    // ctx = Go context

// Common short names
wsID  // workspace ID (UUID)
tID   // target ID
req   // request body struct
ws    // workspace entity
```

### Messages

Tất cả error message và response message viết **tiếng Việt**:

```go
fiber.NewError(400, "name là bắt buộc")
fiber.NewError(404, "không tìm thấy workspace")
fiber.NewError(409, "domain đã tồn tại trong workspace này")
fiber.Map{"message": "đã xóa target thành công"}
```

---

## Thêm entity mới

Pattern chuẩn để thêm entity mới (ví dụ `SomeEntity`):

**Bước 1 — Migration** (`migrations/00000N_some_entity.up.sql`)

```sql
CREATE TABLE some_entities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
    -- ... entity fields
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_some_entities_workspace ON some_entities(workspace_id, created_at DESC);
```

**Bước 2 — Model** (`internal/models/some_entity.go`)

```go
package models

type SomeEntity struct {
    ID          uuid.UUID  `json:"id"`
    WorkspaceID uuid.UUID  `json:"workspace_id"`
    JobID       *uuid.UUID `json:"job_id"`
    // ... fields
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
}
```

**Bước 3 — Repository** (`internal/repository/some_entity_repo.go`)

```go
package repository

type SomeEntityRepo struct{ db *pgxpool.Pool }

func NewSomeEntityRepo(db *pgxpool.Pool) *SomeEntityRepo { ... }

func (r *SomeEntityRepo) List(ctx context.Context, wsID uuid.UUID) ([]models.SomeEntity, error) { ... }
func (r *SomeEntityRepo) Create(ctx context.Context, wsID uuid.UUID, ...) (models.SomeEntity, error) { ... }
```

**Bước 4 — Handler** (`internal/api/handlers/some_entity_handler.go`)

```go
package handlers

type SomeEntityHandler struct{ repo *repository.SomeEntityRepo }

func NewSomeEntityHandler(repo *repository.SomeEntityRepo) *SomeEntityHandler { ... }
func (h *SomeEntityHandler) List(c *fiber.Ctx) error   { ... }
func (h *SomeEntityHandler) Create(c *fiber.Ctx) error { ... }
```

**Bước 5 — Routes** (`internal/api/routes.go`)

```go
// Thêm param vào SetupRoutes
someRepo    := repository.NewSomeEntityRepo(pool)
someH       := handlers.NewSomeEntityHandler(someRepo)

ws.Get( "/:wsid/some-entities",     someH.List)
ws.Post("/:wsid/some-entities",     someH.Create)
```

**Bước 6 — Wire trong `cmd/server/main.go`**

```go
someRepo := repository.NewSomeEntityRepo(pool)
api.SetupRoutes(app, ..., someRepo, producer)
```

---

## Những điều KHÔNG nên làm

- **Không** viết SQL trong handler — chỉ viết trong repository
- **Không** dùng `context.Background()` trong repo — nhận `ctx` từ handler
- **Không** dùng global variable — inject dependency qua constructor
- **Không** bỏ `defer rows.Close()` sau `Query()`
- **Không** trả về response format tự ý — phải theo `{"data": ...}` hoặc `{"error": ...}`
- **Không** bắt lỗi bằng type assertion — dùng `strings.Contains(err.Error(), "...")`
- **Không** thêm migration mới bằng cách sửa file cũ — tạo file mới với số tiếp theo
- **Không** viết message tiếng Anh trong response — dùng tiếng Việt
- **Không** block API vì queue fail — job queue là non-blocking

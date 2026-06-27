# Worker Design — RTI V2

Tài liệu mô tả kiến trúc, triết lý và convention của Python workers. Dev mới đọc xong có thể tự thêm job type mới mà không phá vỡ tính nhất quán.

---

## Mục lục

- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Tổng quan hệ thống](#tổng-quan-hệ-thống)
- [Dispatcher — Event Loop](#dispatcher--event-loop)
- [BaseJobHandler — Contract](#basejobhandler--contract)
- [Job Lifecycle](#job-lifecycle)
- [Database Layer](#database-layer)
- [Tool Runner Pattern](#tool-runner-pattern)
- [Workers hiện tại](#workers-hiện-tại)
- [Docker & Capabilities](#docker--capabilities)
- [Naming Conventions](#naming-conventions)
- [Thêm job type mới](#thêm-job-type-mới)
- [Những điều KHÔNG nên làm](#những-điều-không-nên-làm)

---

## Tech Stack

| Thành phần | Công nghệ | Lý do |
|-----------|-----------|-------|
| Language | Python 3.13 | Hệ sinh thái bảo mật phong phú |
| Queue | redis-py (Redis Streams xreadgroup) | Durable, distributed, persistent |
| Database | psycopg2-binary | Trưởng thành, hỗ trợ TEXT[] array |
| External tools | subprocess | Chạy Go binaries (subfinder, naabu) |

Không có async framework (asyncio, Celery) — blocking subprocess là intentional vì mỗi container chỉ xử lý 1 job tại một thời điểm.

---

## Cấu trúc thư mục

```
workers/
├── main.py                    # Entrypoint: đăng ký handlers, start dispatcher
├── requirements.txt
├── core/
│   ├── config.py              # Env vars + hằng số
│   ├── base_handler.py        # Abstract class cho mọi job handler
│   ├── dispatcher.py          # Redis Streams consumer loop
│   └── db.py                  # Tất cả DB functions (append-only model)
└── recon/
    ├── subdomain_worker.py    # RECON_SUBDOMAIN
    └── port_worker.py         # SCAN_PORT
```

**Quy tắc tổ chức:**
- `core/` — infrastructure dùng chung, không chứa business logic của từng tool
- `recon/` — workers cho recon pipeline
- Tương lai: `fuzzing/`, `pentest/` cho các pipeline khác
- Mỗi worker nằm trong 1 file, 1 class

---

## Tổng quan hệ thống

```
┌─────────────────────────────────────────────────────────┐
│  Go Backend                                             │
│  POST /api/.../jobs                                     │
│    → INSERT jobs (status=pending)                       │
│    → XAdd rti:jobs {job_id, job_type, payload}          │
└──────────────────────────┬──────────────────────────────┘
                           │ Redis Stream
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Dispatcher (main.py)                                   │
│  XREADGROUP rti:jobs BLOCK 5000                         │
│    → route theo job_type → handler.handle()             │
└──────────────────────────┬──────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  SubdomainWorker    PortWorker         (future)
  RECON_SUBDOMAIN    SCAN_PORT          SCAN_WEB_INFO
  subfinder          naabu              httpx
         │                 │
         ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL (append-only)                               │
│  INSERT subdomains / INSERT ports                       │
│  UPDATE jobs SET status, result                         │
└─────────────────────────────────────────────────────────┘
```

---

## Dispatcher — Event Loop

`core/dispatcher.py` là trái tim của hệ thống.

### Khởi tạo

```python
dispatcher = Dispatcher()
# Kết nối Redis từ config.REDIS_URL
# Tạo consumer group "workers" trên stream "rti:jobs"
# Nếu group đã tồn tại → bỏ qua (BUSYGROUP)
```

### Đăng ký handler

```python
dispatcher.register(SubdomainWorker())
dispatcher.register(PortWorker())
# Mỗi handler khai báo job_types() → dispatcher map job_type → handler
```

### Main loop

```python
while self._running:
    messages = rdb.xreadgroup(
        groupname = "workers",
        consumername = config.WORKER_ID,   # Unique per container
        streams = {"rti:jobs": ">"},       # ">" = chỉ messages chưa deliver
        count = 1,                         # Xử lý 1 message/lần
        block = 5000                       # Block 5s nếu queue trống
    )
    for msg_id, data in messages:
        self._process(msg_id, data)
```

**`WORKER_ID` unique per container** — quan trọng khi scale horizontally (nhiều worker containers). Mỗi message chỉ deliver đến 1 consumer trong group.

### Xử lý message

```python
def _process(self, msg_id, data):
    job_id   = data["job_id"]
    job_type = data["job_type"]
    payload  = json.loads(data["payload"])

    handler = self._handlers.get(job_type)
    if not handler:
        self._ack(msg_id)   # ACK ngay — không biết xử lý thì bỏ qua
        return

    try:
        db.update_job_status(job_id, "running")
        result = handler.handle(job_id, job_type, payload)
        db.update_job_status(job_id, "completed", result=result)
    except Exception as e:
        db.update_job_status(job_id, "failed", error=str(e))
    finally:
        self._ack(msg_id)   # ACK LUÔN LUÔN — không có retry tự động
```

**Tại sao không retry:** Lỗi được ghi vào DB (`error_message`). User có thể xem lỗi trên UI và submit lại job. Retry tự động phức tạp hóa hệ thống mà không giải quyết root cause.

### Graceful shutdown

Signal `SIGINT` / `SIGTERM` → `_running = False` → loop exit tự nhiên.

---

## BaseJobHandler — Contract

Mọi worker đều phải kế thừa `BaseJobHandler`:

```python
from core.base_handler import BaseJobHandler

class BaseJobHandler(ABC):
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def job_types(self) -> list[str]:
        """Danh sách job_type mà handler này xử lý."""

    @abstractmethod
    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        """
        Xử lý job. Dispatcher gọi method này.

        - Return dict: serializable → lưu vào jobs.result
        - Raise Exception: job bị mark failed, message lưu vào jobs.error_message
        """
```

**Logger tự động:** `self.logger` được tạo với tên class. Log của `SubdomainWorker` có prefix `SubdomainWorker`, của `PortWorker` có prefix `PortWorker` — dễ filter trong stdout.

---

## Job Lifecycle

```
[Backend] POST /api/.../jobs
    │
    ├─ INSERT jobs (status="pending")
    └─ XAdd rti:jobs

[Dispatcher] nhận message
    │
    ├─ db.update_job_status(job_id, "running")   → started_at = NOW()
    │
    ├─ handler.handle(...)
    │       │
    │       ├─ SUCCESS → return dict result
    │       │       └─ db.update_job_status("completed", result=...)  → finished_at = NOW()
    │       │
    │       └─ EXCEPTION → raise
    │               └─ db.update_job_status("failed", error=str(e))  → finished_at = NOW()
    │
    └─ XACK rti:jobs (luôn luôn)

[Frontend] poll GET /api/.../jobs/:id mỗi 3s
    └─ Banner hiển thị: pending → running → completed/failed
```

---

## Database Layer

`core/db.py` là **toàn bộ** tầng DB của workers. Không có ORM, không có model class — chỉ là functions.

### Model: Append-Only

Dữ liệu thu thập (subdomains, ports) **không bao giờ bị UPDATE hay DELETE**. Mỗi lần scan = rows mới độc lập.

UI dùng `DISTINCT ON (domain) ORDER BY domain, created_at DESC` để lấy trạng thái mới nhất. History endpoint trả về tất cả rows.

### `update_job_status()`

```python
update_job_status(job_id, status, result=None, error=None)
```

**Table `jobs` là mutable** — đây là exception duy nhất với append-only model. Job chỉ có 1 row, cần update status theo thời gian.

```sql
UPDATE jobs
SET status = %s,
    started_at  = NOW()   -- chỉ khi status="running"
    finished_at = NOW()   -- khi status in (completed, failed, cancelled)
    result       = %s,    -- nếu có
    error_message = %s    -- nếu có
WHERE id = %s
```

### `insert_subdomains()`

```python
insert_subdomains(workspace_id, target_id, job_id, subdomains: list[dict])
# subdomains = [{"domain": "api.example.com", "ip_addresses": [], "sources": ["crtsh"]}]
```

Dùng bởi **SubdomainWorker** sau khi subfinder chạy xong. Pure INSERT, không ON CONFLICT.

### `insert_subdomain_observations()`

```python
insert_subdomain_observations(workspace_id, target_id, job_id, observations: list[dict])
# observations = [{"domain": "api.example.com", "is_alive": True, "ip_addresses": ["1.2.3.4", "5.6.7.8"]}]
```

Dùng bởi **PortWorker** — ghi lại trạng thái alive/dead và IPs vào bảng `subdomains`. Source = `["naabu"]`.

**`ip_addresses` là list** — một domain có thể có nhiều A records (CDN, load balancer, round-robin DNS). Lưu tất cả.

### `get_subdomains_by_target()`

```python
get_subdomains_by_target(workspace_id, target_id) -> list[str]
```

```sql
SELECT DISTINCT ON (domain) domain
FROM subdomains
WHERE workspace_id = %s AND target_id = %s
ORDER BY domain, created_at DESC
```

Dùng bởi **PortWorker** để lấy danh sách hosts cần scan. DISTINCT ON đảm bảo mỗi domain chỉ xuất hiện 1 lần dù có nhiều historical rows.

### `insert_ports()`

```python
insert_ports(workspace_id, target_id, job_id, ports: list[dict])
# ports = [{"host": "api.example.com", "ip_address": "1.2.3.4", "port": 443, "protocol": "tcp", ...}]
```

Pure INSERT, không ON CONFLICT. Mỗi port result từ naabu là 1 row riêng.

---

## Tool Runner Pattern

Cả 2 workers hiện tại đều theo cùng 1 pattern cho external tool:

```python
def _run_tool(self, ...):
    # 1. Tạo temp files
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        hosts_file = f.name

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        out_file = f.name

    try:
        # 2. Build command
        cmd = ["naabu", "-list", hosts_file, "-json", "-o", out_file, ...]

        # 3. Log command trước khi chạy
        self.logger.info(f"Chạy: {' '.join(cmd)}")

        # 4. Chạy tool
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)

        # 5. Log stderr (debug level)
        if proc.stderr:
            self.logger.debug(f"stderr: {proc.stderr[:500]}")

        # 6. Warning nếu exit code != 0 (nhưng KHÔNG raise)
        if proc.returncode != 0:
            self.logger.warning(f"exit {proc.returncode}")

        # 7. Parse output
        return self._parse_output(out_file)

    except subprocess.TimeoutExpired:
        self.logger.error(f"timeout sau {TIMEOUT}s")
        return []
    except Exception as e:
        self.logger.error(f"lỗi: {e}")
        return []
    finally:
        # 8. LUÔN cleanup temp files
        Path(hosts_file).unlink(missing_ok=True)
        Path(out_file).unlink(missing_ok=True)
```

**Quy tắc quan trọng:**
- Lỗi của tool (exit code != 0) → **warning, không raise** — worker vẫn tiếp tục parse output vì tool có thể partial success
- Timeout → **error log, return []** — job sẽ succeed với 0 results, không fail
- Tool không được cài → **warning, return []** — không crash worker
- Cleanup **luôn luôn** chạy trong `finally`

### Output Parsing — NDJSON

Tất cả tools (subfinder, naabu) output NDJSON (newline-delimited JSON):

```python
def _parse_output(self, filepath: str) -> list[dict]:
    results = []
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    # Extract fields từ obj
                    results.append({...})
                except (json.JSONDecodeError, ValueError):
                    # Fallback: treat as plain text nếu cần
                    pass
    except FileNotFoundError:
        pass  # Tool không tạo output file → empty results
    return results
```

---

## Workers hiện tại

### SubdomainWorker (`RECON_SUBDOMAIN`)

**Tool:** `subfinder`

**Payload:**
```json
{
  "workspace_id": "...",
  "target_id": "...",
  "domain": "example.com"
}
```

**Luồng:**
1. Validate `domain` (required)
2. Check `shutil.which("subfinder")` — nếu không có, return 0 results
3. Chạy: `subfinder -d {domain} -oJ -o {out} -all -t 50 -timeout 30`
4. Parse NDJSON output → dedup by domain name (lowercase, strip trailing dots)
5. Merge sources cho cùng một domain
6. `db.insert_subdomains(...)` → lưu vào DB
7. Return: `{"total": N, "saved": M, "domain": "..."}`

**Dedup logic:**
```python
seen = {}
for s in raw_results:
    d = s["domain"].lower().rstrip(".")
    if d not in seen:
        seen[d] = {"domain": d, "ip_addresses": [], "sources": []}
    seen[d]["sources"].extend(s.get("sources", []))
```

---

### PortWorker (`SCAN_PORT`)

**Tool:** `naabu`

**Payload:**
```json
{
  "workspace_id": "...",
  "target_id": "...",
  "domain": "example.com",
  "top_ports": "100",
  "custom_ports": ""
}
```

**Luồng:**
1. Validate `workspace_id` (required)
2. Lấy subdomains từ DB (`get_subdomains_by_target`)
3. Prepend domain chính của target vào đầu list
4. Tạo hosts file (1 host/line), chạy naabu
5. Parse kết quả → xác định `alive_hosts` (set of hosts có ≥1 open port)
6. Thu thập **tất cả IPs** cho mỗi host:
   ```python
   host_ips: dict[str, list[str]] = {}
   for p in ports_found:
       ip = p.get("ip_address")
       if ip and ip not in host_ips.setdefault(p["host"], []):
           host_ips[p["host"]].append(ip)
   ```
7. `db.insert_subdomain_observations(...)` — ghi alive/dead + IPs
8. `db.insert_ports(...)` — ghi open ports
9. Return: `{"total_hosts": N, "open_ports": M, "alive_hosts": X, "dead_hosts": Y, "saved": Z}`

**PORT_SERVICES mapping:**
```python
PORT_SERVICES = {
    21: "ftp",   22: "ssh",   25: "smtp",  53: "dns",
    80: "http",  443: "https", 3306: "mysql", 5432: "postgresql",
    6379: "redis", 27017: "mongodb", 3389: "rdp",
    # ... 28 services tổng cộng
}
```

Dùng để điền `service_name` khi insert port records.

**naabu command:**
```bash
naabu -list hosts.txt -json -o out.json -silent \
      -rate 1000 -c 50 -timeout 5 -retries 1 \
      -top-ports 100   # hoặc -p 80,443,8080
```

- `-rate 1000`: SYN scan rate — **yêu cầu `CAP_NET_RAW`** trong Docker
- `-c 50`: 50 concurrent goroutines
- `timeout=1800`: subprocess timeout 30 phút (nhiều hosts)

---

## Docker & Capabilities

### Capabilities cần thiết

```yaml
# deploy_local/compose.yaml
worker-python:
  cap_add:
    - NET_RAW    # naabu SYN scan
    - NET_ADMIN  # network configuration
```

Không có `CAP_NET_RAW` → naabu fall back sang TCP connect scan (chậm hơn 10-50x).

### Tools được cài trong image

```dockerfile
# worker.Dockerfile.dev
RUN wget subfinder_{version}_linux_amd64.zip → /usr/local/bin/subfinder
RUN wget httpx_{version}_linux_amd64.zip     → /usr/local/bin/httpx
RUN wget nuclei_{version}_linux_amd64.zip    → /usr/local/bin/nuclei
RUN wget naabu_{version}_linux_amd64.zip     → /usr/local/bin/naabu
```

Worker **không crash** nếu tool không được cài — `shutil.which()` check trước, warning log, return empty.

### Env vars

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `WORKER_ID` | `worker-1` | Consumer ID — **unique per container** |
| `LOG_LEVEL` | `INFO` | DEBUG \| INFO \| WARNING \| ERROR |

---

## Naming Conventions

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Job type | SCREAMING_SNAKE_CASE | `RECON_SUBDOMAIN`, `SCAN_PORT` |
| Job status | lowercase | `running`, `completed`, `failed` |
| Class | PascalCase | `SubdomainWorker`, `PortWorker`, `Dispatcher` |
| Method | snake_case | `handle`, `job_types`, `_run_naabu` |
| Private method | leading underscore | `_run_naabu`, `_parse_output`, `_ack` |
| Config constant | SCREAMING_SNAKE_CASE | `REDIS_URL`, `STREAM_NAME`, `WORKER_ID` |
| Variable | snake_case | `job_id`, `workspace_id`, `host_ips` |
| Port mapping | ALL_CAPS dict | `PORT_SERVICES` |

**Logging language:** Tiếng Việt cho messages quan trọng, tiếng Anh cho technical detail:
```python
self.logger.info(f"Tìm thấy {N} subdomain cho '{domain}', lưu {saved}")
self.logger.debug(f"naabu stderr: {proc.stderr[:500]}")
self.logger.warning(f"naabu không được cài đặt, bỏ qua")
```

---

## Thêm job type mới

Ví dụ thêm `SCAN_WEB_INFO` dùng `httpx`:

**Bước 1 — Tạo worker** (`recon/web_probe_worker.py`)

```python
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db

class WebProbeWorker(BaseJobHandler):

    def job_types(self) -> list[str]:
        return ["SCAN_WEB_INFO"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id", "")

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        hosts = db.get_subdomains_by_target(workspace_id, target_id)
        if not hosts:
            return {"total": 0, "saved": 0}

        results = []
        if shutil.which("httpx"):
            results = self._run_httpx(hosts)
        else:
            self.logger.warning("httpx không được cài đặt, bỏ qua")

        saved = db.insert_web_probes(workspace_id, target_id, job_id, results)
        return {"total": len(hosts), "alive": len(results), "saved": saved}

    def _run_httpx(self, hosts: list[str]) -> list[dict]:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as hf:
            hf.write("\n".join(hosts))
            hosts_file = hf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = ["httpx", "-list", hosts_file, "-json", "-o", out_file, "-silent"]
            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

            if proc.stderr:
                self.logger.debug(f"stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"httpx exit {proc.returncode}")

            return self._parse_output(out_file)
        except subprocess.TimeoutExpired:
            self.logger.error("httpx timeout sau 600s")
            return []
        except Exception as e:
            self.logger.error(f"httpx lỗi: {e}")
            return []
        finally:
            Path(hosts_file).unlink(missing_ok=True)
            Path(out_file).unlink(missing_ok=True)

    def _parse_output(self, filepath: str) -> list[dict]:
        results = []
        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        results.append({
                            "host":        obj.get("input", ""),
                            "url":         obj.get("url", ""),
                            "status_code": obj.get("status-code"),
                            "title":       obj.get("title"),
                        })
                    except json.JSONDecodeError:
                        pass
        except FileNotFoundError:
            pass
        return results
```

**Bước 2 — Đăng ký trong `main.py`**

```python
from recon.web_probe_worker import WebProbeWorker

dispatcher.register(WebProbeWorker())
```

**Bước 3 — Thêm DB function** vào `core/db.py`

```python
def insert_web_probes(workspace_id, target_id, job_id, probes: list[dict]) -> int:
    if not probes:
        return 0
    sql = """
        INSERT INTO web_probes (workspace_id, target_id, job_id, host, status_code, title)
        VALUES %s
    """
    records = [
        (workspace_id, target_id, job_id, p["host"], p.get("status_code"), p.get("title"))
        for p in probes
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()
    return len(records)
```

**Bước 4 — Thêm `SCAN_WEB_INFO` vào `ValidJobTypes`** trong backend (`internal/models/job.go`).

---

## Những điều KHÔNG nên làm

- **Không** viết SQL trong worker class — chỉ viết trong `core/db.py`
- **Không** raise Exception khi tool exit code != 0 — warning + tiếp tục parse
- **Không** bỏ qua `finally` cleanup temp files — nếu không xóa, disk sẽ đầy
- **Không** dùng `context.Background()` hay blocking operation quá lâu mà không có timeout
- **Không** tự implement consumer loop — dùng `Dispatcher`, chỉ viết logic trong `handle()`
- **Không** gọi `db.update_job_status()` trong `handle()` — Dispatcher đã làm điều này
- **Không** hard-code `WORKER_ID` — lấy từ `config.WORKER_ID` (env var)
- **Không** viết vào bảng `subdomains`/`ports` bằng UPDATE — append-only, chỉ INSERT
- **Không** import redis hay psycopg2 trực tiếp trong worker — dùng `core.db` và để Dispatcher quản lý Redis

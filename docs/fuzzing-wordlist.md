# RTI - Fuzzing Module & Wordlist Management

---

## 1. Tổng quan

Fuzzing module bao gồm hai thành phần chính:
- **Fuzz Worker**: Chạy các tool brute force (ffuf, feroxbuster, dirsearch, gobuster) theo adapter pattern — thêm tool mới không sửa code core.
- **Wordlist Manager**: Quản lý wordlist theo danh mục, phạm vi (global/workspace), hỗ trợ upload custom wordlist.

---

## 2. Fuzz Types và Tool phù hợp

| Fuzz Type    | Mục đích                                 | Tool khuyên dùng            |
|--------------|------------------------------------------|-----------------------------|
| `dir`        | Brute force thư mục                      | feroxbuster (recursive), ffuf |
| `file`       | Tìm file ẩn theo extension               | dirsearch, ffuf              |
| `vhost`      | Liệt kê virtual host                     | ffuf (`-H "Host: FUZZ"`)     |
| `param`      | Brute force GET/POST parameter name      | ffuf (`-mc all -fw`)         |
| `backup`     | File backup phổ biến (.sql, .zip, .bak)  | dirsearch, gobuster          |
| `api`        | Brute force API endpoint (`/api/FUZZ`)   | ffuf, feroxbuster            |

---

## 3. Plugin Adapter cho Fuzz Tools

### Interface cơ bản

```python
# workers/fuzz/base_fuzz_adapter.py
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

@dataclass
class FuzzContext:
    job_id:          str
    workspace_id:    str
    fuzz_config_id:  str
    target_url:      str           # VD: https://example.com/FUZZ
    wordlist_paths:  list[str]     # đường dẫn file wordlist trên server
    fuzz_type:       str           # dir | file | vhost | param | backup | api
    extensions:      list[str] = field(default_factory=list)
    threads:         int = 40
    rate_limit:      int | None = None
    timeout:         int = 10
    follow_redirects: bool = False
    status_filter:   list[int] = field(default_factory=list)
    size_filter:     list[int] = field(default_factory=list)
    recursive:       bool = False
    proxy:           str | None = None
    extra_args:      dict[str, Any] = field(default_factory=dict)

@dataclass
class FuzzHit:
    url:            str
    method:         str
    status_code:    int
    content_length: int | None = None
    content_type:   str | None = None
    redirect_url:   str | None = None
    words:          int | None = None
    lines:          int | None = None
    response_time:  int | None = None   # milliseconds
    is_interesting: bool = False

@dataclass
class FuzzResult:
    tool:        str
    job_id:      str
    success:     bool
    hits:        list[FuzzHit] = field(default_factory=list)
    error:       str = ""
    raw_output:  str = ""
    stats: dict = field(default_factory=dict)  # total_requests, duration, etc.

class BaseFuzzAdapter(ABC):
    name: str = ""

    @abstractmethod
    def build_command(self, ctx: FuzzContext) -> list[str]: ...

    @abstractmethod
    def parse(self, raw: str, ctx: FuzzContext) -> list[FuzzHit]: ...

    def run(self, ctx: FuzzContext) -> FuzzResult:
        cmd = self.build_command(ctx)
        raw = self._exec(cmd)
        hits = self.parse(raw, ctx)
        self._mark_interesting(hits, ctx)
        return FuzzResult(
            tool=self.name,
            job_id=ctx.job_id,
            success=True,
            hits=hits,
            raw_output=raw,
        )

    def _mark_interesting(self, hits: list[FuzzHit], ctx: FuzzContext):
        """Auto-flag kết quả đáng chú ý: không phải 404, size khác baseline."""
        for hit in hits:
            if hit.status_code in (200, 201, 204, 301, 302, 403, 500):
                hit.is_interesting = True
            if ctx.size_filter and hit.content_length in ctx.size_filter:
                hit.is_interesting = False

    def _exec(self, cmd: list[str]) -> str:
        import subprocess
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        return result.stdout
```

---

### Adapter: ffuf

```python
# workers/fuzz/adapters/ffuf_adapter.py
import json

class FfufAdapter(BaseFuzzAdapter):
    name = "ffuf"

    def build_command(self, ctx: FuzzContext) -> list[str]:
        cmd = [
            "ffuf",
            "-u",  ctx.target_url,           # phải chứa từ khoá FUZZ
            "-w",  ":".join(ctx.wordlist_paths) + ":FUZZ",
            "-json",
            "-t",  str(ctx.threads),
            "-timeout", str(ctx.timeout),
        ]
        if ctx.extensions:
            cmd += ["-e", ",".join(ctx.extensions)]
        if ctx.rate_limit:
            cmd += ["-rate", str(ctx.rate_limit)]
        if ctx.follow_redirects:
            cmd += ["-r"]
        if ctx.status_filter:
            cmd += ["-mc", ",".join(map(str, ctx.status_filter))]
        if ctx.size_filter:
            cmd += ["-fs", ",".join(map(str, ctx.size_filter))]
        if ctx.proxy:
            cmd += ["-x", ctx.proxy]
        if ctx.recursive:
            cmd += ["-recursion", "-recursion-depth", "3"]
        return cmd

    def parse(self, raw: str, ctx: FuzzContext) -> list[FuzzHit]:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        hits = []
        for r in data.get("results", []):
            hits.append(FuzzHit(
                url=r["url"],
                method=r.get("method", "GET"),
                status_code=r["status"],
                content_length=r.get("length"),
                redirect_url=r.get("redirectlocation") or None,
                words=r.get("words"),
                lines=r.get("lines"),
                response_time=r.get("duration"),
            ))
        return hits
```

---

### Adapter: feroxbuster

```python
# workers/fuzz/adapters/feroxbuster_adapter.py
import json

class FeroxbusterAdapter(BaseFuzzAdapter):
    name = "feroxbuster"

    def build_command(self, ctx: FuzzContext) -> list[str]:
        cmd = [
            "feroxbuster",
            "--url",     ctx.target_url,
            "--wordlist", ctx.wordlist_paths[0],   # feroxbuster nhận 1 wordlist
            "--json",
            "--threads",  str(ctx.threads),
            "--timeout",  str(ctx.timeout),
            "--silent",
            "--no-state",
        ]
        if ctx.extensions:
            cmd += ["--extensions", ",".join(e.lstrip(".") for e in ctx.extensions)]
        if ctx.rate_limit:
            cmd += ["--rate-limit", str(ctx.rate_limit)]
        if ctx.follow_redirects:
            cmd += ["--redirects"]
        if ctx.status_filter:
            cmd += ["--status-codes", ",".join(map(str, ctx.status_filter))]
        if ctx.size_filter:
            cmd += ["--filter-size", ",".join(map(str, ctx.size_filter))]
        if ctx.recursive:
            cmd += ["--depth", "3"]
        if ctx.proxy:
            cmd += ["--proxy", ctx.proxy]
        return cmd

    def parse(self, raw: str, ctx: FuzzContext) -> list[FuzzHit]:
        hits = []
        for line in raw.strip().splitlines():
            try:
                r = json.loads(line)
                if r.get("type") != "response":
                    continue
                hits.append(FuzzHit(
                    url=r["url"],
                    method=r.get("method", "GET"),
                    status_code=r["status"],
                    content_length=r.get("content_length"),
                    redirect_url=r.get("redirects", [None])[-1],
                    words=r.get("word_count"),
                    lines=r.get("line_count"),
                    response_time=int(r.get("elapsed", 0) * 1000),
                ))
            except (json.JSONDecodeError, KeyError):
                continue
        return hits
```

---

### Adapter: dirsearch

```python
# workers/fuzz/adapters/dirsearch_adapter.py
import json

class DirsearchAdapter(BaseFuzzAdapter):
    name = "dirsearch"

    def build_command(self, ctx: FuzzContext) -> list[str]:
        cmd = [
            "dirsearch",
            "-u",  ctx.target_url,
            "-w",  ctx.wordlist_paths[0],
            "--format=json",
            "--output=/tmp/dirsearch_out.json",
            "-t",  str(ctx.threads),
            "--timeout", str(ctx.timeout),
            "--no-color",
        ]
        if ctx.extensions:
            cmd += ["-e", ",".join(e.lstrip(".") for e in ctx.extensions)]
        if ctx.rate_limit:
            cmd += ["--rate-limit", str(ctx.rate_limit)]
        if ctx.follow_redirects:
            cmd += ["--follow-redirects"]
        if ctx.status_filter:
            cmd += ["-i", ",".join(map(str, ctx.status_filter))]
        if ctx.proxy:
            cmd += ["--proxy", ctx.proxy]
        return cmd

    def parse(self, raw: str, ctx: FuzzContext) -> list[FuzzHit]:
        import os
        out_path = "/tmp/dirsearch_out.json"
        if not os.path.exists(out_path):
            return []
        with open(out_path) as f:
            data = json.load(f)
        hits = []
        for item in data.get("results", []):
            hits.append(FuzzHit(
                url=item["url"],
                method=item.get("method", "GET"),
                status_code=item["status"],
                content_length=item.get("content-length"),
                redirect_url=item.get("redirect"),
                response_time=item.get("response-time"),
            ))
        return hits
```

---

### Fuzz Registry

```python
# workers/fuzz/fuzz_registry.py
from .adapters.ffuf_adapter        import FfufAdapter
from .adapters.feroxbuster_adapter import FeroxbusterAdapter
from .adapters.dirsearch_adapter   import DirsearchAdapter

_REGISTRY: dict[str, BaseFuzzAdapter] = {
    a.name: a() for a in [FfufAdapter, FeroxbusterAdapter, DirsearchAdapter]
}

def get_fuzz_adapter(tool_name: str) -> BaseFuzzAdapter:
    adapter = _REGISTRY.get(tool_name)
    if not adapter:
        raise ValueError(f"Không tìm thấy fuzz adapter: {tool_name}")
    return adapter

def list_tools() -> list[str]:
    return list(_REGISTRY.keys())
```

---

## 4. Wordlist Management

### Cấu trúc thư mục wordlist trên server

```
/app/wordlists/
├── builtin/                    # đóng gói sẵn trong Docker image
│   ├── directories/
│   │   ├── common.txt          # ~4700 entries — SecLists Discovery/Web-Content
│   │   ├── big.txt             # ~20000 entries
│   │   ├── raft-large-directories.txt
│   │   └── directory-list-2.3-medium.txt
│   ├── files/
│   │   ├── common-files.txt
│   │   ├── backup-files.txt    # .bak, .sql, .zip, .tar.gz, ...
│   │   └── sensitive-files.txt # .env, config.php, wp-config.php, ...
│   ├── parameters/
│   │   ├── burp-parameter-names.txt
│   │   └── raft-large-parameters.txt
│   ├── subdomains/
│   │   ├── subdomains-top1million-5000.txt
│   │   └── dns-Jhaddix.txt
│   ├── api_endpoints/
│   │   ├── api-endpoints.txt
│   │   └── swagger-wordlist.txt
│   └── tech_specific/
│       ├── wordpress/
│       │   ├── wp-plugins.txt
│       │   └── wp-themes.txt
│       ├── drupal/
│       └── joomla/
└── custom/                     # user upload, mount volume
    ├── global/                 # wordlist dùng chung mọi workspace
    │   └── {uuid}-{name}.txt
    └── workspace/
        └── {workspace_id}/
            └── {uuid}-{name}.txt
```

---

### API Endpoints cho Wordlist (Go Backend)

```
GET    /api/wordlists                      - Liệt kê wordlist (global + của workspace)
GET    /api/wordlists/:id                  - Chi tiết + metadata
POST   /api/wordlists                      - Upload wordlist mới (multipart/form-data)
DELETE /api/wordlists/:id                  - Xoá custom wordlist
GET    /api/wordlists/categories           - Danh sách category
GET    /api/wordlists?category=directories - Lọc theo category
GET    /api/wordlists?builtin=true         - Chỉ lấy built-in
```

### Request upload wordlist

```json
POST /api/wordlists
Content-Type: multipart/form-data

{
  "name":         "my-custom-dirs",
  "description":  "Wordlist thư mục cho target banking",
  "category":     "directories",
  "tags":         ["banking", "custom"],
  "workspace_id": "uuid-hoặc-null-để-global",
  "file":         <binary>
}
```

---

## 5. Luồng chạy Fuzzing Job

```
User chọn target URL + fuzz type + tool + wordlist(s)
    → POST /api/jobs  { type: "FUZZ_DIR", params: { ... } }
    → Backend lưu job (status: pending)
    → Backend tạo fuzz_configs record
    → Backend push job vào Redis Stream
    → Fuzz Worker nhận job
    → Worker gọi get_fuzz_adapter(tool_name)
    → Adapter.run(ctx)
        ├── build_command() → subprocess
        ├── parse(raw) → list[FuzzHit]
        └── _mark_interesting()
    → Worker lưu FuzzHit[] vào bảng fuzz_results
    → Worker update job status → Redis Pub/Sub
    → Backend publish event qua WebSocket
    → Frontend nhận real-time update, hiển thị kết quả
```

---

## 6. Chiến lược chọn wordlist tự động (Smart Defaults)

Worker tự động gợi ý wordlist dựa trên context:

| Điều kiện                             | Wordlist mặc định gợi ý            |
|---------------------------------------|-------------------------------------|
| `fuzz_type = dir`                     | `common.txt` + `big.txt`            |
| `fuzz_type = file`                    | `backup-files.txt` + `sensitive-files.txt` |
| `fuzz_type = param`                   | `burp-parameter-names.txt`          |
| `service_type = wordpress`            | `wp-plugins.txt` + `wp-themes.txt`  |
| `fuzz_type = api`                     | `api-endpoints.txt`                 |
| `fuzz_type = vhost`                   | `subdomains-top1million-5000.txt`   |

Go Backend trả về gợi ý khi user chọn fuzz type:

```
GET /api/wordlists/suggest?fuzz_type=dir&service_type=wordpress
→ [ { id, name, category, line_count }, ... ]
```

---

## 7. Cách thêm fuzz tool mới

1. Tạo file `workers/fuzz/adapters/gobuster_adapter.py`
2. Kế thừa `BaseFuzzAdapter`, implement `build_command()` và `parse()`
3. Thêm vào `_REGISTRY` trong `fuzz_registry.py`

```python
# gobuster_adapter.py
class GobusterAdapter(BaseFuzzAdapter):
    name = "gobuster"

    def build_command(self, ctx: FuzzContext) -> list[str]:
        return [
            "gobuster", "dir",
            "-u", ctx.target_url,
            "-w", ctx.wordlist_paths[0],
            "-o", "/tmp/gobuster_out.txt",
            "-t", str(ctx.threads),
            "--no-error",
        ]

    def parse(self, raw: str, ctx: FuzzContext) -> list[FuzzHit]:
        # parse stdout dạng: /admin (Status: 200) [Size: 1234]
        import re
        hits = []
        pattern = re.compile(r"^(.+?)\s+\(Status:\s*(\d+)\)\s+\[Size:\s*(\d+)\]")
        base = ctx.target_url.rstrip("/FUZZ").rstrip("/")
        for line in raw.splitlines():
            m = pattern.match(line.strip())
            if m:
                hits.append(FuzzHit(
                    url=base + m.group(1),
                    method="GET",
                    status_code=int(m.group(2)),
                    content_length=int(m.group(3)),
                ))
        return hits
```

**Không cần sửa bất kỳ file nào khác.**

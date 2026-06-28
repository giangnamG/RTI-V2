# RTI V2 — Vulnerability Scan Design (Phase 5)

## Tổng quan

Phase 5 xây dựng hệ thống quét lỗ hổng tự động, **tech-aware**: đọc kết quả fingerprint từ
`SCAN_WEB_INFO` và `SCAN_PORT`, sau đó dispatch đúng tool chuyên biệt cho từng tech stack.

---

## Kiến trúc

```
VULN_DISPATCH
    │
    ├── [COMMON]           ← tất cả live targets
    │       ├── Nuclei          CVE, misconfig, exposure templates
    │       ├── Nikto           web server scan tổng quát
    │       └── testssl.sh      SSL/TLS vuln (HTTPS targets only)
    │
    ├── [CMS]              ← detect từ web_probes.technologies
    │       ├── WordPress  → WPScan
    │       ├── Joomla     → JoomScan
    │       └── Drupal     → Droopescan
    │
    ├── [SOFTWARE]         ← detect từ technologies + title + web_server
    │   ├── DevOps/CI
    │   │     ├── GitLab          token exposure, RCE (CVE-2021-22205...)
    │   │     └── Jenkins         script console, CVE-2024-23897
    │   ├── Atlassian
    │   │     └── Confluence      OGNL injection (CVE-2021-26084...)
    │   ├── Monitoring
    │   │     └── Grafana         path traversal (CVE-2021-43798)
    │   └── Java servers
    │         ├── Tomcat          manager panel, PUT upload
    │         └── Spring Boot     actuator exposure, Spring4Shell
    │
    ├── [CLOUD]            ← detect từ host pattern + technologies
    │       ├── AWS             S3 listing, metadata SSRF, CloudFront bypass
    │       ├── GCP             GCS exposure, metadata SSRF
    │       ├── Azure           Blob public access, metadata SSRF
    │       └── Subdomain Takeover  CNAME → unregistered cloud service
    │
    ├── [DISCOVERY]        ← tất cả targets (information disclosure)
    │       ├── Git exposure    /.git/config, source code dump
    │       ├── Env/Config      .env, wp-config.php.bak, database.yml
    │       └── CORS            ACAO:*, origin reflection, null origin
    │
    ├── [NETWORK_SERVICE]  ← từ port scan results (ports table)
    │       ├── Redis           unauth access, CONFIG GET
    │       ├── MySQL           anonymous login, root no-password
    │       ├── MongoDB         unauth access, db listing
    │       └── Elasticsearch   unauth read, index listing
    │
    └── [WEB_PARAMS]       ← từ fuzz_param_results (FUZZ_PARAM phải chạy trước)
            ├── SQLMap      SQL injection (GET/POST params)
            └── Dalfox      XSS (GET params only)
```

---

## Domain → Input Source Mapping

| Domain | Input source | Điều kiện prerequisite |
|---|---|---|
| common | `web_probes` | SCAN_WEB_INFO |
| cms | `web_probes` | SCAN_WEB_INFO |
| software | `web_probes` | SCAN_WEB_INFO |
| cloud | `web_probes` | SCAN_WEB_INFO |
| discovery | `web_probes` | SCAN_WEB_INFO |
| network_service | `ports` | SCAN_PORT |
| web_params | `fuzz_params` | FUZZ_PARAM |

---

## Data Flow

```
findings table
  ├── source_tool:   'nuclei' | 'wpscan' | 'sqlmap' | 'dalfox' | ...
  └── source_domain: 'common' | 'cms' | 'software' | 'cloud' |
                     'discovery' | 'network_service' | 'web_params'

vuln_scan_runs table   ← track mỗi lần 1 tool chạy trên 1 target
  ├── domain, tool, target_url
  ├── status: pending | running | completed | failed | skipped
  ├── skip_reason: not_installed | not_applicable
  └── findings_count
```

---

## Worker Architecture

### BaseVulnHandler (abstract)

```python
class BaseVulnHandler(ABC):
    domain: str          # "common" | "cms" | ...
    tool:   str          # binary name
    input_source: str    # "web_probes" | "ports" | "fuzz_params"

    def is_available(self) -> bool   # shutil.which(self.tool)
    def detect(self, target) -> bool # tech-match check
    def run(self, target, ...) -> list[dict]  # returns findings
    def _finding(self, **kwargs) -> dict      # helper with auto source fields
```

### Registry Pattern

```python
# Mỗi worker tự đăng ký khi import:
from vuln import registry
registry.register(MyWorker())

# Dispatcher import tất cả → registry đầy đủ:
import vuln.common.nuclei_worker   # triggers register()
```

### Thêm tool mới

1. Tạo file `workers/vuln/{domain}/{tool_name}_worker.py`
2. Kế thừa `BaseVulnHandler`
3. Set `domain`, `tool`, `input_source`
4. Implement `detect()` — trả về True nếu tool áp dụng cho target
5. Implement `run()` — chạy tool, parse output, return findings list
6. Gọi `registry.register(MyWorker())` cuối file
7. Thêm `import vuln.{domain}.{tool_name}_worker` vào `dispatch_worker.py`

---

## DB Schema (migration 000014)

```sql
-- findings bổ sung
ALTER TABLE findings
    ADD COLUMN source_tool   TEXT,
    ADD COLUMN source_domain TEXT;

-- track từng run
CREATE TABLE vuln_scan_runs (
    id, workspace_id, target_id, job_id,
    domain, tool, target_url,
    status,        -- pending|running|completed|failed|skipped
    skip_reason,   -- not_installed|not_applicable
    findings_count,
    started_at, finished_at, created_at
);
```

---

## Frontend Pages

| Path | Nội dung |
|---|---|
| `/workspace/:id/vuln` | Overview: tất cả domains, launch VULN_DISPATCH |
| `/workspace/:id/vuln/common` | Nuclei + Nikto + testssl findings |
| `/workspace/:id/vuln/cms` | CMS-specific findings |
| `/workspace/:id/vuln/software` | Software-specific findings |
| `/workspace/:id/vuln/cloud` | Cloud-specific findings |
| `/workspace/:id/vuln/discovery` | Info disclosure findings |
| `/workspace/:id/vuln/network` | Network service findings |
| `/workspace/:id/vuln/web-params` | SQLi + XSS findings |

---

## Implement Priority

1. **Common** — Nuclei (đã cài sẵn), impact ngay lập tức
2. **Discovery** — không cần tool nặng, httpx + nuclei templates
3. **CMS** — WPScan/JoomScan, phổ biến trong pentest thực tế
4. **Software** — GitLab/Confluence/Jenkins, high-value targets
5. **Cloud** — cần detect cloud provider
6. **Network Service** — cần port scan results
7. **Web Params** — SQLMap/Dalfox, cần FUZZ_PARAM results + user confirm

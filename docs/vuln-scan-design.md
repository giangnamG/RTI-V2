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
    │       ├── Nuclei          CVE, misconfig, exposure, fingerprint (workspace-level)
    │       └── testssl.sh      SSL/TLS vuln (HTTPS targets only)
    │       (Nikto đã gỡ — Nuclei templates phủ rộng hơn)
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
    ├── [CLOUD]            ← Firebase BaaS misconfig — OpenFirebase (read-only)
    │   └── Firebase (Google Cloud)  prefilter tín hiệu Nuclei → discovery config → openfirebase --read-*
    │         ├── RTDB            Realtime Database đọc unauth (/.json)
    │         ├── Firestore       collection đọc unauth (REST)
    │         ├── Storage         bucket listing unauth
    │         ├── Remote Config   template config unauth (cần apiKey + appId)
    │         └── Functions       function gọi unauth (probe đa region)
    │       (AWS/GCP/Azure/Subdomain-Takeover nuclei: stub, chưa expose trên UI)
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
| common (nuclei) | `workspace` | SCAN_WEB_INFO + SCAN_PORT |
| common (testssl) | `web_probes` | SCAN_WEB_INFO |
| cms | `web_probes` | SCAN_WEB_INFO |
| software | `web_probes` | SCAN_WEB_INFO |
| cloud (firebase) | `workspace` | SCAN_WEB_INFO + nên chạy Common/Nuclei trước (prefilter) |
| discovery | `web_probes` | SCAN_WEB_INFO |
| network_service | `ports` | SCAN_PORT |
| web_params | `fuzz_params` | FUZZ_PARAM |

---

## Data Flow

```
findings table              ← tất cả tool TRỪ nuclei
  ├── source_tool:   'wpscan' | 'sqlmap' | 'dalfox' | 'testssl.sh' | 'corsy' |
  │                  'firebase-rtdb' | 'firebase-firestore' | 'firebase-storage' |
  │                  'firebase-config' | 'firebase-functions' | ...
  └── source_domain: 'common' | 'cms' | 'software' | 'cloud' |
                     'discovery' | 'network_service' | 'web_params'

findings_nuclei table       ← RIÊNG cho nuclei (migration 000015)
  ├── template_id, matcher_name, protocol      (dns|http|tcp|ssl...)
  ├── title, severity, type, host, url, port
  ├── extracted_results JSONB  ← mảng giá trị extractor (whois, fingerprint...)
  └── cve_id, cvss_score, evidence, remediation

vuln_scan_runs table        ← track mỗi lần 1 tool chạy trên 1 target
  ├── domain, tool, target_url
  ├── status: pending | running | completed | failed | skipped
  ├── skip_reason: not_installed | not_applicable
  └── findings_count
```

> **Vì sao tách bảng?** Output nuclei có cấu trúc riêng (template_id, matcher/extractor,
> mảng `extracted_results`) không khớp schema `findings` chung. Gộp chung sẽ mất dữ liệu
> cột thứ 5 (mảng extracted). Các tool khác vẫn đổ vào `findings`.

### Lịch sử thu thập (append-only) — bảng chính = RUN MỚI NHẤT

Findings append-only như mọi nghiệp vụ (xem `rules/data-model.md`). Hệ quả + cách hiện thực:

- **Bảng chính chỉ hiện run mới nhất**, KHÔNG tích luỹ trùng qua các lần re-run:
  - `ListFindings` (`/vuln-findings`) → run mới nhất **per `source_tool`**
    (`first_value(job_id) OVER (PARTITION BY source_tool ORDER BY created_at DESC)`).
  - `NucleiFindingRepo.List` (`/nuclei-findings`) → run mới nhất (single partition).
- **Lịch sử = tất cả lần chạy** qua endpoint riêng:
  - `GET /vuln-findings/history?domain=&tool=` · `GET /nuclei-findings/history`.
- **Frontend** `VulnModule` → `VulnHistoryDrawer` (reuse pattern recon `HistoryDrawer`):
  - **Click 1 row** → lịch sử của **chính finding đó** (lọc theo identity `title+host+url`),
    timeline `MỚI NHẤT`/`LẦN ĐẦU`, **full thông tin** (type/status/host/url/port/cve/cvss/
    evidence/remediation; nuclei thêm template/matcher/protocol/extracted), **ẩn id/job_id/index**.
  - **Nút ⧖ Lịch sử** → lịch sử cả tool (nhóm theo `job_id` = từng phiên scan).

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
    def handles_tool(self, key) -> bool  # mặc định key==self.tool; override khi 1 worker
                                          # phục vụ nhiều tool key (vd Firebase: 'firebase-*')
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

## Nuclei Integration (chi tiết)

Nuclei khác các tool còn lại ở chỗ chạy **workspace-level** và stream realtime vào bảng riêng.

### Cài đặt (Dockerfile)

```dockerfile
ARG PD_NUCLEI=v3.7.0          # bản cũ v3.3.8 thiếu nhiều template → chỉ ra 2 finding
RUN nuclei -update -silent          || true   # update binary
RUN nuclei -update-templates -silent || true  # update ~2.4k+ templates
```

### Cơ chế quét

```
NucleiWorker (vuln/common/nuclei_worker.py)
  input_source  = "workspace"   ← gọi 1 lần/workspace, KHÔNG loop từng probe
  streams_to_db = True          ← insert từng finding ngay khi tìm thấy (realtime)

  1. _build_url_list(workspace_id, target_ids)
       • Gộp URL của các target được chọn (target_ids rỗng = tất cả)
       • Nguồn: web_probes (scheme chính xác từ httpx) + web ports (service_category='web')
       • Dạng scheme://host:port/
  2. _filter_live_urls(urls)  ← chạy httpx lọc URL thực sự serve HTTP
       • Bỏ port mở ở tầng TCP (naabu) nhưng không phải HTTP
       • TRÁNH treo: nuclei + -nmhe sẽ retry vô hạn trên port chết
  3. nuclei -l urls.txt -j -silent -no-color -nmhe
       • -nmhe = no-max-host-error → 1 template bị WAF chặn không kill cả host
       • KHÔNG set -timeout/-retries → để nuclei dùng mặc định, chạy tới khi xong
  4. _parse_finding(): tách template_id, matcher-name|extractor-name,
       type→protocol, extracted-results (mảng) → insert_nuclei_findings()
```

### Điểm quan trọng

| Vấn đề | Giải pháp |
|---|---|
| Chỉ ra 2 finding (thiếu template) | Nâng nuclei v3.3.8 → v3.7.0 + update templates trong Dockerfile |
| Treo trên port chết (8080/8443) | httpx pre-filter loại URL không serve HTTP trước khi đưa vào nuclei |
| WAF chặn → blacklist cả host | flag `-nmhe` |
| Mất giá trị cột extracted (mảng) | Bảng riêng `findings_nuclei.extracted_results` JSONB |
| Job kẹt sau khi worker restart | dispatcher `_reclaim_pending()` dùng XAUTOCLAIM (idle > 60s) |
| Quét nhiều target chọn lọc | payload `target_ids: []` (rỗng = tất cả) |
| Chạy riêng 1 tool | payload `tools: ['nuclei']` |

---

## Firebase Integration (OpenFirebase) — module Cloud

Firebase được quét bằng **OpenFirebase** (github.com/Icex0/OpenFirebase, pin `v1.3.0`,
cài trong `worker.Dockerfile.dev`). Giống Nuclei ở chỗ chạy **workspace-level**, nhưng
**CHỈ READ-ONLY** — không bao giờ dùng `--write-*` (tránh ghi dữ liệu lên target).

### Luồng (vuln/cloud/firebase_worker.py)

```
FirebaseWorker
  input_source = "workspace"          ← chạy 1 lần/workspace
  is_available = shutil.which("openfirebase")
  handles_tool = 'firebase' + 'firebase-*'   ← 1 worker phục vụ nhiều component

  1. PREFILTER  db.get_firebase_nuclei_signals(ws, target_id)
       • Query findings_nuclei WHERE template_id/url/extracted_results ILIKE '%firebase%'
       • → tập host dùng Firebase + seed (authDomain/projectId Nuclei đã trích)
  2. DISCOVERY  _discover_config(url)  ← fetch HTML + JS, regex lấy apiKey/appId/projectId
       • chỉ trên host đã lọc
       • FALLBACK: nếu scope chưa có tín hiệu Nuclei → quét discovery mọi live web probe
  3. OPENFIREBASE  openfirebase --project-id <pid> [--api-key --app-id]
                      --read-<check> --output-dir <tmp> --scan-rate 5
  4. PARSE  *_scan.json (v1.3 có JSON output) → finding khi
       unauth.security = PUBLIC* hoặc verdict = public
       → tag source_tool = firebase-<check>, source_domain = 'cloud'
```

### Component ↔ flag ↔ severity

| Component (tool UI) | flag OpenFirebase | service (scan.json) | source_tool | severity |
|---|---|---|---|---|
| RTDB | `--read-rtdb` | rtdb | firebase-rtdb | critical |
| Firestore | `--read-firestore` | firestore | firebase-firestore | critical |
| Storage | `--read-storage` | storage | firebase-storage | high |
| Remote Config | `--read-config` | remote_config | firebase-config | medium |
| Functions | `--read-functions` | cloud_functions | firebase-functions | medium |

- `PUBLIC_SA` (service account lộ) → nâng severity = **critical**.
- Functions tự probe **đa region** (GCP coi mỗi region là deployment độc lập).
- Tab **Overview** chỉ mô tả các component, không scan / không gửi gì xuống worker.

### Cài đặt (Dockerfile)

```dockerfile
# git cần cho pip cài từ VCS (setuptools_scm); gộp cùng layer để giữ cache PD-tools
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "git+https://github.com/Icex0/OpenFirebase.git@v1.3.0"
```

> **Vì sao prefilter bằng Nuclei?** Common/Nuclei đã quét toàn workspace và có template
> `firebase-database-extractor` trích `authDomain` → dùng làm bộ lọc host + seed projectId,
> tránh fetch mù mọi probe. **Chạy module Common trước** để prefilter hiệu quả.
> **Phân loại taxonomy:** database (MySQL/Mongo theo port) → `network_service`; còn Firebase
> (BaaS tiếp xúc qua HTTP) → `cloud`. Không tự viết lại check HTTP — dùng OpenFirebase read-only.

---

## DB Schema

### migration 000014 — findings mở rộng + vuln_scan_runs

```sql
ALTER TABLE findings
    ADD COLUMN source_tool   TEXT,
    ADD COLUMN source_domain TEXT;

CREATE TABLE vuln_scan_runs (
    id, workspace_id, target_id, job_id,
    domain, tool, target_url,
    status,        -- pending|running|completed|failed|skipped
    skip_reason,   -- not_installed|not_applicable
    findings_count,
    started_at, finished_at, created_at
);
```

### migration 000015 — findings_nuclei (bảng riêng cho Nuclei)

```sql
CREATE TABLE findings_nuclei (
    id, workspace_id, target_id, job_id,
    template_id  TEXT,     -- 'rdap-whois', 'http-missing-security-headers'...
    matcher_name TEXT,     -- matcher-name HOẶC extractor-name
    protocol     TEXT,     -- dns | http | tcp | ssl
    title, severity, type, status,
    host, url, port,
    extracted_results JSONB DEFAULT '[]',   -- ["2027-04-21...", "abuse@..."]
    cve_id, cvss_score, evidence, remediation,
    created_at
);
```

Backend: model `NucleiFinding` (extracted_results = `json.RawMessage`), repo `NucleiFindingRepo`,
endpoint `GET /api/workspaces/:wsid/nuclei-findings?severity=`.

---

## Frontend Pages

Tất cả trang module Vuln Scan dùng chung component `VulnModule` + cấu hình tập trung
`vulnConfig.ts`. Mỗi trang page chỉ là `<VulnModule seg="..." />`. Tool của module hiển thị
thành **hàng tool** ngay dưới hàng module. Module có thể khai báo `submodules` để thành
**nav 3 tầng** (module → module con → component) — vd Cloud → "Google Cloud" → các component.
Module con có thể đổi nhãn hàng tool qua `toolLabel` (Cloud dùng `Component`), và component
có thể đặt `overview: true` (tab mô tả, không scan) + `desc` (mô tả hiện ở tab Overview).
Chọn tool/component qua query `?tool=`; mỗi cái có nút Run riêng (payload `tools:[tool]`),
chọn target, bảng Output riêng (nuclei → `findings_nuclei`; còn lại → `findings`),
timer mm:ss + resume.

| Path | seg | Tools |
|---|---|---|
| `/workspace/:id/vuln` | — | Overview, launch VULN_DISPATCH |
| `/workspace/:id/vuln/common` | common | nuclei, testssl.sh |
| `/workspace/:id/vuln/cms` | cms | wpscan, joomscan, droopescan |
| `/workspace/:id/vuln/software` | software | nuclei |
| `/workspace/:id/vuln/cloud` | cloud | **Google Cloud** (3 tầng) → Overview · RTDB · Firestore · Storage · Remote Config · Functions |
| `/workspace/:id/vuln/discovery` | discovery | nuclei, corsy |
| `/workspace/:id/vuln/network` | network | nuclei |
| `/workspace/:id/vuln/web-params` | web-params | sqlmap, dalfox |

---

## Implement Priority

1. **Common** — Nuclei (đã cài sẵn), impact ngay lập tức
2. **Discovery** — không cần tool nặng, httpx + nuclei templates
3. **CMS** — WPScan/JoomScan, phổ biến trong pentest thực tế
4. **Software** — GitLab/Confluence/Jenkins, high-value targets
5. **Cloud** — cần detect cloud provider
6. **Network Service** — cần port scan results
7. **Web Params** — SQLMap/Dalfox, cần FUZZ_PARAM results + user confirm

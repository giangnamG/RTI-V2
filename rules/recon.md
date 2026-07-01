# Rule nghiệp vụ: Recon

Thu thập bề mặt tấn công. Tất cả **append-only** (xem [data-model.md](data-model.md)); không tạo
finding (chỉ dữ liệu thô). Thứ tự phụ thuộc: Subdomain → Port → Web Probe → Crawl → Endpoint Normalize.

> **Multi-target (mọi recon worker)**: payload nhận `target_ids` (nhiều) → `target_id` (một) →
> rỗng = TẤT CẢ target active. `db.resolve_scan_targets()` giải mã danh sách; worker loop qua từng
> target bằng **scan pool `SCAN_CONCURRENCY`** (`concurrency.run_tasks`) và lưu kết quả **đúng
> per-target** (giống VULN_DISPATCH). Frontend: multi-select checkbox + "Chọn tất cả" (component
> `recon/TargetMultiSelect`) → 1 job/nhiều target. Aggregate: mỗi worker trả thêm `targets` (số target đã xử lý).
>
> **Target normalization (single source of truth)**: `targets.domain` là chuỗi user nhập thô
> (`example.com` | `host:port` | `scheme://host[:port][/path]` | `ip[:port]`). Backend Go
> (`models.ParseTarget`) parse **1 lần** khi tạo/sửa target → lưu các cột `scheme,host,port,is_ip`.
> Mọi worker recon ĐỌC các cột này (`db.get_target` / `db.get_targets`) thay vì tự parse chuỗi
> thô → subfinder/naabu không bao giờ nhận chuỗi có scheme/port gây lỗi. Migration `000020`.
> **Chính target host luôn là input hạng nhất** (subdomain_worker đăng ký nó dù subfinder rỗng).

---

## 1. RECON_SUBDOMAIN — `recon/subdomain_worker.py` ✅
- **Tool**: `subfinder -d {host} -oJ -all -t 50 -timeout 30` (dùng **bare host** từ `db.get_target`, không phải domain thô).
- **Trigger**: có `domain`.
- **Làm gì**: enum subdomain trên bare host, dedup theo tên + gom `source`. **LUÔN đăng ký chính target host** (source=`target`) để nó là input hạng nhất cho port/web probe dù subfinder rỗng. **Bỏ qua subfinder** khi target là IP hoặc có port tường minh (`is_ip`/`port` → không có subdomain để enum). → bảng `subdomains`.
- **Prerequisite**: không.
- **Hằng số**: threads 50 · timeout 30s/exec · subprocess 300s.

## 2. SCAN_PORT — `recon/port_worker.py` ✅
- **Tool**: `naabu -list {hosts} -json -rate 1000 -c 50 -timeout 5 -retries 1 [-p custom | -top-ports N] [+ -p {target_port}]`
- **Trigger**: có `workspace_id`. **Prerequisite**: RECON_SUBDOMAIN (cần subdomains).
- **Làm gì**: port scan host list (subdomains + **bare target host** từ `db.get_target`); map `port → service_name + service_category`
  qua dict **PORT_SERVICES** (130+ entry). Đánh dấu host alive/dead theo có port mở. → bảng `ports` (+ update `subdomains.is_alive`, ip).
- **Port tường minh của target** (vd `:9999`) LUÔN được quét: naabu union được `-top-ports N` với `-p {target_port}` → giữ sweep + chắc chắn có port target.
- **service_category**: `web | database | mail | remote | messaging | other` — **quan trọng**: domain vuln dùng category này để chọn target (web → web probe; database/remote → network_service).
- **Hằng số**: rate 1000 pkt/s · concurrency 50 · timeout 5s · subprocess 1800s.

## 3. SCAN_WEB_INFO — `recon/web_probe_worker.py` ✅
- **Tool**: `httpx` (chính) + `whatweb` (enrich).
- **Trigger**: có web port (`service_category='web'`) **HOẶC** có target. **Prerequisite**: không bắt buộc — luôn **seed root domain target** từ bảng `targets` nên chạy được dù chưa SCAN_PORT.
- **Làm gì**: build URL `scheme://host:port` (port luôn tường minh) từ **(a)** web ports (SCAN_PORT) **+ (b) seed root domain** (`_target_seed_urls` đọc cột chuẩn hoá `scheme/host/port` của target: có cả 2→giữ nguyên; chỉ scheme→port mặc định; chỉ port→suy scheme; chỉ host→thử cả http:80+https:443; fallback `_parse_domain_seed_urls` cho row chưa backfill) → httpx (`-title -status-code -tech-detect -server -follow-redirects -max-redirects 3 -timeout 10 -threads 50`) → merge tech từ whatweb (detect CMS). → bảng `web_probes`. httpx tự loại URL chết → root domain port lạ (vd `:9999`) vào được pipeline mà không cần PORT_SERVICES gắn nhãn 'web'.
- **Suy scheme https**: `HTTPS_PORTS={443,4443,8443,9443,10443}`, `HTTPS_SERVICES={https,https-alt,ssl/http,ssl/https}`; còn lại http.
- **Output quan trọng**: `technologies[]` (driver cho detect() của các domain vuln cms/software/cloud), `is_alive`, `scheme`.
- **Hằng số**: httpx threads 50 · redirect 3 · timeout 10s · whatweb timeout 600s · subprocess 1800s.

## 4. RECON_WEB_CRAWL — `recon/web_crawl_worker.py` ✅
- **Tool**: `katana -list {urls} -j -d {depth} -c 10 -p 10 -timeout 10 -nc -fx [-jc][-kf all]`
- **Trigger**: có live web probe. **Prerequisite**: SCAN_WEB_INFO.
- **Làm gì**: crawl từ live probe → URL + form. Parse `<form>/<input>/...`, detect CSRF qua
  **CSRF_FIELD_NAMES** (`_token,csrf_token,_csrf,nonce...`), resolve action URL, track enctype.
  → bảng `web_crawl_urls` + `web_crawl_forms`.
- **Hằng số**: depth mặc định 3 · concurrency 10 · timeout 10s · subprocess 3600s.

## 5. RECON_ENDPOINT_NORMALIZE — `recon/endpoint_normalize_worker.py` ✅
- **Tool**: Python thuần (+ `requests` fetch HTML khi cần).
- **Trigger**: có `workspace_id`; đọc `web_crawl_urls` + `web_crawl_forms`. **Prerequisite**: RECON_WEB_CRAWL.
- **Làm gì**: chuẩn hoá endpoint để fuzz param:
  - Loại static ext (`STATIC_EXTENSIONS`: js/css/png/...), loại URL nguồn JS/TS.
  - Chuẩn hoá path: segment động (UUID / số / hash) → `{id}` (regex `RE_DYNAMIC_SEGMENT`).
  - Trích query param, dedup theo `(host, norm_path, param_names)`; lọc param tên là biểu thức JS (`RE_JS_PARAM`).
  - Chuẩn hoá form → field (name/type/value/dynamic/required), map enctype → Content-Type.
  - Fetch tối đa 200 trang HTML để trích thêm form. → bảng `fuzz_endpoints`.
- **Hằng số**: HTML fetch ≤ 200 trang · timeout 8s · pool 20 · tên param ≤ 60 ký tự · ≤ 20 JS/trang.

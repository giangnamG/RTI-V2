# Rule nghiệp vụ: Vuln — Cloud (Firebase + AWS/GCP/Azure/Takeover)

Taxonomy: cloud = bề mặt **BaaS/cloud tiếp xúc qua HTTP** (khác `network_service` là port-based).
Quy ước chung: xem [dispatch-and-conventions.md](dispatch-and-conventions.md).

---

## 1. Firebase — `vuln/cloud/firebase_worker.py` ✅ (engine: OpenFirebase, READ-ONLY)

- **tool**: `firebase` (binary thật: `openfirebase` v1.3.0, cài trong `worker.Dockerfile.dev`).
- **input_source**: `workspace` · **detect()**: luôn True · **is_available**: `shutil.which("openfirebase")`.
- **handles_tool**: `'firebase'` (chạy hết) + `'firebase-{rtdb|firestore|storage|config|functions}'`.
- **CHÍNH SÁCH: chỉ READ-ONLY** — chỉ dùng `--read-*`, **không bao giờ** `--write-*`.

### Luồng
1. **PREFILTER** `db.get_firebase_nuclei_signals(ws, target_id)` — query `findings_nuclei` WHERE
   `template_id/url/extracted_results ILIKE '%firebase%'` → host dùng Firebase + seed (authDomain/projectId).
2. **DISCOVERY** `_discover_config(url)` — fetch HTML + JS, regex lấy `apiKey/authDomain/databaseURL/projectId/storageBucket/messagingSenderId/appId` (chỉ host đã lọc).
   - **FALLBACK**: scope chưa có tín hiệu Nuclei → quét discovery **mọi** live web probe (chậm hơn).
3. **projectId**: trực tiếp, hoặc suy từ authDomain (`*.firebaseapp.com`/`*.web.app` → bỏ hậu tố).
4. **OPENFIREBASE**: `openfirebase --project-id {pid} [--api-key --app-id] --read-{check} --output-dir tmp --scan-rate 5`.
5. **PARSE** `*_scan.json` → finding khi `unauth.security` bắt đầu `PUBLIC` **hoặc** `verdict ∈ {public,open,writable,accessible}`.

### Component ↔ flag ↔ severity ↔ source_tool
| Component | flag | service (scan.json) | source_tool | severity |
|---|---|---|---|---|
| RTDB | `--read-rtdb` | rtdb | firebase-rtdb | critical |
| Firestore | `--read-firestore` | firestore | firebase-firestore | critical |
| Storage | `--read-storage` | storage | firebase-storage | high |
| Remote Config | `--read-config` | remote_config | firebase-config | medium |
| Functions | `--read-functions` | cloud_functions | firebase-functions | medium |

- **`PUBLIC_SA`** (service account lộ) → nâng severity = **critical** (revoke + xoay key ngay).
- **Functions** tự probe **đa region** (GCP coi mỗi region là deployment độc lập).
- Tab UI **Overview** chỉ mô tả component — **không scan**, không gửi gì xuống worker.
- **type**: `misconfiguration`. **Hằng số**: HTTP 12s · JS 8s/≤2MB/≤20 file · openfirebase 600s/host · scan-rate 5 · snippet 300 ký tự.

### Config extract per-target ✅

Mỗi lần scan (bất kỳ component nào), worker `_store_config` lưu **Firebase web config** trích từ host
(`apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId`) vào bảng
`extracted_firebase_config` (migration 000018, append-only, scope per-target). Lưu **kể cả khi chưa đủ
projectId** để chạy OpenFirebase.

- Endpoint `GET /firebase-configs?target=` → **1 row/target** (`DISTINCT ON (COALESCE(target_id,host))`,
  config mới nhất). UI: VIEW tab **Config** trong panel Firestore (ngay sau Findings) — cột đầu = target,
  các cột sau = field config + CopyButton. Tab Config chỉ-đọc (ẩn nút Run; config sinh ra khi chạy scan khác).
- ⚠️ **Prefilter + target_ids**: `get_firebase_nuclei_signals` lọc theo `target_id`, nhưng `findings_nuclei.target_id`
  hiện **NULL** → chọn target cụ thể khi Run scan có thể không match tín hiệu Nuclei → fallback web probes.
  Chạy scan **không chọn target** (toàn workspace) thì prefilter hoạt động. (Tồn tại từ trước, không riêng config.)

### Firestore enumeration (Documents · Collections · Crawl) ✅

Ngoài finding misconfig, component Firestore enumerate dữ liệu — lưu **append-only, scope PER-TARGET**
(bảng `firestore_collections`, `firestore_documents`; xem [data-model.md](data-model.md) R6+R7).

- **Collections** (tab + nút Fuzz): tool `firebase-firestore-fuzz` →
  `openfirebase --read-firestore --fuzz-collections <wordlist>`. **Wordlist**:
  - mặc định = **bundled** của openfirebase (`top-50/250/500`);
  - hoặc chọn từ **module Wordlist** → frontend gửi `fuzz_wordlist` = **path tuyệt đối**; worker
    `_resolve_fuzz_wordlist` ưu tiên path tồn tại (`Path.exists`, mirror `dir_fuzz_worker`), else bundled.
  → lưu `firestore_collections` (collection, doc_count, url, project_id, api_key).
- **Documents** (tab): liệt kê document tìm được (url · api_key · collection). scan.json
  **truncate** `response_content` → worker `_fetch_collection_docs` fetch lại 1 trang documents
  (read-only, CAP pageSize) → `firestore_documents`. Endpoint **phân trang** (`limit/offset`, trả `total`).
- **Trình bày (Collections + Documents)**: cùng bố cục **group-by-target** (card mỗi target:
  `domain · project · count`) + **select target** + **ô search** + URL kèm `CopyButton`
  (xem `docs/frontend-design.md` Pattern 10). Documents phân trang → select target lọc **server-side**
  (`?target=`), search lọc client-side trên trang hiện tại; Collections (không phân trang) lọc cả hai client-side.
- **Crawl** (tab, tool `firebase-firestore-crawl`) ✅: dump **TOÀN BỘ** document của các collection
  **latest-run** mỗi target (read-only REST, phân trang pageSize=300). Chạy **đa target** (chọn → `target_ids`).
  **Tách tầng lưu trữ (R7)**: raw JSON → **file** trên volume `worker_data`
  (`/data/firestore_crawl/{ws}/{target|untargeted}/{job}/{collection}.json` + `overview.json`),
  Postgres chỉ giữ **metadata** (bảng `firestore_crawls`, migration 000017: doc_count, byte_size,
  file_path, status `ok|partial|error`, `truncated`). Cap: `max_docs`/collection (mặc định 100k, trần 3M,
  payload override), time-budget 300s/coll + 1800s/job → chạm cap đặt `truncated=true`+`partial` (KHÔNG cắt thầm).
  Tải file: `GET /firestore-crawls/download?path=` (validate path trong base dir + đúng workspace, chống `..`).
  api-go mount `worker_data:/data:ro` để stream file.
- **Target attribution**: worker map `host→target_id` bằng khớp domain (`db.get_target_domains`) vì
  `target_id` không propagate trong pipeline. Crawl thì dùng `target_id` ĐÃ lưu trong `firestore_collections`.
- **Plumbing tham số**: `dispatch_worker` forward `fuzz_wordlist` + `max_docs` (payload) vào `ws_target`
  cho workspace-handler — trước chỉ có `tools/target_ids` (wordlist selector từng bị bỏ qua, nay đã sửa).
- **Lịch sử chạy (Collections)** ✅: bảng chính hiện latest-run (R6); drawer "Lịch sử chạy" xem mọi lần
  (R3). 2 chế độ như VulnHistoryDrawer: **per-collection** (click row → timeline doc_count theo thời gian,
  badge MỚI NHẤT/LẦN ĐẦU) | **per-run** (nút ⧖ → nhóm theo `job_id` = từng phiên fuzz/scan). Nguồn:
  `GET /firestore-collections/history?target=` (tất cả rows, không lọc latest-run).
- Endpoint: `GET /firestore-collections`, `GET /firestore-collections/history?target=`,
  `GET /firestore-documents?limit=&offset=&target=`, `GET /firestore-crawls?target=`
  (latest-run **per target**) + `GET /firestore-crawls/download?path=`.

---

## 2–5. AWS · GCP · Azure · Subdomain Takeover — ⛔ STUB
`detect()` đã có; `run()` trả `[]`. tool = `nuclei`, input_source = `web_probes`, prereq SCAN_WEB_INFO.

| Worker | detect() (host/tech pattern) | Dự kiến check |
|---|---|---|
| AWS (`aws_worker.py`) | host chứa `amazonaws.com/cloudfront.net/s3./elasticbeanstalk.com` hoặc tech `aws/amazon` | `nuclei -tags aws,s3,cloud`: S3 listing, metadata SSRF 169.254.169.254, CloudFront origin |
| GCP (`gcp_worker.py`) | host chứa `googleapis.com/appspot.com/storage.cloud.google.com/run.app` hoặc tech `gcp/google cloud` | `nuclei -tags gcp,cloud`: GCS public, metadata SSRF |
| Azure (`azure_worker.py`) | host chứa `azurewebsites.net/blob.core.windows.net/azure.com/cloudapp.azure.com` hoặc tech `azure/microsoft` | `nuclei -tags azure,cloud`: blob public, metadata SSRF |
| Subdomain Takeover (`subdomain_takeover_worker.py`) | `is_alive` (generic) | `nuclei -tags takeover`: CNAME → dịch vụ chưa đăng ký (`TAKEOVER_CNAMES`: github.io, herokuapp, azurewebsites, netlify, vercel, s3, storage.googleapis, shopify) |

> Các worker nuclei này **chưa expose trên UI** (Cloud module chỉ còn module con Firebase).

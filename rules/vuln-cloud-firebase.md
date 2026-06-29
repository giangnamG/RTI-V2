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

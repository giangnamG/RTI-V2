# Rule nghiệp vụ: Vuln — CMS

Detect từ `web_probes.technologies`. input_source = `web_probes`, prereq SCAN_WEB_INFO.
Quy ước chung: [dispatch-and-conventions.md](dispatch-and-conventions.md). Nav 3 tầng: CMS → **WordPress / Joomla / Drupal** → tool.

## WordPress — WPScan + WPProbe ✅ (bảng riêng, streams_to_db)

Cả 2 worker: `domain="cms"`, `input_source="web_probes"`, `detect()` = `"wordpress" in technologies`,
`streams_to_db=True` (tự INSERT vào bảng riêng — mirror NucleiWorker ghi `findings_nuclei`).
`scheme://host:port` lấy từ `web_probes`; chạy song song qua scan pool (xem dispatch-and-conventions R10).

| Worker | tool | Bảng riêng (migration 000019) | Lệnh |
|---|---|---|---|
| WPScan (`wpscan_worker.py`) | wpscan | `wpscan_finding` | `wpscan --url {scheme}://{host}:{port} -e vp,vt --detection-mode {WPSCAN_MODE} --random-user-agent --force --ignore-main-redirect --no-banner --no-update --format json [--api-token]` |
| WPProbe (`wpprobe_worker.py`) | wpprobe | `wpprobe_finding` | `wpprobe scan -u {url} --mode {WPPROBE_MODE} -o out.json` |

**Đặc điểm chính:**
- **2 bảng riêng** `wpscan_finding` / `wpprobe_finding` (vì shape khác `findings` chung): cột chung +
  `component`/`plugin`/`version` + `refs`/`raw` JSONB. Backend **1 repo `WPRepo`** → endpoint
  `GET /wpscan-findings` · `/wpprobe-findings` (+`/history`) · `/wordpress-targets`. Latest-run per target.
- **`--no-update`**: BẮT BUỘC — wpscan có prompt tương tác "update DB?" → treo trong subprocess nếu thiếu.
  DB update sẵn lúc build image (`wpscan --update`).
- **Dedupe port 80**: `db.host_has_live_https_wordpress` → skip http khi host đã có https WordPress
  (tránh quét trùng do 301). `/wordpress-targets` cũng gộp canonical 1 host/https.
- **`WPSCAN_MODE`** (env, mặc định `mixed`): passive | mixed (nhanh) | aggressive (sâu nhưng chậm,
  brute-force 652 theme location — dễ bị Wordfence/LiteSpeed throttle → timeout). Plugin vốn passive-detected
  nên mixed ≈ aggressive về plugin/CVE.
- **`WPPROBE_MODE`** (env, mặc định `stealthy`): stealthy (REST API, nhanh, ÍT bị chặn) | hybrid (thêm
  brute-force, chậm + dễ bị throttle).
- **Xoay vòng API key**: `WPSCAN_API_TOKEN` chứa NHIỀU key (phân tách `,` / khoảng trắng / xuống dòng);
  key gặp `API limit reached` → tự XOAY sang key kế; hết sạch → quét không-token (enum-only, thiếu CVE).
  Free = 25 req/ngày/key. `_tokens()` parse, `_is_api_limit()` phát hiện.
- **Timeout/host** (env): `WPSCAN_TIMEOUT` (300), `WPPROBE_TIMEOUT` (300).
- **Severity/type**: CVE → `vulnerability` (severity theo CVSS/bucket); xmlrpc/readme/dir-listing →
  `informational`/`exposure`. WPProbe: `component` ∈ plugin|theme.
- **UI** (`WordPressPanel.tsx`): liệt kê toàn bộ host WordPress + nút Run từng tool (theo dõi job
  **per-tool** = 2 poller độc lập → chạy song song không khoá nhau) + bảng findings theo tool đang chọn.

> **Thực tế:** WPProbe tin cậy (REST, không bị chặn kiểu dò-path). WPScan dò-path (hàng trăm request) →
> **chậm/timeout trên site có Wordfence/LiteSpeed/Cloudflare** (phần lớn site production) + cần quota token
> cho CVE. Ưu tiên WPProbe; WPScan bổ trợ khi target không bị bảo mật chặn + còn quota.

## Joomla · Drupal — ⛔ STUB
`detect()` đã có, `run()` trả `[]`.

| Worker | tool | detect() | Dự kiến |
|---|---|---|---|
| JoomScan (`joomscan_worker.py`) | joomscan | `"joomla" in technologies` | `joomscan --url {u}` |
| Droopescan (`droopescan_worker.py`) | droopescan | tech chứa `drupal/silverstripe/moodle` | `droopescan scan drupal -u {u}` |

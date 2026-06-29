# Rule nghiệp vụ: Fuzzing

Brute-force thư mục/file và phát hiện tham số ẩn. Append-only (xem [data-model.md](data-model.md)).

---

## 1. FUZZ_DIR — `fuzz/dir_fuzz_worker.py` ✅
- **Tool**: `ffuf -u {base}/FUZZ -w {wordlist} -mc {status_filter} -t {threads} -timeout 10 -of json -s -ac [-e {ext}]`
- **Trigger**: có live web probe. **Prerequisite**: SCAN_WEB_INFO.
- **Làm gì**: dedup live probe theo `(scheme, netloc)` → **tối đa 20 base URL/job**. Resolve wordlist
  (`"common"` → `/app/wordlists/common.txt` | đường dẫn tuyệt đối). Chạy ffuf, dedup output mỗi base. → bảng `dir_fuzz_results`.
- **Rule "is_interesting"**: `status_code NOT IN {404, 429} AND content_length > 200`
  (`BORING_STATUS_CODES = {404, 429}`).
- **Hằng số**: threads mặc định 40 · timeout 10s · subprocess 1800s · max 20 base URL/job.

## 2. FUZZ_PARAM — `fuzz/param_fuzz_worker.py` ✅
- **Tool**: `arjun -u {url} -m {method} -oJ -t {threads} -q [--stable]`
- **Trigger**: có `fuzz_endpoints`. **Prerequisite**: RECON_ENDPOINT_NORMALIZE.
- **Làm gì**: dedup `fuzz_endpoints` theo `(url, method)` → **tối đa 100/job**. Arjun tìm param ẩn,
  dedup param (flat, giữ thứ tự). → bảng `fuzz_param_results`.
- **Hằng số**: threads mặc định 5 · stable mặc định true · subprocess 300s · max 100 endpoint/job.

> `fuzz_param_results` là **input** cho domain vuln `web_params` (SQLMap/Dalfox) — xem
> [vuln-web-params.md](vuln-web-params.md).

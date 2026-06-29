# Rule nghiệp vụ: Vuln — Common

Chạy trên **mọi** live target. Quy ước chung: xem [dispatch-and-conventions.md](dispatch-and-conventions.md).

---

## 1. Nuclei — `vuln/common/nuclei_worker.py` ✅ (streams_to_db, workspace-level)
- **input_source**: `workspace` · **streams_to_db**: True · **detect()**: luôn True.
- **Prerequisite**: SCAN_PORT + SCAN_WEB_INFO (để dựng URL list).
- **Làm gì**:
  1. Dựng URL list từ live web probes (scheme chính xác) + web ports chưa probe (suy scheme).
  2. `httpx` (timeout 8s) lọc URL thực sự serve HTTP (tránh nuclei treo trên port chết).
  3. `nuclei -l {urls} -j -silent -no-color -nmhe` (`-nmhe` = không blacklist host khi WAF chặn).
  4. Stream JSONL → parse realtime → `insert_nuclei_findings()` (bảng **`findings_nuclei`**).
- **Severity map**: `critical/high/medium/low/info` giữ nguyên; `unknown → info`.
- **Type theo tag** (`_TAG_TYPE`): `cve→vulnerability`, `misconfig→misconfiguration`, `exposure→exposure`,
  `default-login→credential`, `tech→informational`; mặc định `vulnerability`.
- **Title**: `name + matcher-name + extracted (≤3 giá trị)`; **evidence**: REQUEST+RESPONSE (≤500 ký tự mỗi cái).
- **Hằng số**: nuclei subprocess **10800s (3h)** · auto `-update-templates`.
- **Lưu ý**: tín hiệu `firebase-database-extractor` của Nuclei chính là **prefilter** cho module
  Firebase (xem [vuln-cloud-firebase.md](vuln-cloud-firebase.md)).

## 2. testssl.sh — `vuln/common/testssl_worker.py` ✅
- **input_source**: `web_probes` · **detect()**: `scheme == "https" AND is_alive`.
- **Prerequisite**: SCAN_WEB_INFO. **Output**: bảng `findings`, `source_tool='testssl.sh'`.
- **Làm gì**: `testssl.sh --jsonfile out --quiet --color 0 --connect-timeout 30 --openssl-timeout 10 --sneaky --parallel {host}:{port}` → parse JSON, lọc theo severity.
- **Severity map** (`_SEV_MAP`): `CRITICAL→critical, HIGH→high, MEDIUM→medium, LOW/WARN/WARNING→low, INFO/OK/DEBUG→info`.
- **Bỏ qua** (không tạo finding): `_SKIP_SEV = {OK, INFO, DEBUG}`.
- **Type**: luôn `misconfiguration`. **Label**: map 30+ check-id → tên dễ đọc (BEAST, POODLE, HEARTBLEED, ROBOT, HSTS, cert_*, tls1/ssl3, cipherlist_*...).
- **Hằng số**: connect 30s · openssl 10s · subprocess 360s.

# Rule nền: Dispatch & Quy ước Vuln Scan

Quy tắc điều phối job + interface chung mà mọi worker vuln phải tuân theo.

## R1 — Job types (Redis queue)

```
RECON_SUBDOMAIN · SCAN_PORT · SCAN_WEB_INFO · RECON_WEB_CRAWL · RECON_ENDPOINT_NORMALIZE
FUZZ_DIR · FUZZ_PARAM
VULN_DISPATCH        ← 1 job điều phối tất cả tool vuln
```

## R2 — VULN_DISPATCH payload

```json
{
  "workspace_id": "uuid",
  "target_id":    "uuid | null",          // null = tất cả targets
  "target_ids":   ["uuid", ...],          // optional, ưu tiên hơn target_id
  "domains":      ["common","cms","software","cloud","discovery","network_service","web_params"],
  "tools":        ["nuclei","firebase-rtdb"] // optional, lọc handler
}
```
- **DEFAULT_DOMAINS** (khi không truyền `domains`): `["common","cms","software","cloud","discovery"]`.

## R3 — Registry pattern

- Mỗi worker tự `registry.register(MyWorker())` ở cuối file.
- `dispatch_worker.py` `import` tất cả worker → registry đầy đủ.
- Lọc: `get_all()` → lọc theo `domain ∈ domains` và (nếu có `tools`) `any(h.handles_tool(t) for t in tools)`.

## R4 — BaseVulnHandler interface

```python
class BaseVulnHandler:
    domain: str          # common|cms|software|cloud|discovery|network_service|web_params
    tool:   str          # tên binary/script (vd 'nuclei','firebase')
    input_source: str    # 'web_probes'(default) | 'ports' | 'fuzz_params' | 'workspace'
    streams_to_db: bool  # False(default) | True
    requires_binary: bool# True(default) | False

    def is_available() -> bool        # mặc định shutil.which(self.tool)
    def handles_tool(key) -> bool     # mặc định key == self.tool
    def detect(target) -> bool        # điều kiện chạy trên target
    def run(target, job_id, ws_id, target_id) -> list[dict]
    def _finding(**kwargs) -> dict    # tự điền source_tool + source_domain
```

### R4.1 — `handles_tool()` (1 worker phục vụ nhiều tool key)
- Mặc định khớp đúng `self.tool`.
- Override khi 1 worker phục vụ nhiều tool key — vd `FirebaseWorker.handles_tool` khớp
  `'firebase'` **và** `'firebase-rtdb/firestore/storage/config/functions'`. Khi đó worker đọc
  `target['tools']` để biết chạy check nào.

## R5 — Input source routing

| input_source | Nguồn dữ liệu | Cách chạy |
|---|---|---|
| `workspace` | toàn workspace | chạy **1 lần** (vd Nuclei, Firebase), nhận `target={ws_id,target_id,target_ids,tools}` |
| `web_probes` | `get_live_web_probes()` | loop **mỗi live probe** |
| `ports` | `get_open_ports()` | loop **mỗi open port** |
| `fuzz_params` | `get_fuzz_param_results_for_vuln()` | loop **mỗi param result** |

## R6 — Lưu findings: 2 bảng

- **`findings_nuclei`** — RIÊNG cho Nuclei (có `template_id`, `matcher_name`, `protocol`,
  `extracted_results` JSONB). Insert: `insert_nuclei_findings()`.
- **`findings`** — tất cả tool còn lại. Insert: `insert_vuln_findings()`.
- **Vì sao tách?** Output nuclei có cột `extracted_results` (mảng) không khớp schema chung.

### R6.1 — `streams_to_db`
- `True` (vd NucleiWorker): worker tự insert realtime từng finding → dispatcher **bỏ** batch insert.
- `False` (mặc định): dispatcher gọi `insert_vuln_findings()` sau khi `run()` trả về.

## R7 — Source tagging (bắt buộc)
- `_finding()` tự điền `source_tool = self.tool`, `source_domain = self.domain`.
- Override `source_tool` per-finding khi 1 worker tạo nhiều loại finding — vd Firebase:
  `firebase-rtdb`, `firebase-firestore`... (để frontend lọc theo tab component).

## R8 — Skip rules (dispatcher log, không tạo finding)
- `is_available()` false → `status=skipped, reason=not_installed`.
- `detect()` false → `status=skipped, reason=not_applicable`.

## R9 — Thang giá trị chuẩn
- **severity**: `critical | high | medium | low | info`.
- **type**: `vulnerability | misconfiguration | exposure | credential | informational`.
- Mỗi worker tự định nghĩa SEV-map từ output tool → thang trên (xem rule từng nghiệp vụ).

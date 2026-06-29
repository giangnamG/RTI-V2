# Rule nền: Data Model — Append-Only / Lịch sử thu thập

Mô hình dữ liệu **cốt lõi** của toàn hệ thống. Áp dụng cho **mọi** nghiệp vụ thu thập
(recon, fuzzing, vuln).

## R1 — Append-only: mỗi lần scan = INSERT rows MỚI

- Mọi worker khi có kết quả → **`INSERT` rows mới**, **KHÔNG `UPDATE`/`DELETE`** rows cũ.
- **Không dùng `ON CONFLICT`/upsert.** Mỗi record là một **snapshot** tại thời điểm thu thập
  (`created_at`).
- Áp dụng cho: `subdomains`, `ports`, `web_probes`, `web_crawl_urls`, `web_crawl_forms`,
  `fuzz_endpoints`, `dir_fuzz_results`, `fuzz_param_results`, `findings`, `findings_nuclei`.
- Nguồn: `workers/core/db.py` (header: *"Append-only — mỗi lần scan tạo records mới, KHÔNG update/xóa records cũ"*).

## R2 — Trạng thái mới nhất = DISTINCT ON (key) ORDER BY created_at DESC

- UI/worker lấy trạng thái hiện tại bằng `SELECT DISTINCT ON (<key>) ... ORDER BY <key>, created_at DESC`.
- Ví dụ:
  - `get_alive_hosts` → `DISTINCT ON (domain)`
  - `get_live_web_probes` → `DISTINCT ON (host, port)`
  - endpoint/form/param queries → `DISTINCT ON (url[, method])`
- Index hỗ trợ: `idx_web_probes_history ON (workspace_id, host, created_at DESC)`, v.v.

## R3 — Lịch sử = TẤT CẢ rows của 1 entity

- "Lịch sử thu thập" = trả về **mọi** row của entity theo thời gian (không DISTINCT).
- Backend: history endpoints (`subdomainApi.history`, `portApi.history`, `web-probes/history`).
- Frontend: **`HistoryDrawer`** (slide-in drawer) — mỗi record = 1 snapshot, hiển thị theo
  thứ tự thời gian. Xem `docs/frontend-design.md` § Pattern 7.

## R4 — Ngoại lệ DUY NHẤT: bảng `jobs` là mutable

- `jobs` chỉ có **1 row mỗi job**, được `UPDATE` status theo thời gian
  (`pending → running → completed | failed`), kèm `started_at`/`finished_at`/`result`/`error_message`.
- Đây là **ngoại lệ duy nhất** với mô hình append-only.

## R5 — Cấm

- **KHÔNG** ghi vào `subdomains`/`ports`/... bằng `UPDATE` — chỉ `INSERT`
  (`docs/worker-design.md`: *"append-only, chỉ INSERT"*).
- Không xoá record cũ để "dọn" — lịch sử là tính năng, không phải rác.

## R6 — Áp dụng cho vuln findings (đã implement)

Findings cũng append-only (mỗi Run 1 tool → rows mới gắn `job_id` + `created_at`, không ghi đè).

**Bảng chính = RUN MỚI NHẤT** (theo R2):
- `findings` (generic): `ListFindings` trả run mới nhất **per `source_tool`**
  (`first_value(job_id) OVER (PARTITION BY source_tool ORDER BY created_at DESC)`).
- `findings_nuclei`: `List` trả run mới nhất (single partition — nuclei chạy workspace-level).

**Lịch sử = tất cả lần chạy** (theo R3) — endpoint riêng:
- `GET /vuln-findings/history?domain=&tool=` · `GET /nuclei-findings/history`.
- Frontend `VulnModule` → `VulnHistoryDrawer` (reuse pattern recon), 2 chế độ:
  - **Per-finding** (click 1 row): lọc theo identity `(title, host, url)` → timeline các lần phát
    hiện của finding đó, badge `MỚI NHẤT`/`LẦN ĐẦU`, **hiển thị full thông tin** (type, status, host,
    url, port, cve, cvss, evidence, remediation; nuclei thêm template/matcher/protocol/extracted) —
    **KHÔNG hiển thị id/job_id/index DB**.
  - **Per-tool** (nút ⧖ Lịch sử): nhóm theo `job_id` = từng phiên scan.

> Quy tắc: bảng kết quả vuln **luôn chỉ hiện run mới nhất**; muốn xem lịch sử/diff giữa các lần
> quét → dùng HistoryDrawer (lọc theo `job_id`/`created_at`). Không tích luỹ trùng lặp trên bảng chính.

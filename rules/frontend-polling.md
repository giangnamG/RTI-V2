# Rule nền: Frontend Job Polling

Quy tắc theo dõi tiến trình background job từ frontend. **MỌI bảng/trang đều dùng CHUNG một
cơ chế** — hook [`useJobPolling`](../frontend/src/hooks/useJobPolling.ts). KHÔNG tự viết
polling loop riêng (kể cả module Vuln).

## R1 — Một cơ chế duy nhất: `useJobPolling`

```tsx
const { activeJob, setActiveJob, elapsed } = useJobPolling(
  wsid,
  'SCAN_PORT',          // job_type — phải khớp backend
  loadData,             // onCompleted (sync hoặc async đều được)
  3000,                 // intervalMs (mặc định 3000)
  { onProgress, matchJob }  // optional
)
```

Dùng cho **tất cả** tính năng có background job: recon (subdomain/port/web/crawl/endpoint),
fuzzing (dir/param), và **vuln** (VULN_DISPATCH). Áp dụng ở: 5 trang recon + 2 trang fuzzing
+ `VulnModule` + Vuln Overview.

## R2 — Hành vi chuẩn của hook

- **Poll mỗi `intervalMs` (mặc định 3000ms)** — `GET /jobs/:id`.
- **Restore-on-mount**: tìm job `running|pending` cùng `jobType` (lọc thêm bằng `matchJob` nếu có)
  → navigate đi rồi quay lại vẫn thấy banner + tiếp tục poll.
- **Dừng** khi `completed` (gọi `onCompleted()`) hoặc `failed`. Cleanup khi unmount/đổi job.
- **`elapsed`**: đo thời gian chạy dạng **`HH:MM:SS`** (tick 1s nội bộ), tính từ `started_at` →
  `finished_at` (khi xong) hoặc hiện tại (khi đang chạy).

### Tham số optional
- **`onProgress(job)`** — gọi **mỗi lần poll** (mỗi 3s). Dùng để **refresh kết quả realtime**
  trong khi job đang chạy (vd VulnModule gọi `doFetch` để cập nhật findings live).
- **`matchJob(job)`** — predicate lọc job khi restore-on-mount. Dùng khi nhiều trang chia sẻ
  cùng `job_type` (vd VULN_DISPATCH): VulnModule khớp theo `payload.domains` chứa domain của module.

## R3 — Hiển thị elapsed HH:MM:SS

Banner job ở **mọi trang** phải hiện `elapsed` (HH:MM:SS) — `<span className="font-mono tabular-nums">{elapsed}</span>`.
Banner chuẩn 4 màu theo `running|pending|completed|failed`, kèm nút × để dismiss khi xong.

## R4 — Module Vuln (case "giàu") dùng đúng hook

`VulnModule` **không còn tự viết `setInterval`** — nó dùng `useJobPolling` với:
- `onProgress: doFetch` → refresh findings mỗi 3s khi scan chạy.
- `matchJob` → khớp VULN_DISPATCH theo `payload.domains` (đúng module common/cloud/...).
- `elapsed` → hiển thị HH:MM:SS trên banner.

→ Khi thêm trang scan mới cần refresh-realtime + đếm giờ, **dùng `useJobPolling` + `onProgress`**,
KHÔNG dựng cơ chế riêng.

## R5 — Backend tương ứng
- API job **non-blocking**: trả ngay sau khi ghi DB; worker xử lý bất đồng bộ.
- Frontend poll `GET /jobs/:id` mỗi 3s (`docs/backend-design.md`, `docs/worker-design.md`).

> `onCompleted` khai báo `() => void | Promise<void>` (chấp nhận cả sync) — truyền `loadData`
> (async) hay `() => {}` (sync) đều hợp lệ.

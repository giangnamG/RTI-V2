# RTI-V2 — Rules

Tổng hợp **toàn bộ rule (quy tắc) của hệ thống**, chia theo nghiệp vụ. Đây là nguồn tham chiếu
duy nhất cho: rule phát hiện (detection) của từng tool, quy ước dữ liệu, và quy ước kỹ thuật.

## Cấu trúc

### Rule nền (cross-cutting — áp dụng cho mọi nghiệp vụ)
| File | Nội dung |
|---|---|
| [data-model.md](data-model.md) | **Append-only / Lịch sử thu thập** — mô hình dữ liệu cốt lõi |
| [dispatch-and-conventions.md](dispatch-and-conventions.md) | Job types, registry, BaseVulnHandler, `handles_tool`, 2 bảng findings, source tagging, thang severity/type |
| [frontend-polling.md](frontend-polling.md) | Polling job CHUNG (`useJobPolling`) — poll 3s, elapsed HH:MM:SS, onProgress, matchJob |
| [frontend-nav.md](frontend-nav.md) | Nav nhiều tầng (sub-nav dùng chung) + breadcrumb động suy từ URL; không render lại title ở thân trang |

### Rule theo nghiệp vụ
| File | Nghiệp vụ | Trạng thái |
|---|---|---|
| [recon.md](recon.md) | Subdomain · Port · Web Probe · Crawl · Endpoint Normalize | ✅ đã implement |
| [fuzzing.md](fuzzing.md) | Dir Fuzz · Param Fuzz | ✅ đã implement |
| [vuln-common.md](vuln-common.md) | Nuclei · testssl.sh | ✅ đã implement |
| [vuln-cms.md](vuln-cms.md) | **WordPress (WPScan + WPProbe)** · JoomScan · Droopescan | ✅ WordPress (bảng riêng, key-rotation, dedup) / ⛔ Joomla·Drupal |
| [vuln-software.md](vuln-software.md) | GitLab · Jenkins · Confluence · Grafana · Tomcat · Spring Boot | ⛔ stub |
| [vuln-cloud-firebase.md](vuln-cloud-firebase.md) | **Firebase (OpenFirebase, read-only)** + AWS/GCP/Azure/Takeover | ✅ Firebase / ⛔ còn lại stub |
| [vuln-discovery.md](vuln-discovery.md) | Git · Env · CORS | ⛔ stub |
| [vuln-network-service.md](vuln-network-service.md) | Redis · MySQL · MongoDB · Elasticsearch | ⛔ stub |
| [vuln-web-params.md](vuln-web-params.md) | SQLMap · Dalfox | ⛔ stub |

## Quy ước đọc

- **Trạng thái**: ✅ FULLY IMPLEMENTED · ⛔ STUB/TODO (`detect()` đã có nhưng `run()` trả `[]`).
- **Trigger/detect**: điều kiện worker được chạy trên 1 target.
- **Thang severity**: `critical > high > medium > low > info`.
- **Type finding**: `vulnerability | misconfiguration | exposure | credential | informational`.
- Mỗi rule nghiệp vụ **tham chiếu** rule nền thay vì lặp lại (vd lưu findings → xem `dispatch-and-conventions.md`; lịch sử → xem `data-model.md`).

> Tài liệu thiết kế chi tiết: [`docs/vuln-scan-design.md`](../docs/vuln-scan-design.md),
> [`docs/worker-design.md`](../docs/worker-design.md), [`docs/frontend-design.md`](../docs/frontend-design.md).

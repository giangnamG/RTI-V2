# Rule nghiệp vụ: Vuln — Web Params (SQLi / XSS trên tham số)

input_source = **`fuzz_params`**, prereq **FUZZ_PARAM** (cần param đã phát hiện). **Toàn bộ ⛔ STUB**.
Quy ước: [dispatch-and-conventions.md](dispatch-and-conventions.md).

| Worker | tool | detect() | Check dự kiến |
|---|---|---|---|
| SQLMap (`sqlmap_worker.py`) | sqlmap | `len(params) > 0` | `sqlmap -u {u} -p {params} --batch --level 2 --risk 1`. ⚠️ **cần user xác nhận target** trước khi chạy (xâm lấn) |
| Dalfox (`dalfox_worker.py`) | dalfox | `method == "GET" AND len(params) > 0` | `dalfox url {u_with_params} --format json` (XSS, chỉ GET) |

> Đây là nhóm **xâm lấn** nhất (gửi payload injection). Khi implement: gate sau xác nhận,
> finding `source_domain='web_params'`, type `vulnerability`, severity theo loại (SQLi → critical/high, XSS → medium/high).

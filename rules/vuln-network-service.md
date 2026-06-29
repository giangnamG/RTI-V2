# Rule nghiệp vụ: Vuln — Network Service (port-based)

Taxonomy: service **lắng nghe port** trên host target (khác `cloud` là HTTP/BaaS).
input_source = **`ports`**, prereq SCAN_PORT. **Toàn bộ ⛔ STUB**.
Quy ước: [dispatch-and-conventions.md](dispatch-and-conventions.md).

| Worker | tool | detect() (service_name/port) | Check dự kiến |
|---|---|---|---|
| Redis (`redis_worker.py`) | nuclei | `redis` in service hoặc port `6379` | unauth PING, INFO, CONFIG GET |
| MySQL (`mysql_worker.py`) | nuclei | `mysql/mariadb` in service hoặc port `3306/3307` | anonymous login, root no-password, version banner |
| MongoDB (`mongodb_worker.py`) | nuclei | `mongo` in service hoặc port `27017` | unauth connect, db.stats(), liệt kê collection |
| Elasticsearch (`elasticsearch_worker.py`) | nuclei | `elastic` in service hoặc port `9200/9300` | `/_cat/indices`, `/_cluster/health` unauth read |

> Đây là nơi đặt **database pentest** (MySQL/Mongo... theo port) — KHÔNG phải Firebase (Firebase ở `cloud`).
> Khi implement: finding `source_domain='network_service'`, type `vulnerability|credential`.

# Rule nghiệp vụ: Vuln — CMS

Detect từ `web_probes.technologies`. input_source = `web_probes`, prereq SCAN_WEB_INFO.
**Toàn bộ ⛔ STUB** (`detect()` đã có, `run()` trả `[]`). Quy ước: [dispatch-and-conventions.md](dispatch-and-conventions.md).

| Worker | tool | detect() | Check dự kiến |
|---|---|---|---|
| WPScan (`wpscan_worker.py`) | wpscan | `"wordpress" in technologies` | `wpscan --url {u} --format json --enumerate vp,vt,u` (plugin/theme lỗ hổng, user) |
| JoomScan (`joomscan_worker.py`) | joomscan | `"joomla" in technologies` | `joomscan --url {u}` |
| Droopescan (`droopescan_worker.py`) | droopescan | tech chứa `drupal/silverstripe/moodle` | `droopescan scan drupal -u {u}` |

> Khi implement: parse output → `findings` với `source_domain='cms'`, severity theo CVSS/loại lỗ hổng.

# Rule nghiệp vụ: Vuln — Software (platform/app tự host)

Detect từ `technologies` / `title` / `web_server`. tool = `nuclei` (template chuyên biệt theo tag),
input_source = `web_probes`, prereq SCAN_WEB_INFO. **Toàn bộ ⛔ STUB**.
Quy ước: [dispatch-and-conventions.md](dispatch-and-conventions.md).

| Worker | detect() | Check dự kiến (`nuclei -tags ...`) |
|---|---|---|
| GitLab (`gitlab_worker.py`) | `gitlab` in technologies/title | `gitlab`: CVE-2021-22205, CVE-2023-7028, user enum, token exposure |
| Jenkins (`jenkins_worker.py`) | `jenkins` in technologies/title | `jenkins`: script console unauth, CVE-2024-23897 (file read) |
| Confluence (`confluence_worker.py`) | `confluence` in technologies/title | `confluence`: OGNL CVE-2021-26084, CVE-2022-26134, CVE-2023-22515 |
| Grafana (`grafana_worker.py`) | `grafana` in technologies/title | `grafana`: CVE-2021-43798 (path traversal), default admin:admin |
| Tomcat (`tomcat_worker.py`) | `tomcat` in technologies/web_server | `tomcat`: /manager default creds, CVE-2025-24813, PUT upload |
| Spring Boot (`springboot_worker.py`) | `spring` in technologies | `spring`: /actuator/* exposure, CVE-2022-22965 (Spring4Shell), H2 console |

> Khi implement: parse nuclei JSON → `findings` (`source_domain='software'`), severity theo template.
> Lưu ý: Common/Nuclei (workspace) đã quét toàn bộ template — cân nhắc để tránh trùng, software
> worker chỉ chạy template **chuyên biệt** theo tag của platform được detect.

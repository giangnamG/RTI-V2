# Rule nghiệp vụ: Vuln — Discovery (information disclosure)

input_source = `web_probes`, prereq SCAN_WEB_INFO. **Toàn bộ ⛔ STUB**.
Quy ước: [dispatch-and-conventions.md](dispatch-and-conventions.md).

| Worker | tool | detect() | Check dự kiến |
|---|---|---|---|
| Git (`git_worker.py`) | nuclei | `is_alive` | `/.git/config`, `/.git/HEAD`, `/.git/index`; nếu lộ → git-dumper dump source |
| Env/Config (`env_worker.py`) | nuclei (+httpx) | `is_alive` | check **SENSITIVE_PATHS** (dưới) hoặc `nuclei -tags exposure,config` |
| CORS (`cors_worker.py`) | corsy (`requires_binary=False`) | `is_alive` | `corsy -u {u}` / `nuclei -tags cors`: ACAO `*`, origin reflection, null origin |

**SENSITIVE_PATHS** (Env worker): `/.env, /.env.local, /.env.production, /.env.backup, /config.php,
/wp-config.php.bak, /database.yml, /config/database.yml, /.htpasswd, /web.config.bak, /backup.zip,
/backup.sql, /dump.sql`.

> Khi implement: finding `source_domain='discovery'`, type `exposure`; .git/.env lộ → high/critical.

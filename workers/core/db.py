"""
Database helpers cho RTI V2 workers.

MODEL: Append-only — mỗi lần scan tạo records mới, KHÔNG update/xóa records cũ.
  - insert_subdomains()              : subfinder → thêm rows vào subdomains
  - insert_subdomain_observations()  : port scan → thêm rows vào subdomains (alive/dead + IP)
  - insert_ports()                   : naabu → thêm rows vào ports
  - update_job_status()              : cập nhật trạng thái job (jobs table vẫn mutable)

UI dùng DISTINCT ON (domain/host, created_at DESC) để lấy trạng thái mới nhất.
History endpoint trả về toàn bộ records theo thứ tự thời gian.
"""

import json
import psycopg2
import psycopg2.extras
from . import config


def get_connection():
    return psycopg2.connect(config.DATABASE_URL)


# ── Jobs ──────────────────────────────────────────────────────

def update_job_status(job_id: str, status: str, result: dict = None, error: str = None):
    sql_parts = ["UPDATE jobs SET status = %s, updated_at = NOW()"]
    params = [status]

    if status == "running":
        sql_parts.append(", started_at = NOW()")
    elif status in ("completed", "failed", "cancelled"):
        sql_parts.append(", finished_at = NOW()")

    if result is not None:
        sql_parts.append(", result = %s")
        params.append(json.dumps(result))

    if error is not None:
        sql_parts.append(", error_message = %s")
        params.append(error)

    sql_parts.append("WHERE id = %s")
    params.append(job_id)

    sql = " ".join(sql_parts)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


# ── Subdomains ────────────────────────────────────────────────

def get_subdomains_by_target(workspace_id: str, target_id: str) -> list[str]:
    """Lấy danh sách domain của một target (dùng cho port scan)."""
    sql = """
        SELECT DISTINCT ON (domain) domain
        FROM subdomains
        WHERE workspace_id = %s AND target_id = %s
        ORDER BY domain, created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, [workspace_id, target_id])
            return [row[0] for row in cur.fetchall()]


def insert_subdomains(workspace_id: str, target_id: str, job_id: str, subdomains: list[dict]) -> int:
    """
    Subfinder results → INSERT rows mới vào subdomains.
    Không UPDATE rows cũ — mỗi scan là một snapshot độc lập.
    """
    if not subdomains:
        return 0

    sql = """
        INSERT INTO subdomains (workspace_id, target_id, job_id, domain, ip_addresses, sources)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id,
            job_id,
            s["domain"],
            s.get("ip_addresses", []),
            s.get("sources", []),
        )
        for s in subdomains
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


def insert_subdomain_observations(workspace_id: str, target_id: str, job_id: str, observations: list[dict]) -> int:
    """
    Port scan results → INSERT rows mới vào subdomains với is_alive + IPs.
    Source = ['naabu'] để đánh dấu dữ liệu đến từ port scan.
    observations = [{"domain": "...", "is_alive": True/False, "ip_addresses": ["1.2.3.4", "5.6.7.8"]}]
    Một domain có thể resolve thành nhiều IP (CDN, load balancer, round-robin DNS).
    """
    if not observations:
        return 0

    sql = """
        INSERT INTO subdomains (workspace_id, target_id, job_id, domain, ip_addresses, sources, is_alive)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            obs["domain"],
            obs.get("ip_addresses") or [],
            ["naabu"],
            obs["is_alive"],
        )
        for obs in observations
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


# ── Web Ports (for web probe) ─────────────────────────────────

def get_web_ports(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """
    Lấy danh sách web ports để probe (latest scan per host:port).
    Chỉ lấy ports có service_category = 'web'.
    """
    sql = """
        SELECT DISTINCT ON (host, port)
            host, port, protocol, service_name, service_category
        FROM ports
        WHERE workspace_id = %s
          AND service_category = 'web'
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY host, port, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def insert_web_probes(workspace_id: str, target_id: str, job_id: str, probes: list[dict]) -> int:
    """httpx results → INSERT rows mới vào web_probes (append-only)."""
    if not probes:
        return 0

    sql = """
        INSERT INTO web_probes
            (workspace_id, target_id, job_id, host, port, url, scheme,
             status_code, title, web_server, technologies, content_type,
             content_length, response_time, ip_address, is_alive)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            p["host"],
            int(p["port"]),
            p["url"],
            p.get("scheme") or None,
            p.get("status_code") or None,
            p.get("title") or None,
            p.get("web_server") or None,
            p.get("technologies") or [],
            p.get("content_type") or None,
            p.get("content_length") or None,
            p.get("response_time") or None,
            p.get("ip_address") or None,
            p.get("is_alive", True),
        )
        for p in probes
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


# ── Web Crawl ─────────────────────────────────────────────────

def get_live_web_probes(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """
    Lấy danh sách web probes đang LIVE (is_alive = true) — dùng làm seed cho katana/vuln.
    DISTINCT ON (host, port) → lấy trạng thái mới nhất mỗi endpoint.
    Trả về full probe data (technologies, web_server) để detect() logic hoạt động.
    """
    sql = """
        SELECT DISTINCT ON (host, port)
            host, port, url, scheme,
            status_code, title, web_server, technologies, ip_address, is_alive, target_id
        FROM web_probes
        WHERE workspace_id = %s
          AND is_alive = true
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY host, port, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def insert_web_crawl_urls(
    workspace_id: str,
    target_id: str | None,
    job_id: str,
    urls: list[dict],
) -> int:
    """katana results → INSERT rows mới vào web_crawl_urls (append-only)."""
    if not urls:
        return 0

    sql = """
        INSERT INTO web_crawl_urls
            (workspace_id, target_id, job_id, base_url, url, method,
             status_code, content_type, source_tag, source_attr, source_url, depth)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            u["base_url"],
            u["url"],
            u.get("method", "GET"),
            u.get("status_code") or None,
            u.get("content_type") or None,
            u.get("source_tag") or None,
            u.get("source_attr") or None,
            u.get("source_url") or None,
            int(u.get("depth", 0)),
        )
        for u in urls
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


# ── Web Crawl Forms ──────────────────────────────────────────

def insert_web_crawl_forms(
    workspace_id: str,
    target_id: str | None,
    job_id: str,
    forms: list[dict],
) -> int:
    """katana form extraction → INSERT rows mới vào web_crawl_forms (append-only)."""
    if not forms:
        return 0

    sql = """
        INSERT INTO web_crawl_forms
            (workspace_id, target_id, job_id, base_url, source_url, action_url,
             method, enctype, fields, has_csrf)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            f["base_url"],
            f["source_url"],
            f["action_url"],
            f.get("method", "POST"),
            f.get("enctype") or "application/x-www-form-urlencoded",
            json.dumps(f.get("fields", [])),
            bool(f.get("has_csrf", False)),
        )
        for f in forms
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


def get_crawl_urls_for_normalize(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """Lấy các URL crawl mới nhất (DISTINCT ON url) để normalize."""
    sql = """
        SELECT DISTINCT ON (url)
            url, method, source_url, base_url
        FROM web_crawl_urls
        WHERE workspace_id = %s
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY url, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def get_crawl_forms_for_normalize(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """Lấy các form crawl mới nhất (DISTINCT ON action_url+method) để normalize."""
    sql = """
        SELECT DISTINCT ON (action_url, method)
            action_url, method, enctype, fields, has_csrf, source_url
        FROM web_crawl_forms
        WHERE workspace_id = %s
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY action_url, method, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def insert_fuzz_endpoints(
    workspace_id: str,
    target_id: str | None,
    job_id: str,
    endpoints: list[dict],
) -> int:
    """Normalized endpoints → INSERT vào fuzz_endpoints."""
    if not endpoints:
        return 0

    sql = """
        INSERT INTO fuzz_endpoints
            (workspace_id, target_id, job_id, url, method, content_type,
             params, has_csrf, source_url, source_type)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            e["url"],
            e["method"],
            e.get("content_type") or None,
            json.dumps(e.get("params", [])),
            bool(e.get("has_csrf", False)),
            e.get("source_url") or None,
            e["source_type"],
        )
        for e in endpoints
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


# ── Ports ─────────────────────────────────────────────────────

def insert_ports(workspace_id: str, target_id: str, job_id: str, ports: list[dict]) -> int:
    """
    naabu results → INSERT rows mới vào ports.
    Không UPDATE rows cũ — mỗi scan là một snapshot độc lập.
    service_name và service_category được gán dựa trên PORT_SERVICES dict (best-effort).
    User có thể override hai trường này trực tiếp trên UI sau khi review.
    """
    if not ports:
        return 0

    sql = """
        INSERT INTO ports
            (workspace_id, target_id, job_id, host, ip_address, port, protocol, state, service_name, service_category)
        VALUES %s
    """
    records = [
        (
            workspace_id,
            target_id or None,
            job_id,
            p["host"],
            p.get("ip_address") or None,
            int(p["port"]),
            p.get("protocol", "tcp"),
            p.get("state", "open"),
            p.get("service_name") or None,
            p.get("service_category") or None,
        )
        for p in ports
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


# ── Fuzz Endpoints (input for fuzzing) ────────────────────────

def get_fuzz_endpoints_for_fuzz(workspace_id: str, target_id: str = None, method_filter: str = "ALL") -> list[dict]:
    """Lấy fuzz_endpoints để làm input cho FUZZ_PARAM."""
    conditions = ["workspace_id = %s"]
    params = [workspace_id]
    if target_id:
        conditions.append("target_id = %s")
        params.append(target_id)
    if method_filter != "ALL":
        conditions.append("method = %s")
        params.append(method_filter.upper())

    sql = f"""
        SELECT DISTINCT ON (url, method) url, method, content_type, params, has_csrf, source_url
        FROM fuzz_endpoints
        WHERE {" AND ".join(conditions)}
        ORDER BY url, method, created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


# ── Fuzz Param Results ────────────────────────────────────────

def insert_fuzz_param_results(workspace_id: str, target_id: str, job_id: str, results: list[dict]) -> int:
    """Lưu kết quả arjun (discovered hidden params) vào DB."""
    if not results:
        return 0
    sql = """
        INSERT INTO fuzz_param_results
            (workspace_id, target_id, job_id, url, method, params)
        VALUES %s
    """
    rows = [
        (workspace_id, target_id or None, job_id,
         r["url"], r["method"], json.dumps(r.get("params", [])))
        for r in results
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
    return len(rows)


# ── Dir Fuzz Results ──────────────────────────────────────────

def insert_dir_fuzz_results(workspace_id: str, target_id: str, job_id: str, results: list[dict]) -> int:
    """Lưu kết quả ffuf (discovered paths) vào DB."""
    if not results:
        return 0
    sql = """
        INSERT INTO dir_fuzz_results
            (workspace_id, target_id, job_id, base_url, path, url,
             status_code, content_length, content_type, words, lines,
             redirect_url, is_interesting)
        VALUES %s
    """
    rows = [
        (workspace_id, target_id or None, job_id,
         r.get("base_url"), r.get("path"), r.get("url"),
         r.get("status_code"), r.get("content_length"), r.get("content_type"),
         r.get("words"), r.get("lines"), r.get("redirect_url") or None,
         bool(r.get("is_interesting", False)))
        for r in results
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
    return len(rows)


def get_fuzz_param_results(workspace_id: str, target_id: str = None) -> list[dict]:
    conditions = ["workspace_id = %s"]
    params = [workspace_id]
    if target_id:
        conditions.append("target_id = %s")
        params.append(target_id)
    sql = f"""
        SELECT DISTINCT ON (url, method) id, url, method, params, job_id, created_at
        FROM fuzz_param_results
        WHERE {" AND ".join(conditions)}
        ORDER BY url, method, created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def get_dir_fuzz_results(workspace_id: str, target_id: str = None,
                          status_code: int = None, interesting_only: bool = False) -> list[dict]:
    conditions = ["workspace_id = %s"]
    params = [workspace_id]
    if target_id:
        conditions.append("target_id = %s")
        params.append(target_id)
    if status_code:
        conditions.append("status_code = %s")
        params.append(status_code)
    if interesting_only:
        conditions.append("is_interesting = TRUE")
    sql = f"""
        SELECT id, base_url, path, url, status_code, content_length,
               content_type, words, lines, redirect_url, is_interesting, job_id, created_at
        FROM dir_fuzz_results
        WHERE {" AND ".join(conditions)}
        ORDER BY is_interesting DESC, status_code, created_at DESC
        LIMIT 2000
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


# ── Vuln Scan helpers ─────────────────────────────────────────

def get_open_ports(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """
    Lấy open ports cho network_service vuln scan.
    DISTINCT ON (host, port) → lấy state mới nhất mỗi endpoint.
    """
    sql = """
        SELECT DISTINCT ON (host, port)
            host, port, protocol, service_name, service_category, ip_address, state
        FROM ports
        WHERE workspace_id = %s
          AND state = 'open'
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY host, port, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def get_fuzz_param_results_for_vuln(workspace_id: str, target_id: str | None = None) -> list[dict]:
    """
    Lấy fuzz param results cho web_params vuln scan (sqlmap, dalfox).
    DISTINCT ON (url, method) → lấy bản mới nhất mỗi endpoint.
    """
    sql = """
        SELECT DISTINCT ON (url, method)
            url, method, params
        FROM fuzz_param_results
        WHERE workspace_id = %s
    """
    params = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY url, method, created_at DESC"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def insert_nuclei_findings(
    workspace_id: str,
    target_id: str | None,
    job_id: str | None,
    findings: list[dict],
) -> int:
    """
    INSERT nuclei findings vào bảng findings_nuclei (dedicated table).
    Lưu đầy đủ extracted_results (JSONB array), template_id, matcher_name.
    """
    if not findings:
        return 0

    sql = """
        INSERT INTO findings_nuclei
            (workspace_id, target_id, job_id,
             template_id, matcher_name,
             protocol, title, severity, type, status,
             host, url, port,
             extracted_results,
             cve_id, cvss_score, evidence, remediation)
        VALUES %s
    """
    rows = [
        (
            workspace_id,
            target_id or None,
            job_id or None,
            f.get("template_id") or None,
            f.get("matcher_name") or None,
            f.get("protocol") or None,
            (f.get("title") or "")[:500],
            f.get("severity") or "info",
            f.get("type") or "vulnerability",
            "open",
            f.get("host") or None,
            f.get("url") or None,
            int(f["port"]) if f.get("port") else None,
            json.dumps(f.get("extracted_results") or []),
            f.get("cve_id") or None,
            float(f["cvss_score"]) if f.get("cvss_score") else None,
            f.get("evidence") or None,
            f.get("remediation") or None,
        )
        for f in findings
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
    return len(rows)


def get_firebase_nuclei_signals(
    workspace_id: str,
    target_id: str | None = None,
) -> list[dict]:
    """
    Lấy các nuclei findings liên quan Firebase (bảng findings_nuclei) để FirebaseWorker
    dùng làm prefilter — host nào dùng Firebase + giá trị nuclei đã trích (extracted_results).
    DISTINCT theo (host, url) để gộp finding trùng.
    """
    sql = """
        SELECT DISTINCT ON (host, url)
            host, url, template_id, extracted_results
        FROM findings_nuclei
        WHERE workspace_id = %s
          AND (
                template_id ILIKE '%%firebase%%'
             OR url ILIKE '%%firebase%%'
             OR extracted_results::text ILIKE '%%firebase%%'
          )
    """
    params: list = [workspace_id]
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY host, url"

    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = []
            for row in cur.fetchall():
                d = dict(row)
                er = d.get("extracted_results")
                if isinstance(er, str):
                    try:
                        d["extracted_results"] = json.loads(er)
                    except (ValueError, TypeError):
                        d["extracted_results"] = []
                elif er is None:
                    d["extracted_results"] = []
                rows.append(d)
            return rows


def insert_vuln_findings(
    workspace_id: str,
    target_id: str | None,
    job_id: str | None,
    findings: list[dict],
) -> int:
    """
    INSERT findings từ vuln scan workers vào bảng findings.
    source_tool + source_domain được fill từ BaseVulnHandler._finding().
    """
    if not findings:
        return 0

    sql = """
        INSERT INTO findings
            (workspace_id, target_id, job_id,
             title, severity, type, status,
             host, url, port, cve_id, cvss_score,
             evidence, remediation, source, source_tool, source_domain)
        VALUES %s
    """
    rows = [
        (
            workspace_id,
            target_id or None,
            job_id or None,
            (f.get("title") or "")[:500],
            f.get("severity") or "info",
            f.get("type") or "vulnerability",
            "open",
            f.get("host") or None,
            f.get("url") or None,
            int(f["port"]) if f.get("port") else None,
            f.get("cve_id") or None,
            float(f["cvss_score"]) if f.get("cvss_score") else None,
            f.get("evidence") or None,
            f.get("remediation") or None,
            f.get("source_tool") or None,
            f.get("source_tool") or None,
            f.get("source_domain") or None,
        )
        for f in findings
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
    return len(rows)

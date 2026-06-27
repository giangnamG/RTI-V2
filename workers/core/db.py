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

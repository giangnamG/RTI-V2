import json
import psycopg2
import psycopg2.extras
from . import config


def get_connection():
    return psycopg2.connect(config.DATABASE_URL)


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


def get_subdomains_by_target(workspace_id: str, target_id: str) -> list[str]:
    sql = """
        SELECT domain FROM subdomains
        WHERE workspace_id = %s AND target_id = %s
        ORDER BY domain
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, [workspace_id, target_id])
            return [row[0] for row in cur.fetchall()]


def update_subdomain_ips_batch(workspace_id: str, host_ip_map: dict):
    """Update ip_addresses cho nhiều subdomain cùng lúc. host_ip_map = {domain: ip}"""
    if not host_ip_map:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            for domain, ip in host_ip_map.items():
                if not ip:
                    continue
                cur.execute("""
                    UPDATE subdomains
                    SET ip_addresses = ARRAY(
                        SELECT DISTINCT unnest(COALESCE(ip_addresses, '{}') || ARRAY[%s::TEXT])
                    ),
                    updated_at = NOW()
                    WHERE workspace_id = %s AND domain = %s
                """, [ip, workspace_id, domain])
        conn.commit()


def insert_ports(workspace_id: str, target_id: str, job_id: str, ports: list[dict]) -> int:
    if not ports:
        return 0

    sql = """
        INSERT INTO ports
            (workspace_id, target_id, job_id, host, ip_address, port, protocol, state, service_name)
        VALUES %s
        ON CONFLICT (workspace_id, host, port, protocol) DO UPDATE SET
            ip_address   = COALESCE(EXCLUDED.ip_address,   ports.ip_address),
            service_name = COALESCE(EXCLUDED.service_name, ports.service_name),
            job_id       = EXCLUDED.job_id,
            state        = EXCLUDED.state,
            updated_at   = NOW()
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
        )
        for p in ports
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, records)
        conn.commit()

    return len(records)


def insert_subdomains(workspace_id: str, target_id: str, job_id: str, subdomains: list[dict]):
    if not subdomains:
        return 0

    sql = """
        INSERT INTO subdomains (workspace_id, target_id, job_id, domain, ip_addresses, sources)
        VALUES %s
        ON CONFLICT (workspace_id, domain) DO UPDATE SET
            ip_addresses = EXCLUDED.ip_addresses,
            sources      = EXCLUDED.sources,
            updated_at   = NOW()
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

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

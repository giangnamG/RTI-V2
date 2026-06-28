"""DISCOVERY — Sensitive file exposure: .env, config files, backup files."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry

SENSITIVE_PATHS = [
    "/.env", "/.env.local", "/.env.production", "/.env.backup",
    "/config.php", "/wp-config.php.bak", "/database.yml",
    "/config/database.yml", "/.htpasswd", "/web.config.bak",
    "/backup.zip", "/backup.sql", "/dump.sql",
]


class EnvExposureWorker(BaseVulnHandler):
    domain = "discovery"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags exposure,config
        # Hoặc httpx check từng path trong SENSITIVE_PATHS
        return []


registry.register(EnvExposureWorker())

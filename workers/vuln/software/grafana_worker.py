"""SOFTWARE — Grafana scanner: path traversal, default credentials."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class GrafanaWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        title = target.get("title", "").lower()
        return any("grafana" in t for t in techs) or "grafana" in title

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags grafana
        # Key CVEs: CVE-2021-43798 (path traversal), default admin:admin
        return []


registry.register(GrafanaWorker())

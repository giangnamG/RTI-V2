"""SOFTWARE — Atlassian Confluence scanner: OGNL injection, CVEs."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class ConfluenceWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        title = target.get("title", "").lower()
        return any("confluence" in t for t in techs) or "confluence" in title

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags confluence
        # Key CVEs: CVE-2021-26084, CVE-2022-26134, CVE-2023-22515
        return []


registry.register(ConfluenceWorker())

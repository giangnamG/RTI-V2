"""SOFTWARE — Apache Tomcat scanner: manager panel, CVEs."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class TomcatWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        server = target.get("web_server", "").lower()
        return any("tomcat" in t for t in techs) or "tomcat" in server

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags tomcat
        # Check: /manager/html default creds, CVE-2025-24813, PUT upload
        return []


registry.register(TomcatWorker())

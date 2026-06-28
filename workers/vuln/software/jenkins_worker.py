"""SOFTWARE — Jenkins scanner: script console, unauth build, CVEs."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class JenkinsWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        title = target.get("title", "").lower()
        return any("jenkins" in t for t in techs) or "jenkins" in title

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags jenkins
        # Check: /script console unauth, CVE-2024-23897 (arbitrary file read)
        return []


registry.register(JenkinsWorker())

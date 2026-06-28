"""CMS — JoomScan for Joomla sites."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class JoomScanWorker(BaseVulnHandler):
    domain = "cms"
    tool   = "joomscan"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        return any("joomla" in t for t in techs)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: chạy joomscan --url {url} --output {outfile}
        return []


registry.register(JoomScanWorker())

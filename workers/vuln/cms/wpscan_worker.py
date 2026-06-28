"""CMS — WPScan for WordPress sites."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class WPScanWorker(BaseVulnHandler):
    domain = "cms"
    tool   = "wpscan"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        return any("wordpress" in t for t in techs)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: chạy wpscan --url {url} --format json --output {outfile}
        # --enumerate vp,vt,u (vulnerable plugins, themes, users)
        return []


registry.register(WPScanWorker())

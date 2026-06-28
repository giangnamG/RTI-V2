"""CMS — Droopescan for Drupal (also Silverstripe, Moodle)."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry

_CMS_KEYWORDS = ("drupal", "silverstripe", "moodle")


class DroopeScanWorker(BaseVulnHandler):
    domain = "cms"
    tool   = "droopescan"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        return any(k in t for k in _CMS_KEYWORDS for t in techs)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: droopescan scan drupal -u {url}
        return []


registry.register(DroopeScanWorker())

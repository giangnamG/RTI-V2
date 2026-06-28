"""COMMON — Nikto web server scanner. Chạy trên tất cả live targets."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class NiktoWorker(BaseVulnHandler):
    domain = "common"
    tool   = "nikto"

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: chạy nikto -h {url} -Format json -output {outfile}
        return []


registry.register(NiktoWorker())

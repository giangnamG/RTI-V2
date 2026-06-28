"""DISCOVERY — Git exposure: .git directory accessible, source code leak."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class GitExposureWorker(BaseVulnHandler):
    domain = "discovery"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: check /.git/config, /.git/HEAD, /.git/index
        # Dùng git-dumper nếu xác nhận exposed
        return []


registry.register(GitExposureWorker())

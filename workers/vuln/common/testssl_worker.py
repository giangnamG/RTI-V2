"""COMMON — testssl.sh SSL/TLS vulnerability checker. Chỉ chạy trên HTTPS."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class TestSSLWorker(BaseVulnHandler):
    domain = "common"
    tool   = "testssl.sh"

    def detect(self, target: dict) -> bool:
        return target.get("scheme") == "https" and target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: chạy testssl.sh --jsonfile {outfile} {url}
        # Check: BEAST, POODLE, weak ciphers, expired cert, HSTS missing
        return []


registry.register(TestSSLWorker())

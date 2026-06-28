"""DISCOVERY — CORS misconfiguration checker."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class CORSWorker(BaseVulnHandler):
    domain         = "discovery"
    tool           = "corsy"       # hoặc nuclei cors templates
    requires_binary = False        # Python script

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: corsy -u {url} hoặc nuclei -u {url} -tags cors
        # Check: ACAO: *, Origin reflection, null origin
        return []


registry.register(CORSWorker())

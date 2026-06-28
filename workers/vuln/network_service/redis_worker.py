"""NETWORK SERVICE — Redis: unauthenticated access check."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class RedisWorker(BaseVulnHandler):
    domain       = "network_service"
    tool         = "nuclei"
    input_source = "ports"

    def detect(self, target: dict) -> bool:
        service = target.get("service_name", "").lower()
        port    = target.get("port", 0)
        return "redis" in service or port == 6379

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {host}:{port} -tags redis
        # Check: unauth PING, INFO command, CONFIG GET
        return []


registry.register(RedisWorker())

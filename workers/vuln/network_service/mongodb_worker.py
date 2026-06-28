"""NETWORK SERVICE — MongoDB: unauthenticated access, data exposure."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class MongoDBWorker(BaseVulnHandler):
    domain       = "network_service"
    tool         = "nuclei"
    input_source = "ports"

    def detect(self, target: dict) -> bool:
        service = target.get("service_name", "").lower()
        port    = target.get("port", 0)
        return "mongo" in service or port == 27017

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: check unauth connect, db.stats(), collection listing
        return []


registry.register(MongoDBWorker())

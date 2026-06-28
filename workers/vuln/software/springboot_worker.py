"""SOFTWARE — Spring Boot scanner: actuator exposure, Spring4Shell."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class SpringBootWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        return any("spring" in t for t in techs)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags spring
        # Check: /actuator/* exposure, CVE-2022-22965 (Spring4Shell), H2 console
        return []


registry.register(SpringBootWorker())

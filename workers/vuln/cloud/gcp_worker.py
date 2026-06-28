"""CLOUD — GCP: GCS bucket exposure, metadata SSRF."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry

_GCP_PATTERNS = ("googleapis.com", "appspot.com", "storage.cloud.google.com", "run.app")


class GCPWorker(BaseVulnHandler):
    domain = "cloud"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        host  = target.get("host", "").lower()
        techs = [t.lower() for t in target.get("technologies", [])]
        return (
            any(p in host for p in _GCP_PATTERNS)
            or any("google cloud" in t or "gcp" in t for t in techs)
        )

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags gcp,cloud
        # Check: GCS bucket public, metadata 169.254.169.254 SSRF
        return []


registry.register(GCPWorker())

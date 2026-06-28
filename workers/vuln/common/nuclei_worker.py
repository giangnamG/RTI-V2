"""COMMON — Nuclei template-based scanner. Chạy trên tất cả live targets."""
# TODO: implement
import subprocess, tempfile, json
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry

SEVERITY_MAP = {"critical": "critical", "high": "high", "medium": "medium", "low": "low", "info": "info"}
DEFAULT_TAGS  = "cves,misconfigurations,exposures,default-login"


class NucleiWorker(BaseVulnHandler):
    domain = "common"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: chạy nuclei -u {url} -tags {tags} -json -o {outfile}
        # Parse output, map severity, return findings list
        return []


registry.register(NucleiWorker())

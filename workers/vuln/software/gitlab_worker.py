"""SOFTWARE — GitLab scanner: token exposure, unauth access, RCE CVEs."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class GitLabWorker(BaseVulnHandler):
    domain = "software"
    tool   = "nuclei"  # dùng nuclei với gitlab-specific templates

    def detect(self, target: dict) -> bool:
        techs = [t.lower() for t in target.get("technologies", [])]
        title = target.get("title", "").lower()
        return any("gitlab" in t for t in techs) or "gitlab" in title

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags gitlab
        # Check: CVE-2021-22205, CVE-2023-7028, user enumeration, token exposure
        return []


registry.register(GitLabWorker())

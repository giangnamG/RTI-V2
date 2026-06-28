"""CLOUD — Subdomain takeover: CNAME trỏ về dịch vụ cloud chưa được đăng ký."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry

# Các dịch vụ cloud thường gặp subdomain takeover
_TAKEOVER_CNAMES = (
    "github.io", "herokuapp.com", "azurewebsites.net",
    "netlify.app", "vercel.app", "s3.amazonaws.com",
    "storage.googleapis.com", "shopify.com",
)


class SubdomainTakeoverWorker(BaseVulnHandler):
    domain = "cloud"
    tool   = "nuclei"

    def detect(self, target: dict) -> bool:
        # Áp dụng cho tất cả targets (check CNAME trong DNS)
        return target.get("is_alive") is not None

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: nuclei -u {url} -tags takeover
        # Kiểm tra CNAME → dịch vụ cloud, check nếu dịch vụ đó trả 404/unclaimed
        return []


registry.register(SubdomainTakeoverWorker())

"""WEB PARAMS — Dalfox: XSS scanner trên params từ FUZZ_PARAM."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class DalfoxWorker(BaseVulnHandler):
    domain       = "web_params"
    tool         = "dalfox"
    input_source = "fuzz_params"

    def detect(self, target: dict) -> bool:
        # Chỉ chạy trên GET endpoints có params (XSS thường qua reflected input)
        return target.get("method", "GET") == "GET" and len(target.get("params", [])) > 0

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: dalfox url {url_with_params} --format json --output {outfile}
        return []


registry.register(DalfoxWorker())

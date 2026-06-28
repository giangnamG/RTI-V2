"""WEB PARAMS — SQLMap: SQL injection trên params từ FUZZ_PARAM."""
# TODO: implement
from vuln.base import BaseVulnHandler
from vuln import registry


class SQLMapWorker(BaseVulnHandler):
    domain       = "web_params"
    tool         = "sqlmap"
    input_source = "fuzz_params"

    def detect(self, target: dict) -> bool:
        # Chỉ chạy trên endpoints có params
        return len(target.get("params", [])) > 0

    def run(self, target, job_id, workspace_id, target_id):
        # TODO: sqlmap -u {url} -p {params} --batch --level 2 --risk 1
        # --output-dir {tmpdir}, parse JSON output
        # CẢNH BÁO: cần xác nhận target trước khi chạy
        return []


registry.register(SQLMapWorker())

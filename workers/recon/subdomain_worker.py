import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db


class SubdomainWorker(BaseJobHandler):
    """
    Xử lý job RECON_SUBDOMAIN.

    Payload nhận vào:
        {
            "workspace_id": "...",
            "target_id":    "...",
            "domain":       "example.com",
            "sources":      ["subfinder"]   // tùy chọn
        }
    """

    def job_types(self) -> list[str]:
        return ["RECON_SUBDOMAIN"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        domain       = payload.get("domain", "").strip()
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id", "")

        if not domain:
            raise ValueError("payload.domain bắt buộc phải có")

        subdomains = []

        if shutil.which("subfinder"):
            subdomains.extend(self._run_subfinder(domain))
        else:
            self.logger.warning("subfinder không được cài đặt, bỏ qua")

        # Gộp + dedup theo domain name
        seen: dict[str, dict] = {}
        for s in subdomains:
            d = s["domain"].lower().rstrip(".")
            if d not in seen:
                seen[d] = {"domain": d, "ip_addresses": [], "sources": []}
            if s.get("source") and s["source"] not in seen[d]["sources"]:
                seen[d]["sources"].append(s["source"])

        results = list(seen.values())

        # Lưu vào DB
        saved = db.insert_subdomains(workspace_id, target_id, job_id, results)

        self.logger.info(f"Tìm thấy {len(results)} subdomain cho '{domain}', lưu {saved}")
        return {"total": len(results), "saved": saved, "domain": domain}

    # ── Tool runners ───────────────────────────────────────

    def _run_subfinder(self, domain: str) -> list[dict]:
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            out_file = f.name

        try:
            cmd = [
                "subfinder",
                "-d", domain,
                "-oJ",          # JSON output
                "-o", out_file,
                "-silent",
                "-t", "50",     # threads
                "-timeout", "30",
            ]
            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

            if proc.returncode != 0:
                self.logger.warning(f"subfinder exit {proc.returncode}: {proc.stderr[:200]}")

            return self._parse_subfinder_output(out_file)
        except subprocess.TimeoutExpired:
            self.logger.error("subfinder timeout sau 300s")
            return []
        except Exception as e:
            self.logger.error(f"subfinder lỗi: {e}")
            return []
        finally:
            Path(out_file).unlink(missing_ok=True)

    def _parse_subfinder_output(self, filepath: str) -> list[dict]:
        results = []
        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        # subfinder JSON format: {"host": "sub.example.com", "source": [...]}
                        host = obj.get("host", "")
                        if host:
                            sources = obj.get("source", [])
                            if isinstance(sources, str):
                                sources = [sources]
                            results.append({
                                "domain": host,
                                "source": ", ".join(sources) if sources else "subfinder",
                            })
                    except json.JSONDecodeError:
                        # Fallback: subfinder đôi khi chỉ output plain text
                        if line:
                            results.append({"domain": line, "source": "subfinder"})
        except FileNotFoundError:
            pass
        return results

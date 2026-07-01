import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db, concurrency


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
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id") or None
        target_ids   = payload.get("target_ids") or None

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        # Multi-target: target_ids (nhiều) → target_id (một) → TẤT CẢ target active.
        targets = db.resolve_scan_targets(workspace_id, target_id, target_ids)
        if not targets:
            self.logger.warning(f"Không có target nào để enum subdomain (workspace={workspace_id})")
            return {"total": 0, "saved": 0, "targets": 0}

        self.logger.info(f"RECON_SUBDOMAIN cho {len(targets)} target(s)")

        # Loop qua target SONG SONG (scan pool SCAN_CONCURRENCY), lưu đúng per-target.
        per = concurrency.run_tasks(
            targets, lambda t: self._scan_one_target(job_id, workspace_id, t)
        )

        total = sum(r["total"] for r in per if r)
        saved = sum(r["saved"] for r in per if r)
        self.logger.info(
            f"RECON_SUBDOMAIN xong — {len(targets)} target, {total} subdomain, lưu {saved}"
        )
        return {"total": total, "saved": saved, "targets": len(targets)}

    def _scan_one_target(self, job_id: str, workspace_id: str, target: dict) -> dict:
        """Enum subdomain cho 1 target + đăng ký chính target host. Lưu với target_id của nó."""
        tid   = target["id"]
        host  = (target.get("host") or target.get("domain") or "").strip()
        is_ip = bool(target.get("is_ip"))
        has_port = bool(target.get("port"))

        subdomains: list[dict] = []

        # IP / có port tường minh → không có subdomain để enum → bỏ subfinder.
        if is_ip or has_port:
            self.logger.info(f"'{host}' là IP/có port tường minh → bỏ subfinder, chỉ đăng ký host")
        elif host and shutil.which("subfinder"):
            subdomains.extend(self._run_subfinder(host))
        elif not shutil.which("subfinder"):
            self.logger.warning("subfinder không được cài đặt, bỏ qua")

        # LUÔN đăng ký chính target host → input hạng nhất cho port/web probe.
        if host:
            subdomains.append({"domain": host, "source": "target"})

        # Gộp + dedup theo domain name
        seen: dict[str, dict] = {}
        for s in subdomains:
            d = s["domain"].lower().rstrip(".")
            if d not in seen:
                seen[d] = {"domain": d, "ip_addresses": [], "sources": []}
            if s.get("source") and s["source"] not in seen[d]["sources"]:
                seen[d]["sources"].append(s["source"])

        results = list(seen.values())
        saved = db.insert_subdomains(workspace_id, tid, job_id, results)
        self.logger.info(f"  [{host}] {len(results)} subdomain, lưu {saved}")
        return {"total": len(results), "saved": saved}

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
                "-all",         # dùng tất cả sources
                "-t", "50",     # threads
                "-timeout", "30",
            ]
            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

            if proc.stderr:
                self.logger.debug(f"subfinder stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"subfinder exit {proc.returncode}")

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

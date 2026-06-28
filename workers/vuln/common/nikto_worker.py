"""COMMON — Nikto web server scanner. Chạy trên tất cả live targets."""
import subprocess
import tempfile
import json
import os
import logging
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry

logger = logging.getLogger(__name__)


def _nikto_severity(vuln: dict) -> str:
    msg   = vuln.get("msg", "")
    osvdb = str(vuln.get("OSVDB", "0"))
    if "CVE-" in msg:
        return "low"
    if osvdb and osvdb != "0":
        return "low"
    return "info"


class NiktoWorker(BaseVulnHandler):
    domain = "common"
    tool   = "nikto"

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def run(self, target: dict, job_id: str, workspace_id: str, target_id):
        url = target.get("url", "")
        if not url:
            return []

        findings = []
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            outfile = tf.name

        try:
            cmd = [
                "nikto",
                "-h", url,
                "-Format", "json",
                "-output", outfile,
                "-nointeractive",
                "-maxtime", "240s",
            ]
            subprocess.run(cmd, capture_output=True, text=True, timeout=300)

            out_path = Path(outfile)
            if not out_path.exists() or out_path.stat().st_size == 0:
                return []

            raw = out_path.read_text(errors="replace").strip()
            if not raw:
                return []

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning(f"nikto JSON parse error for {url}")
                return []

            vulnerabilities = data.get("vulnerabilities") or []
            for vuln in vulnerabilities:
                msg = (vuln.get("msg") or "").strip()
                if not msg:
                    continue

                vuln_url = vuln.get("url") or url
                method   = vuln.get("method") or "GET"
                osvdb    = str(vuln.get("OSVDB") or "")
                refs     = (vuln.get("references") or "").strip()

                parts = [f"Method: {method}", f"URL: {vuln_url}"]
                if osvdb and osvdb != "0":
                    parts.append(f"OSVDB: {osvdb}")
                if refs:
                    parts.append(f"References: {refs}")
                evidence = "\n".join(parts)

                findings.append(self._finding(
                    title    = msg[:255],
                    severity = _nikto_severity(vuln),
                    type     = "misconfiguration",
                    host     = target.get("host", ""),
                    url      = vuln_url,
                    port     = target.get("port"),
                    evidence = evidence,
                ))

        except subprocess.TimeoutExpired:
            logger.error(f"nikto timeout on {url}")
        except Exception as exc:
            logger.error(f"nikto error on {url}: {exc}")
        finally:
            try:
                os.unlink(outfile)
            except OSError:
                pass

        logger.info(f"nikto {url} → {len(findings)} findings")
        return findings


registry.register(NiktoWorker())

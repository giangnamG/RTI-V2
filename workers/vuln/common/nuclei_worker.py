"""COMMON — Nuclei template-based scanner. Chạy trên tất cả live targets."""
import subprocess
import tempfile
import json
import os
import logging
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "critical": "critical",
    "high":     "high",
    "medium":   "medium",
    "low":      "low",
    "info":     "info",
    "unknown":  "info",
}

DEFAULT_TAGS = "cves,misconfigurations,exposures,default-login"

_TAG_TYPE = {
    "cve":           "vulnerability",
    "misconfig":     "misconfiguration",
    "exposure":      "exposure",
    "default-login": "credential",
    "tech":          "informational",
}


def _infer_type(tags: list) -> str:
    for tag in tags:
        if tag in _TAG_TYPE:
            return _TAG_TYPE[tag]
    return "vulnerability"


class NucleiWorker(BaseVulnHandler):
    domain = "common"
    tool   = "nuclei"

    _templates_ready = False

    def detect(self, target: dict) -> bool:
        return target.get("is_alive", False)

    def _ensure_templates(self):
        if NucleiWorker._templates_ready:
            return
        try:
            subprocess.run(
                ["nuclei", "-update-templates", "-silent"],
                capture_output=True, timeout=120,
            )
            logger.info("nuclei templates updated")
        except Exception as exc:
            logger.warning(f"nuclei update-templates skipped: {exc}")
        NucleiWorker._templates_ready = True

    def run(self, target: dict, job_id: str, workspace_id: str, target_id):
        url = target.get("url", "")
        if not url:
            return []

        self._ensure_templates()
        findings = []

        with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tf:
            outfile = tf.name

        try:
            cmd = [
                "nuclei",
                "-u", url,
                "-tags", DEFAULT_TAGS,
                "-json", "-o", outfile,
                "-silent", "-no-color",
                "-timeout", "30",
                "-rate-limit", "50",
                "-max-host-error", "5",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if proc.returncode not in (0, 1):
                logger.warning(f"nuclei exit {proc.returncode} for {url}: {proc.stderr[:200]}")

            out_path = Path(outfile)
            if not out_path.exists() or out_path.stat().st_size == 0:
                return []

            for line in out_path.read_text(errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue

                info           = item.get("info", {})
                tags           = info.get("tags", [])
                classification = info.get("classification", {})

                cve_ids  = classification.get("cve-id") or []
                cve_id   = cve_ids[0] if cve_ids else None
                cvss_raw = classification.get("cvss-score")

                severity = SEVERITY_MAP.get(info.get("severity", "info"), "info")
                ftype    = _infer_type(tags)

                req  = (item.get("request") or "")[:500]
                resp = (item.get("response") or "")[:500]
                extracted = item.get("extracted-results") or []
                parts = []
                if req:
                    parts.append(f"REQUEST:\n{req}")
                if resp:
                    parts.append(f"RESPONSE:\n{resp}")
                if extracted:
                    parts.append("EXTRACTED: " + ", ".join(str(e) for e in extracted[:5]))
                evidence = "\n\n".join(parts) or None

                findings.append(self._finding(
                    title       = info.get("name") or item.get("template-id") or "Nuclei Finding",
                    severity    = severity,
                    type        = ftype,
                    host        = item.get("host") or target.get("host", ""),
                    url         = item.get("matched-at") or url,
                    port        = target.get("port"),
                    cve_id      = cve_id,
                    cvss_score  = float(cvss_raw) if cvss_raw else None,
                    remediation = info.get("remediation"),
                    evidence    = evidence,
                ))

        except subprocess.TimeoutExpired:
            logger.error(f"nuclei timeout on {url}")
        except Exception as exc:
            logger.error(f"nuclei error on {url}: {exc}")
        finally:
            try:
                os.unlink(outfile)
            except OSError:
                pass

        logger.info(f"nuclei {url} → {len(findings)} findings")
        return findings


registry.register(NucleiWorker())

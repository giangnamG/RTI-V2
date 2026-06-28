"""COMMON — testssl.sh SSL/TLS vulnerability checker. Chỉ chạy trên HTTPS targets."""
import subprocess
import tempfile
import json
import os
import logging
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry

logger = logging.getLogger(__name__)

# Severity từ testssl.sh → finding severity
_SEV_MAP = {
    "CRITICAL": "critical",
    "HIGH":     "high",
    "MEDIUM":   "medium",
    "LOW":      "low",
    "WARN":     "low",
    "WARNING":  "low",
    "INFO":     "info",
    "OK":       "info",
    "DEBUG":    "info",
}

# Các mức severity KHÔNG tạo finding (chỉ là trạng thái "OK")
_SKIP_SEV = {"OK", "INFO", "DEBUG"}

# Check ID → tên hiển thị dễ đọc
_ID_LABELS = {
    "beast":              "BEAST Attack",
    "BEAST":              "BEAST Attack",
    "POODLE_SSL":         "POODLE (SSLv3)",
    "POODLE_TLS1":        "POODLE-like (TLS 1.0)",
    "sweet32":            "SWEET32 Birthday Attack",
    "SWEET32":            "SWEET32 Birthday Attack",
    "crime_tls":          "CRIME (TLS)",
    "CRIME_TLS":          "CRIME (TLS)",
    "breach":             "BREACH",
    "BREACH":             "BREACH",
    "heartbleed":         "Heartbleed (CVE-2014-0160)",
    "ccs":                "CCS Injection (CVE-2014-0224)",
    "CCS":                "CCS Injection",
    "ticketbleed":        "Ticketbleed (CVE-2016-9244)",
    "robot":              "ROBOT Attack",
    "ROBOT":              "ROBOT Attack",
    "secure_renego":      "Secure Renegotiation",
    "secure_client_renego": "Secure Client-Initiated Renegotiation",
    "DROWN":              "DROWN Attack",
    "LOGJAM":             "LOGJAM",
    "FREAK":              "FREAK",
    "lucky13":            "Lucky13 Attack",
    "RC4":                "RC4 Cipher Enabled",
    "fallback_SCSV":      "TLS Fallback SCSV Missing",
    "HSTS":               "HSTS Missing or Misconfigured",
    "HSTS_timeout":       "HSTS Max-Age Too Short",
    "HPKP":               "HPKP Not Configured",
    "cert_notAfter":      "Certificate Expired",
    "cert_notBefore":     "Certificate Not Yet Valid",
    "cert_chain_of_trust": "Certificate Chain Trust Issue",
    "cert_keySize":       "Weak Certificate Key Size",
    "cert_algorithm":     "Weak Certificate Signature Algorithm",
    "cert_selfSigned":    "Self-Signed Certificate",
    "cert_crlDistributionPoints": "CRL Distribution Points",
    "cert_ocspRevoked":   "OCSP Certificate Revoked",
    "tls1":               "TLS 1.0 Enabled (Deprecated)",
    "ssl3":               "SSLv3 Enabled (Deprecated)",
    "ssl2":               "SSLv2 Enabled (Deprecated)",
    "tls_compression":    "TLS Compression Enabled",
    "cipherlist_LOW":     "Low Strength Ciphers Offered",
    "cipherlist_3DES_IDEA": "3DES/IDEA Ciphers Offered",
    "cipherlist_EXPORT":  "EXPORT Ciphers Offered",
    "cipherlist_anon":    "Anonymous Ciphers Offered",
    "cipher_order":       "Weak Cipher Order",
    "cipher_order_tls12": "TLS 1.2 Cipher Order Issue",
}


def _label(check_id: str) -> str:
    return _ID_LABELS.get(check_id, f"SSL/TLS: {check_id}")


class TestSSLWorker(BaseVulnHandler):
    domain = "common"
    tool   = "testssl.sh"

    def detect(self, target: dict) -> bool:
        return target.get("scheme") == "https" and target.get("is_alive", False)

    def run(self, target: dict, job_id: str, workspace_id: str, target_id):
        host = target.get("host", "")
        port = target.get("port") or 443
        url  = target.get("url", "")
        if not host:
            return []

        target_str = f"{host}:{port}"
        findings   = []

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            outfile = tf.name

        try:
            cmd = [
                "testssl.sh",
                "--jsonfile", outfile,
                "--quiet",
                "--color", "0",
                "--connect-timeout", "30",
                "--openssl-timeout", "10",
                "--sneaky",         # disguise handshake as common browser
                "--parallel",       # parallel checks (faster)
                target_str,
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=360)

            out_path = Path(outfile)
            if not out_path.exists() or out_path.stat().st_size == 0:
                logger.warning(f"testssl.sh produced no output for {target_str}")
                return []

            raw = out_path.read_text(errors="replace").strip()
            if not raw:
                return []

            try:
                items = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning(f"testssl.sh JSON parse error for {target_str}")
                return []

            if not isinstance(items, list):
                items = [items]

            for item in items:
                sev_raw = (item.get("severity") or "").upper()
                if sev_raw in _SKIP_SEV:
                    continue

                finding_text = (item.get("finding") or "").strip()
                if not finding_text:
                    continue

                check_id = item.get("id", "")
                cve_raw  = (item.get("cve") or "").strip()
                cwe_raw  = (item.get("cwe") or "").strip()

                cve_id   = cve_raw if cve_raw else None
                severity = _SEV_MAP.get(sev_raw, "info")
                label    = _label(check_id)

                evidence_parts = [f"Check: {check_id}", f"Finding: {finding_text}"]
                if cve_id:
                    evidence_parts.append(f"CVE: {cve_id}")
                if cwe_raw:
                    evidence_parts.append(f"CWE: {cwe_raw}")
                evidence = "\n".join(evidence_parts)

                # Title: label + condensed finding (max 200 chars total)
                title = f"{label}: {finding_text}"
                title = title[:255]

                findings.append(self._finding(
                    title    = title,
                    severity = severity,
                    type     = "misconfiguration",
                    host     = host,
                    url      = url or None,
                    port     = int(port),
                    cve_id   = cve_id,
                    evidence = evidence,
                ))

        except subprocess.TimeoutExpired:
            logger.error(f"testssl.sh timeout on {target_str}")
        except Exception as exc:
            logger.error(f"testssl.sh error on {target_str}: {exc}")
        finally:
            try:
                os.unlink(outfile)
            except OSError:
                pass

        logger.info(f"testssl.sh {target_str} → {len(findings)} findings")
        return findings


registry.register(TestSSLWorker())

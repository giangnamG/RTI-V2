"""CMS — WPProbe cho WordPress (enum plugin nhanh qua REST API + map CVE).

- input_source = web_probes → detect() lọc host tag WordPress (technologies chứa 'wordpress').
- streams_to_db = True → tự INSERT vào bảng riêng `wpprobe_finding`.
- `--mode hybrid` cho nhiều value nhất: REST API (5000+ plugin) + brute-force xác nhận.
- DB lỗ hổng: Wordfence (env WORDFENCE_API_KEY, cập nhật qua `wpprobe update-db`).
"""
import subprocess
import tempfile
import json
import os
import logging
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry
from core import db

logger = logging.getLogger(__name__)

# Timeout/host (giây) — override qua env WPPROBE_TIMEOUT. WPProbe (REST) thường xong <3' nếu host khỏe.
WPPROBE_TIMEOUT = int(os.environ.get("WPPROBE_TIMEOUT", "300"))

# Chế độ quét: stealthy = chỉ REST API (nhanh ~30s, ra ngay, ít kích rate-limit) | hybrid = thêm
# brute-force (sâu hơn nhưng chậm + dễ bị throttle/timeout). Mặc định stealthy để có kết quả thật.
WPPROBE_MODE = os.environ.get("WPPROBE_MODE", "stealthy")


class WPProbeWorker(BaseVulnHandler):
    domain = "cms"
    tool   = "wpprobe"
    streams_to_db = True

    def detect(self, target: dict) -> bool:
        techs = [str(t).lower() for t in target.get("technologies", [])]
        return any("wordpress" in t for t in techs)

    def run(self, target: dict, job_id: str, workspace_id: str, target_id):
        host = target.get("host", "")
        if not host:
            return []
        port   = target.get("port")
        scheme = target.get("scheme") or ("https" if port == 443 else "http")
        url    = f"{scheme}://{host}:{port}" if port else f"{scheme}://{host}"
        tid    = target.get("target_id") or target_id

        # Dedupe: bỏ qua http khi host đã có https WordPress (tránh quét trùng do 301 redirect)
        if scheme != "https" and db.host_has_live_https_wordpress(workspace_id, host):
            logger.info(f"wpprobe skip {url} — host đã có https WordPress (canonical)")
            return []

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            outfile = tf.name

        cmd = ["wpprobe", "scan", "-u", url, "--mode", WPPROBE_MODE, "-o", outfile]

        findings: list[dict] = []
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=WPPROBE_TIMEOUT)
            raw = Path(outfile).read_text(errors="replace").strip()
            data = json.loads(raw) if raw else {}
            findings = self._parse(data, host, url, port)
        except subprocess.TimeoutExpired:
            logger.error(f"wpprobe timeout on {url}")
        except json.JSONDecodeError:
            logger.warning(f"wpprobe JSON parse error for {url}")
        except Exception as exc:
            logger.error(f"wpprobe error on {url}: {exc}")
        finally:
            try:
                os.unlink(outfile)
            except OSError:
                pass

        db.insert_wpprobe_findings(workspace_id, tid, job_id, findings)
        logger.info(f"wpprobe {url} → {len(findings)} findings")
        return findings

    # ── parse WPProbe JSON ───────────────────────────────────────
    # Shape thật (v0.12.3): {url, plugins:{slug:[{version, severities?:[{<sev>:[{auth_type,
    #   vulnerabilities:[{cve, cve_link, title, cvss_score, cvss_vector}]}]}]}]}, themes:{...cùng shape}}
    # - entry có thể chỉ {version} (không vuln) hoặc version="unknown".
    # - KHÔNG có field confidence trong JSON (chỉ ở terminal tree).
    def _parse(self, data, host: str, url: str, port) -> list[dict]:
        out: list[dict] = []
        records = data if isinstance(data, list) else [data]
        for rec in records:
            if not isinstance(rec, dict):
                continue
            out += self._parse_group(rec.get("plugins"), "plugin", host, url, port)
            out += self._parse_group(rec.get("themes"), "theme", host, url, port)
        return out

    def _parse_group(self, group, component: str, host: str, url: str, port) -> list[dict]:
        out: list[dict] = []
        for slug, entries in (group or {}).items():
            for entry in (entries if isinstance(entries, list) else [entries]):
                if not isinstance(entry, dict):
                    continue
                raw_ver = entry.get("version")
                version = None if (not raw_ver or raw_ver == "unknown") else raw_ver
                found = False
                for sevobj in entry.get("severities") or []:
                    if not isinstance(sevobj, dict):
                        continue
                    for sev, authgroups in sevobj.items():           # sev = 'critical'|'high'|...
                        for ag in (authgroups or []):                # ag = {auth_type, vulnerabilities}
                            if not isinstance(ag, dict):
                                continue
                            auth = ag.get("auth_type")
                            for v in (ag.get("vulnerabilities") or []):
                                found = True
                                cve = v.get("cve")
                                out.append(self._finding(
                                    title=(v.get("title") or f"{slug} {cve or 'vulnerability'}")[:255],
                                    severity=(sev or "info").lower(),
                                    type="vulnerability",
                                    host=host, url=url, port=port,
                                    cve_id=cve, cvss_score=v.get("cvss_score"),
                                    plugin=slug, version=version, component=component,
                                    cvss_vector=v.get("cvss_vector"), auth_type=auth,
                                    refs={"cve_link": v.get("cve_link")} if v.get("cve_link") else {},
                                    raw=v,
                                ))
                if not found:
                    # Phát hiện nhưng chưa có lỗ hổng → giữ làm inventory (info)
                    label = f"{component.capitalize()} detected: {slug}" + (f" {version}" if version else "")
                    out.append(self._finding(
                        title=label[:255], severity="info", type="informational",
                        host=host, url=url, port=port,
                        plugin=slug, version=version, component=component, raw=entry,
                    ))
        return out


registry.register(WPProbeWorker())

"""CMS — WPScan cho WordPress.

- input_source = web_probes → dispatcher loop mỗi live probe, detect() lọc host có tag
  WordPress (technologies chứa 'wordpress'). scheme/host/port lấy từ web_probes.
- streams_to_db = True → worker tự INSERT vào bảng riêng `wpscan_finding` (mirror NucleiWorker
  ghi findings_nuclei). Dispatcher KHÔNG batch-insert nữa.
- API token đọc từ env WPSCAN_API_TOKEN (KHÔNG hardcode). Hỗ trợ NHIỀU key (phân tách , /
  khoảng trắng / xuống dòng) — key nào hết limit thì tự XOAY sang key kế. Rỗng → enum không token.
"""
import subprocess
import tempfile
import json
import os
import re
import logging
from pathlib import Path
from vuln.base import BaseVulnHandler
from vuln import registry
from core import db

logger = logging.getLogger(__name__)

# Timeout/host (giây). Host rate-limit/chặn sẽ burn hết timeout → để 300s (fail nhanh, đỡ chờ 10') + env.
WPSCAN_TIMEOUT = int(os.environ.get("WPSCAN_TIMEOUT", "300"))

# Detection mode: passive (chỉ HTML) | mixed (NHANH — plugin detect passive + check, BỎ brute-force
# 652-location theme/plugin) | aggressive (sâu nhất nhưng RẤT chậm, thường tốn 2-3'/host cho theme enum
# mà phần lớn ra 0 theme). Plugin/CVE giống nhau giữa mixed & aggressive (plugin vốn passive-detected).
# → Mặc định MIXED cho nhanh; đặt WPSCAN_MODE=aggressive khi cần quét sâu trên target không bị rate-limit.
WPSCAN_MODE = os.environ.get("WPSCAN_MODE", "mixed")


class WPScanWorker(BaseVulnHandler):
    domain = "cms"
    tool   = "wpscan"
    streams_to_db = True   # tự insert vào wpscan_finding

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
        # Attribution chính xác per-probe: ưu tiên target_id của probe (web_probes có cột này)
        tid = target.get("target_id") or target_id

        # Dedupe: bỏ qua http khi host đã có https WordPress (tránh quét trùng do 301 redirect)
        if scheme != "https" and db.host_has_live_https_wordpress(workspace_id, host):
            logger.info(f"wpscan skip {url} — host đã có https WordPress (canonical)")
            return []

        # Nhiều API key trong WPSCAN_API_TOKEN → thử lần lượt; key HẾT LIMIT thì XOAY sang key kế.
        # Hết sạch key → quét KHÔNG token (vẫn ra interesting + plugin, chỉ thiếu CVE).
        tokens = self._tokens()
        candidates = (tokens + [None]) if tokens else [None]

        findings: list[dict] = []
        for idx, tok in enumerate(candidates):
            label = f"key #{idx + 1}/{len(tokens)}" if tok else "KHÔNG token (enum-only)"
            data = self._scan_once(url, tok)
            if tok and self._is_api_limit(data):
                logger.warning(f"wpscan {url} — {label} HẾT LIMIT → xoay sang key kế")
                continue
            findings = self._parse(data, host, url, port, scheme)
            logger.info(f"wpscan {url} — dùng {label} → {len(findings)} findings")
            break

        db.insert_wpscan_findings(workspace_id, tid, job_id, findings)
        return findings

    # ── helpers ──────────────────────────────────────────────────
    @staticmethod
    def _tokens() -> list:
        """Danh sách API key từ env WPSCAN_API_TOKEN (phân tách bởi , / khoảng trắng / xuống dòng)."""
        raw = os.environ.get("WPSCAN_API_TOKEN", "")
        return [t for t in re.split(r"[,\s]+", raw.strip()) if t]

    @staticmethod
    def _is_api_limit(data: dict) -> bool:
        """True nếu wpscan abort do hết quota API ('Your API limit has been reached')."""
        aborted = data.get("scan_aborted")
        return isinstance(aborted, str) and "limit" in aborted.lower()

    def _scan_once(self, url: str, token) -> dict:
        """Chạy wpscan 1 lần với 1 token (hoặc None = không token). Trả JSON đã parse ({} nếu lỗi)."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            outfile = tf.name
        cmd = [
            "wpscan", "--url", url,
            "-e", "vp,vt",
            "--detection-mode", WPSCAN_MODE,
            "--random-user-agent",
            "--force",
            "--ignore-main-redirect",
            "--no-banner",
            "--no-update",          # tránh treo prompt "update DB?" trong subprocess
            "--format", "json",
            "--output", outfile,
        ]
        if token:
            cmd += ["--api-token", token]
        data: dict = {}
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=WPSCAN_TIMEOUT)
            raw = Path(outfile).read_text(errors="replace").strip()
            data = json.loads(raw) if raw else {}
        except subprocess.TimeoutExpired:
            logger.error(f"wpscan timeout on {url}")
        except json.JSONDecodeError:
            logger.warning(f"wpscan JSON parse error for {url}")
        except Exception as exc:
            logger.error(f"wpscan error on {url}: {exc}")
        finally:
            try:
                os.unlink(outfile)
            except OSError:
                pass
        return data

    # ── parse WPScan JSON ────────────────────────────────────────
    def _parse(self, data: dict, host: str, url: str, port, scheme: str) -> list[dict]:
        out: list[dict] = []

        # Core version
        ver = data.get("version") or {}
        out += self._vulns(ver.get("vulnerabilities"), "core", "WordPress",
                           ver.get("number"), host, url, port, scheme)

        # Main theme
        mt = data.get("main_theme") or {}
        out += self._vulns(mt.get("vulnerabilities"), "theme",
                           mt.get("slug") or "main_theme", self._ver(mt),
                           host, url, port, scheme)

        # Plugins (vp) + Themes (vt)
        for slug, p in (data.get("plugins") or {}).items():
            out += self._vulns(p.get("vulnerabilities"), "plugin", slug,
                               self._ver(p), host, url, port, scheme)
        for slug, t in (data.get("themes") or {}).items():
            out += self._vulns(t.get("vulnerabilities"), "theme", slug,
                               self._ver(t), host, url, port, scheme)

        # Interesting findings (xmlrpc, readme, dir listing, ...)
        for itf in data.get("interesting_findings") or []:
            title = (itf.get("to_s") or itf.get("type") or "Interesting finding")
            out.append(self._finding(
                title=str(title)[:255], severity="info", type="informational",
                host=host, url=itf.get("url") or url, port=port, scheme=scheme,
                component="interesting", component_name=itf.get("type"),
                refs=itf.get("references") or {}, raw=itf,
            ))
        return out

    @staticmethod
    def _ver(node: dict):
        v = node.get("version")
        return v.get("number") if isinstance(v, dict) else (v if isinstance(v, str) else None)

    def _vulns(self, vulns, component, name, version, host, url, port, scheme) -> list[dict]:
        out = []
        for v in vulns or []:
            refs = v.get("references") or {}
            cve = None
            cve_list = refs.get("cve") or []
            if cve_list:
                c = str(cve_list[0])
                cve = c if c.upper().startswith("CVE-") else f"CVE-{c}"
            out.append(self._finding(
                title=(v.get("title") or f"{name} vulnerability")[:255],
                severity="high", type="vulnerability",
                host=host, url=url, port=port, scheme=scheme,
                cve_id=cve,
                component=component, component_name=name, component_version=version,
                fixed_in=v.get("fixed_in"), refs=refs, raw=v,
            ))
        return out


registry.register(WPScanWorker())

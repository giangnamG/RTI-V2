"""COMMON — Nuclei template-based scanner.
Chạy một lần trên toàn bộ URLs của workspace (subdomains × web ports).
"""
import os
import subprocess
import threading
import queue
import json
import time
import logging
import tempfile
from vuln.base import BaseVulnHandler
from vuln import registry
from core import db as _db

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "critical": "critical",
    "high":     "high",
    "medium":   "medium",
    "low":      "low",
    "info":     "info",
    "unknown":  "info",
}

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


def _parse_finding(item: dict, target: dict) -> dict | None:
    info           = item.get("info", {})
    tags           = info.get("tags", [])
    classification = info.get("classification", {})

    cve_ids  = classification.get("cve-id") or []
    cve_id   = cve_ids[0] if cve_ids else None
    cvss_raw = classification.get("cvss-score")

    severity     = SEVERITY_MAP.get(info.get("severity", "info"), "info")
    ftype        = _infer_type(tags)
    template_id  = item.get("template-id") or None
    protocol     = item.get("type") or None          # dns | http | tcp | ...
    base_title   = info.get("name") or template_id or "Nuclei Finding"
    matcher_name = item.get("matcher-name") or item.get("extractor-name") or None
    extracted    = item.get("extracted-results") or []

    # Build title: kết hợp matcher-name + extracted values
    # [template:matcher] → "Name: matcher = value"
    # [template] + extracted → "Name: value"
    if extracted:
        value = extracted[0] if len(extracted) == 1 else ", ".join(str(e) for e in extracted[:3])
        if matcher_name:
            title = f"{base_title}: {matcher_name} = {value}"
        else:
            title = f"{base_title}: {value}"
    elif matcher_name:
        title = f"{base_title}: {matcher_name}"
    else:
        title = base_title

    req   = (item.get("request")  or "")[:500]
    resp  = (item.get("response") or "")[:500]
    parts = []
    if req:
        parts.append(f"REQUEST:\n{req}")
    if resp:
        parts.append(f"RESPONSE:\n{resp}")
    evidence = "\n\n".join(parts) or None

    # Port: ưu tiên từ nuclei JSON (string), fallback từ target
    raw_port = item.get("port")
    try:
        port = int(raw_port) if raw_port else (int(target["port"]) if target.get("port") else None)
    except (ValueError, TypeError):
        port = None

    return {
        "template_id":       template_id,
        "matcher_name":      matcher_name,
        "protocol":          protocol,
        "title":             title,
        "severity":          severity,
        "type":              ftype,
        "host":              item.get("host") or target.get("host", ""),
        "url":               item.get("matched-at") or item.get("url") or target.get("url", ""),
        "port":              port,
        "extracted_results": extracted,
        "cve_id":            cve_id,
        "cvss_score":        float(cvss_raw) if cvss_raw else None,
        "remediation":       info.get("remediation"),
        "evidence":          evidence,
    }


class NucleiWorker(BaseVulnHandler):
    domain        = "common"
    tool          = "nuclei"
    input_source  = "workspace"   # gọi 1 lần per workspace, không loop per-probe
    streams_to_db = True          # tự insert từng finding realtime

    _templates_ready = False

    def detect(self, target: dict) -> bool:
        return True

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

    def _build_url_list(self, workspace_id: str, target_ids: list[str] | None) -> list[str]:
        """
        Xây dựng URL list dạng scheme://host:port/ bằng cách:
        1. Lấy scheme chính xác từ web_probes (do httpx xác định)
        2. Bổ sung các web ports chưa có trong web_probes (infer scheme từ port)
        Luôn bao gồm port trong URL để nuclei có context đầy đủ.

        target_ids: list các target cụ thể được chọn; None/rỗng = toàn bộ workspace.
        """
        urls: set[str] = set()
        covered: set[tuple] = set()   # (host, port) đã có scheme từ DB

        # None → quét tất cả targets (1 query với target_id=None)
        id_list = target_ids if target_ids else [None]

        for tid in id_list:
            # Nguồn 1: live web probes — scheme chính xác từ httpx
            for p in _db.get_live_web_probes(workspace_id, tid):
                host   = p["host"]
                port   = int(p["port"])
                scheme = p.get("scheme") or ("https" if port in (443, 8443, 4443) else "http")
                urls.add(f"{scheme}://{host}:{port}/")
                covered.add((host, port))

            # Nguồn 2: web ports chưa có trong web_probes
            for p in _db.get_web_ports(workspace_id, tid):
                host = p["host"]
                port = int(p["port"])
                if (host, port) not in covered:
                    scheme = "https" if port in (443, 8443, 4443) else "http"
                    urls.add(f"{scheme}://{host}:{port}/")

        return sorted(urls)

    def _filter_live_urls(self, urls: list[str]) -> list[str]:
        """
        Lọc URL còn sống bằng httpx trước khi đưa vào nuclei.
        Port mở ở tầng TCP (naabu) nhưng không serve HTTP sẽ khiến nuclei
        retry mọi template tới khi timeout — đặc biệt nghiêm trọng với -nmhe
        (tắt cơ chế skip host chết) → scan treo. httpx loại các URL này trước.
        """
        if not urls:
            return []
        try:
            proc = subprocess.run(
                ["httpx", "-silent", "-no-color", "-nc",
                 "-timeout", "8", "-retries", "1"],
                input="\n".join(urls),
                capture_output=True, text=True, timeout=120,
            )
            live = sorted({ln.strip() for ln in proc.stdout.splitlines() if ln.strip()})
            # Lưu ý: httpx chuẩn hóa URL (bỏ port chuẩn :80/:443) nên không so khớp
            # trực tiếp với input — chỉ log theo số lượng.
            if live and len(live) < len(urls):
                logger.info(f"httpx: {len(live)}/{len(urls)} URL sống (loại {len(urls) - len(live)} không serve HTTP)")
            return live or urls   # httpx fail toàn bộ → fallback URL gốc
        except Exception as exc:
            logger.warning(f"httpx filter lỗi, dùng URL gốc: {exc}")
            return urls

    def run(self, target: dict, job_id: str, workspace_id: str, target_id):
        self._ensure_templates()

        # target_ids (nhiều target được chọn) ưu tiên; fallback target_id đơn
        target_ids = target.get("target_ids")
        if not target_ids and target_id:
            target_ids = [target_id]

        url_list = self._build_url_list(workspace_id, target_ids)
        if not url_list:
            logger.warning("nuclei: không có URL nào (chạy SCAN_PORT + SCAN_WEB_INFO trước)")
            return []

        # Lọc URL chết bằng httpx → tránh nuclei treo trên port không serve HTTP
        url_list = self._filter_live_urls(url_list)
        if not url_list:
            logger.warning("nuclei: không còn URL sống sau khi lọc httpx")
            return []

        logger.info(f"nuclei scan {len(url_list)} URLs — workspace {workspace_id}")
        for u in url_list:
            logger.info(f"  {u}")

        # Ghi URL list ra file tạm
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, prefix="nuclei_urls_"
        )
        tmp.write("\n".join(url_list))
        tmp.close()
        url_file = tmp.name

        findings = []
        try:
            proc = subprocess.Popen(
                ["nuclei", "-l", url_file, "-j", "-silent", "-no-color",
                 "-nmhe"],   # không blacklist host vì WAF noise (đã lọc port chết bằng httpx)
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )

            q: queue.Queue[str | None] = queue.Queue()

            def _drain_stdout():
                for line in proc.stdout:
                    q.put(line)
                q.put(None)

            threading.Thread(target=_drain_stdout, daemon=True).start()

            # Backstop rất rộng (3 giờ) — để nuclei chạy tới khi tự hoàn thành,
            # chỉ kill nếu thực sự treo bất thường.
            deadline = time.monotonic() + 10800
            while True:
                if time.monotonic() > deadline:
                    proc.kill()
                    logger.error("nuclei workspace scan timeout")
                    break
                try:
                    line = q.get(timeout=1)
                except queue.Empty:
                    continue

                if line is None:
                    break

                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue

                parsed  = _parse_finding(item, {})
                finding = self._finding(**parsed)
                logger.info(
                    f"nuclei [{finding['severity'].upper()}] {finding['title']} — {finding['url']}"
                )

                try:
                    _db.insert_nuclei_findings(workspace_id, target_id, job_id, [finding])
                except Exception as db_exc:
                    logger.error(f"nuclei insert finding failed: {db_exc}")

                findings.append(finding)

            proc.wait()

        except Exception as exc:
            logger.error(f"nuclei workspace scan error: {exc}")
        finally:
            try:
                os.unlink(url_file)
            except OSError:
                pass

        logger.info(f"nuclei workspace {workspace_id} → {len(findings)} findings")
        return findings


registry.register(NucleiWorker())

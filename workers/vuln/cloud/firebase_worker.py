"""CLOUD — Google Firebase BaaS misconfiguration scanner (engine: OpenFirebase).

Chạy 1 lần/workspace (input_source="workspace"). Luồng:

  1. PREFILTER bằng tín hiệu Nuclei (bảng findings_nuclei) — lấy host dùng Firebase
     + seed config nuclei đã trích (authDomain/projectId/databaseURL).
  2. Trên CHỈ các host đó: discovery fetch HTML/JS để lấy projectId + apiKey + appId.
  3. FALLBACK: nếu scope CHƯA có tín hiệu Nuclei firebase nào → quét discovery trên
     toàn bộ live web probes (chạy độc lập được, nhưng chậm hơn).
  4. Gọi OpenFirebase (https://github.com/Icex0/OpenFirebase) với các flag --read-*
     tương ứng tool đang chọn, parse scan.json → findings.

CHỈ READ-ONLY: chỉ dùng các flag --read-* (RTDB/Firestore/Storage/Remote Config/
Functions). KHÔNG bao giờ dùng --write-* để tránh ghi dữ liệu lên target.

Mapping tool (UI) ↔ check ↔ flag OpenFirebase ↔ service trong scan.json:
  firebase-rtdb      rtdb       --read-rtdb       rtdb
  firebase-firestore firestore  --read-firestore  firestore
  firebase-storage   storage    --read-storage    storage
  firebase-config    config     --read-config     remote_config   (cần api-key+app-id)
  firebase-functions functions  --read-functions  cloud_functions (tự probe đa region)
"""
import re
import os
import json
import glob
import shutil
import logging
import tempfile
import subprocess
from urllib.parse import urljoin

import requests
import urllib3

from vuln.base import BaseVulnHandler
from vuln import registry
from core import db as _db

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RTI-Scanner/1.0"
_HEADERS = {"User-Agent": _UA}
_HTTP_TIMEOUT = 12
_JS_TIMEOUT = 8
_MAX_JS_FILES = 20          # giới hạn số file JS fetch để extract config
_MAX_BYTES = 2_000_000      # bỏ qua file JS quá lớn
_SNIPPET = 300              # độ dài evidence snippet

# OpenFirebase CLI
_OF_BIN        = "openfirebase"
_OF_TIMEOUT    = 600        # giây cho mỗi host (functions probe đa region khá lâu)
_OF_SCAN_RATE  = "5"        # requests/giây

# Các key trong Firebase config object — regex bắt cả dạng `key:"v"` và `"key":"v"`
_CONFIG_KEYS = (
    "apiKey", "authDomain", "databaseURL", "projectId",
    "storageBucket", "messagingSenderId", "appId",
)

# Map tool key (UI, hàng tool của module con Firebase) → tên check nội bộ
_CHECK_TOOLS = {
    "firebase-config":    "config",
    "firebase-rtdb":      "rtdb",
    "firebase-firestore": "firestore",
    "firebase-storage":   "storage",
    "firebase-functions": "functions",
}
_ALL_CHECKS = ("config", "rtdb", "firestore", "storage", "functions")

# check nội bộ → flag --read-* của OpenFirebase
_READ_FLAG = {
    "rtdb":      "--read-rtdb",
    "firestore": "--read-firestore",
    "storage":   "--read-storage",
    "config":    "--read-config",
    "functions": "--read-functions",
}
# service (scan.json) → check nội bộ
_SERVICE_CHECK = {
    "rtdb":            "rtdb",
    "firestore":       "firestore",
    "storage":         "storage",
    "remote_config":   "config",
    "cloud_functions": "functions",
}
# check → source_tool (tab UI) / severity / nhãn hiển thị
_SOURCE_TOOL = {
    "rtdb":      "firebase-rtdb",
    "firestore": "firebase-firestore",
    "storage":   "firebase-storage",
    "config":    "firebase-config",
    "functions": "firebase-functions",
}
_SEVERITY = {
    "rtdb":      "critical",
    "firestore": "critical",
    "storage":   "high",
    "config":    "medium",
    "functions": "medium",
}
_LABEL = {
    "rtdb":      "Realtime Database",
    "firestore": "Firestore",
    "storage":   "Storage bucket",
    "config":    "Remote Config",
    "functions": "Cloud Functions",
}


def _extract_config(text: str) -> dict:
    """Trích các trường Firebase config từ một đoạn HTML/JS."""
    cfg: dict = {}
    for key in _CONFIG_KEYS:
        m = re.search(rf'["\']?{key}["\']?\s*[:=]\s*["\']([^"\']+)["\']', text)
        if m:
            cfg[key] = m.group(1).strip()
    return cfg


def _script_srcs(html: str, base_url: str) -> list[str]:
    """Lấy URL <script src=...> (resolve tương đối → tuyệt đối). Giữ .js/.mjs hoặc URL có 'firebase'."""
    srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE)
    out, seen = [], set()
    for s in srcs:
        full = urljoin(base_url, s)
        low  = full.lower()
        if (low.endswith((".js", ".mjs")) or "firebase" in low) and full not in seen:
            seen.add(full)
            out.append(full)
    return out[:_MAX_JS_FILES]


def _project_id(cfg: dict) -> str:
    """projectId trực tiếp, hoặc suy ra từ authDomain (myapp.firebaseapp.com → myapp)."""
    pid = cfg.get("projectId", "")
    if pid:
        return pid
    ad = cfg.get("authDomain", "")
    if ad.endswith(".firebaseapp.com"):
        return ad[: -len(".firebaseapp.com")]
    if ad.endswith(".web.app"):
        return ad[: -len(".web.app")]
    return ""


def _seed_from_extracted(values: list) -> dict:
    """Suy seed config từ giá trị Nuclei trích (extracted_results). Thường là authDomain."""
    seed: dict = {}
    for v in values:
        if not isinstance(v, str):
            continue
        low = v.strip().lower()
        if not low:
            continue
        if "firebaseio.com" in low:
            url = v if low.startswith("http") else f"https://{v}"
            seed["databaseURL"] = url.rstrip("/")
        elif low.endswith(".firebaseapp.com") or low.endswith(".web.app"):
            seed["authDomain"] = v
        elif low.endswith(".appspot.com") or low.endswith(".firebasestorage.app"):
            seed["storageBucket"] = v
        elif re.fullmatch(r"[a-z0-9][a-z0-9-]{3,}", low):
            seed.setdefault("projectId", v)
    return seed


class FirebaseWorker(BaseVulnHandler):
    domain          = "cloud"
    tool            = "firebase"
    input_source    = "workspace"   # chạy 1 lần/workspace, tự prefilter từ nuclei
    requires_binary = False         # tool thật là 'openfirebase' (xem is_available)

    def is_available(self) -> bool:
        return shutil.which(_OF_BIN) is not None

    def detect(self, target: dict) -> bool:
        return True

    def handles_tool(self, tool_key: str) -> bool:
        # Phụ trách cả 'firebase' (chạy hết) lẫn từng check riêng 'firebase-*'
        return tool_key == self.tool or tool_key in _CHECK_TOOLS

    @staticmethod
    def _select_checks(requested) -> set:
        """Từ payload.tools → tập check cần chạy. None/'firebase' → tất cả."""
        if not requested:
            return set(_ALL_CHECKS)
        sel = {_CHECK_TOOLS[t] for t in requested if t in _CHECK_TOOLS}
        if "firebase" in requested or not sel:
            return set(_ALL_CHECKS)
        return sel

    # ── main ─────────────────────────────────────────────────────────
    def run(self, target, job_id, workspace_id, target_id):
        target_ids = target.get("target_ids")
        if not target_ids and target_id:
            target_ids = [target_id]
        id_list = target_ids if target_ids else [None]

        checks = self._select_checks(target.get("tools"))

        # 1. PREFILTER — gom host dùng Firebase từ tín hiệu Nuclei + seed config
        host_seeds: dict[str, dict] = {}   # host -> {"url": str, "seed": {...}}
        for tid in id_list:
            for row in _db.get_firebase_nuclei_signals(workspace_id, tid):
                host = (row.get("host") or "").strip()
                if not host:
                    continue
                seed = _seed_from_extracted(row.get("extracted_results") or [])
                entry = host_seeds.setdefault(host, {"url": row.get("url") or "", "seed": {}})
                entry["seed"].update({k: v for k, v in seed.items() if v})
                if not entry["url"] and row.get("url"):
                    entry["url"] = row["url"]

        findings: list[dict] = []

        if host_seeds:
            logger.info(f"firebase: prefilter từ Nuclei → {len(host_seeds)} host | checks={sorted(checks)}")
            for host, info in host_seeds.items():
                findings += self._scan_host(info.get("url", ""), host, info.get("seed", {}), checks)
        else:
            # 2. FALLBACK — chưa có tín hiệu Nuclei → quét discovery trên live web probes
            logger.info("firebase: không có tín hiệu Nuclei firebase — fallback quét live web "
                        "probes (chạy Common/Nuclei trước để lọc nhanh hơn)")
            seen: set = set()
            for tid in id_list:
                for p in _db.get_live_web_probes(workspace_id, tid):
                    key = (p.get("host"), p.get("port"))
                    if key in seen or p.get("scheme") not in ("http", "https"):
                        continue
                    seen.add(key)
                    findings += self._scan_host(p.get("url") or "", p.get("host") or "", {}, checks)

        logger.info(f"firebase → {len(findings)} findings")
        return findings

    # ── 1 host: lấy config (nuclei seed + discovery) → chạy OpenFirebase ──
    def _scan_host(self, url: str, host: str, seed: dict, checks: set) -> list[dict]:
        cfg = dict(seed)
        if url:
            for k, v in self._discover_config(url).items():
                cfg.setdefault(k, v)

        project_id = _project_id(cfg)
        if not project_id:
            logger.info(f"firebase {url or host}: không xác định được projectId — bỏ qua")
            return []

        logger.info(f"firebase {host} → projectId={project_id} keys={list(cfg)}")
        return self._run_openfirebase(project_id, cfg, host, checks)

    # ── discovery: fetch HTML + JS để lấy Firebase config ─────────────
    def _discover_config(self, url: str) -> dict:
        cfg: dict = {}
        try:
            r = requests.get(url, headers=_HEADERS, timeout=_HTTP_TIMEOUT,
                             verify=False, allow_redirects=True)
            html = r.text or ""
        except requests.RequestException as e:
            logger.debug(f"firebase fetch {url} lỗi: {e}")
            return {}

        cfg.update(_extract_config(html))

        srcs = _script_srcs(html, url)
        srcs.sort(key=lambda s: 0 if "firebase" in s.lower() else 1)
        for src in srcs:
            if cfg.get("projectId") and cfg.get("apiKey"):
                break
            try:
                jr = requests.get(src, headers=_HEADERS, timeout=_JS_TIMEOUT,
                                  verify=False, stream=True)
                clen = jr.headers.get("Content-Length")
                if clen and clen.isdigit() and int(clen) > _MAX_BYTES:
                    continue
                body = jr.text or ""
            except requests.RequestException:
                continue
            for k, v in _extract_config(body).items():
                cfg.setdefault(k, v)

        return cfg

    # ── OpenFirebase: chạy read-only + parse scan.json ────────────────
    def _run_openfirebase(self, project_id: str, cfg: dict, host: str, checks: set) -> list[dict]:
        flags = [_READ_FLAG[c] for c in checks if c in _READ_FLAG]
        if not flags:
            return []

        outdir = tempfile.mkdtemp(prefix="of_")
        cmd = [_OF_BIN, "--project-id", project_id,
               "--output-dir", outdir, "--scan-rate", _OF_SCAN_RATE, *flags]
        # Remote Config cần api-key + app-id; truyền nếu discovery có
        if cfg.get("apiKey"):
            cmd += ["--api-key", cfg["apiKey"]]
        if cfg.get("appId"):
            cmd += ["--app-id", cfg["appId"]]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=_OF_TIMEOUT)
            matches = glob.glob(os.path.join(outdir, "**", "*_scan.json"), recursive=True)
            if not matches:
                logger.warning(f"firebase {host}: OpenFirebase không tạo scan.json "
                               f"(rc={proc.returncode})")
                return []
            with open(matches[0], encoding="utf-8") as fh:
                data = json.load(fh)
            return self._parse_scan(data, host)
        except subprocess.TimeoutExpired:
            logger.error(f"firebase {host}: OpenFirebase timeout sau {_OF_TIMEOUT}s")
            return []
        except Exception as e:
            logger.error(f"firebase {host}: OpenFirebase lỗi: {e}")
            return []
        finally:
            shutil.rmtree(outdir, ignore_errors=True)

    @staticmethod
    def _is_public(unauth: dict) -> bool:
        sec     = (unauth.get("security") or "").upper()
        verdict = (unauth.get("verdict") or "").lower()
        return sec.startswith("PUBLIC") or verdict in ("public", "open", "writable", "accessible")

    def _parse_scan(self, data: dict, host: str) -> list[dict]:
        """scan.json → findings. Chỉ lấy resource truy cập được unauth (PUBLIC*)."""
        version  = data.get("tool_version", "")
        findings: list[dict] = []
        for proj in data.get("projects", []):
            pid = proj.get("project_id", "")
            for f in proj.get("findings", []):
                check = _SERVICE_CHECK.get(f.get("service", ""))
                if not check:
                    continue
                unauth = f.get("unauth") or {}
                if not self._is_public(unauth):
                    continue

                sec      = (unauth.get("security") or "").upper()
                severity = "critical" if sec == "PUBLIC_SA" else _SEVERITY.get(check, "medium")
                label    = _LABEL.get(check, check)
                url      = f.get("url", "")
                status   = unauth.get("status", "")
                message  = unauth.get("message", "")
                resp     = (unauth.get("response_content") or "")[:_SNIPPET]

                findings.append(self._finding(
                    source_tool = _SOURCE_TOOL[check],
                    title    = f"Firebase {label} truy cập unauth ({sec}): {pid}",
                    severity = severity,
                    type     = "misconfiguration",
                    host     = host,
                    url      = url or None,
                    evidence = (f"OpenFirebase {version} · service={f.get('service')} "
                                f"status={status} security={sec}\n{message}\n"
                                f"URL: {url}\nResponse: {resp}"),
                    remediation = "Sửa Firebase Security Rules để chặn đọc/ghi unauth "
                                  "(yêu cầu request.auth != null; mặc định deny cho "
                                  "RTDB/Firestore/Storage). PUBLIC_SA = service account lộ → "
                                  "thu hồi key & xoay vòng credential ngay.",
                ))
        return findings


registry.register(FirebaseWorker())

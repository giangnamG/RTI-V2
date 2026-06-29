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
import time
import shutil
import logging
import tempfile
import subprocess
from datetime import datetime
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

# Crawl — dump toàn bộ document của collection đã phát hiện (read-only REST)
_CRAWL_TOOL              = "firebase-firestore-crawl"
_CRAWL_DIR               = os.environ.get("FIRESTORE_CRAWL_DIR", "/data/firestore_crawl")
_CRAWL_PAGE_SIZE         = 300       # docs/trang (Firestore REST tối đa ~300)
_CRAWL_MAX_DOCS          = int(os.environ.get("FIRESTORE_CRAWL_MAX_DOCS", "100000"))  # cap mặc định/collection
_CRAWL_MAX_DOCS_HARD     = 3_000_000  # trần cứng kể cả khi payload yêu cầu cao hơn
_CRAWL_HTTP_TIMEOUT      = 30        # giây/request
_CRAWL_COLLECTION_BUDGET = 300       # giây/collection (chống treo)
_CRAWL_JOB_BUDGET        = 1800      # giây/job

# Các key trong Firebase config object — regex bắt cả dạng `key:"v"` và `"key":"v"`
_CONFIG_KEYS = (
    "apiKey", "authDomain", "databaseURL", "projectId",
    "storageBucket", "messagingSenderId", "appId",
)

# Map tool key (UI, hàng tool của module con Firebase) → tên check nội bộ
_CHECK_TOOLS = {
    "firebase-config":         "config",
    "firebase-rtdb":           "rtdb",
    "firebase-firestore":      "firestore",
    "firebase-firestore-fuzz": "firestore",   # firestore + fuzz collection names
    "firebase-storage":        "storage",
    "firebase-functions":      "functions",
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


def _firestore_wordlist(size: str) -> str | None:
    """Wordlist collection bundled trong package openfirebase (top-50/250/500)."""
    try:
        import openfirebase
        p = os.path.join(os.path.dirname(openfirebase.__file__),
                         "wordlist", f"firestore-collections-{size}.txt")
        return p if os.path.exists(p) else None
    except Exception:
        return None


def _resolve_fuzz_wordlist(val) -> str | None:
    """fuzz_wordlist: absolute path (từ module Wordlist, ưu tiên nếu tồn tại) HOẶC
    bundled key 'top-*'. Mirror cách dir_fuzz_worker resolve."""
    if val:
        v = str(val)
        if v.startswith("/") and os.path.exists(v):
            return v
        if v.startswith("top-"):
            return _firestore_wordlist(v)
    return _firestore_wordlist("top-250")


def _match_target(host: str, target_map: list) -> str | None:
    """host → target_id bằng domain suffix dài nhất (target_id không propagate trong pipeline)."""
    host = (host or "").lower()
    best_tid, best_len = None, -1
    for tid, dom in target_map:
        d = (dom or "").lower()
        if d and (host == d or host.endswith("." + d)) and len(d) > best_len:
            best_tid, best_len = tid, len(d)
    return best_tid


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
        # Phụ trách cả 'firebase' (chạy hết) lẫn từng check riêng 'firebase-*' + crawl
        return tool_key == self.tool or tool_key in _CHECK_TOOLS or tool_key == _CRAWL_TOOL

    @staticmethod
    def _resolve_max_docs(val) -> int:
        """payload.max_docs (cap doc/collection) — fallback mặc định, kẹp dưới trần cứng."""
        try:
            n = int(val)
            if n > 0:
                return min(n, _CRAWL_MAX_DOCS_HARD)
        except (TypeError, ValueError):
            pass
        return _CRAWL_MAX_DOCS

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

        tools_req = target.get("tools") or []

        # CRAWL — dump toàn bộ document của collection ĐÃ phát hiện (độc lập với OpenFirebase scan)
        if _CRAWL_TOOL in tools_req:
            return self._crawl(workspace_id, id_list, job_id,
                               self._resolve_max_docs(target.get("max_docs")))

        checks = self._select_checks(tools_req)
        target_map = _db.get_target_domains(workspace_id)   # map host→target (scope per-target)
        fuzz_wl = None
        if "firebase-firestore-fuzz" in tools_req:
            fuzz_wl = _resolve_fuzz_wordlist(target.get("fuzz_wordlist")) or _firestore_wordlist("top-250")
            logger.info(f"firebase: firestore fuzz collections — wordlist={fuzz_wl}")

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
                findings += self._scan_host(info.get("url", ""), host, info.get("seed", {}), checks, fuzz_wl,
                                            (workspace_id, _match_target(host, target_map) or target_id, job_id))
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
                    findings += self._scan_host(p.get("url") or "", p.get("host") or "", {}, checks, fuzz_wl,
                                                (workspace_id, _match_target(p.get("host") or "", target_map) or target_id, job_id))

        logger.info(f"firebase → {len(findings)} findings")
        return findings

    # ── 1 host: lấy config (nuclei seed + discovery) → chạy OpenFirebase ──
    def _scan_host(self, url, host, seed, checks, fuzz_wl=None, ctx=None) -> list[dict]:
        cfg = dict(seed)
        if url:
            for k, v in self._discover_config(url).items():
                cfg.setdefault(k, v)

        # Lưu config Firebase trích được (kể cả khi chưa đủ projectId để chạy OpenFirebase)
        if ctx and (cfg.get("apiKey") or cfg.get("projectId") or cfg.get("authDomain")):
            self._store_config(host, cfg, ctx)

        project_id = _project_id(cfg)
        if not project_id:
            logger.info(f"firebase {url or host}: không xác định được projectId — bỏ qua")
            return []

        logger.info(f"firebase {host} → projectId={project_id} keys={list(cfg)}")
        return self._run_openfirebase(project_id, cfg, host, checks, fuzz_wl, ctx)

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

    # ── Lưu Firebase web config trích được (hiển thị bảng config per-target) ──
    def _store_config(self, host, cfg, ctx) -> None:
        workspace_id, target_id, job_id = ctx
        try:
            _db.insert_extracted_firebase_config(workspace_id, target_id, job_id, host, cfg)
            logger.info(f"firebase config {host} → lưu (projectId={cfg.get('projectId')})")
        except Exception as e:
            logger.error(f"firebase config store {host} lỗi: {e}")

    # ── OpenFirebase: chạy read-only + parse scan.json ────────────────
    def _run_openfirebase(self, project_id, cfg, host, checks, fuzz_wl=None, ctx=None) -> list[dict]:
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
        # Fuzz tên collection (chỉ khi check firestore + có wordlist)
        if "firestore" in checks and fuzz_wl:
            cmd += ["--fuzz-collections", fuzz_wl]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=_OF_TIMEOUT)
            matches = glob.glob(os.path.join(outdir, "**", "*_scan.json"), recursive=True)
            if not matches:
                logger.warning(f"firebase {host}: OpenFirebase không tạo scan.json "
                               f"(rc={proc.returncode})")
                return []
            with open(matches[0], encoding="utf-8") as fh:
                data = json.load(fh)
            if "firestore" in checks and ctx:
                self._store_firestore(data, host, cfg, ctx)
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
        """scan.json → findings. GỘP theo (service, project) → 1 finding (tránh trùng);
        firestore: 1 finding misconfig + đếm/liệt kê collection public (chi tiết ở tab Collections)."""
        version = data.get("tool_version", "")
        agg: dict = {}
        order: list = []
        for proj in data.get("projects", []):
            pid = proj.get("project_id", "")
            for f in proj.get("findings", []):
                check = _SERVICE_CHECK.get(f.get("service", ""))
                if not check or not self._is_public(f.get("unauth") or {}):
                    continue
                key = (check, pid)
                unauth = f.get("unauth") or {}
                if key not in agg:
                    agg[key] = {
                        "check": check, "pid": pid, "service": f.get("service"),
                        "sec": (unauth.get("security") or "").upper(),
                        "status": unauth.get("status", ""), "message": unauth.get("message", ""),
                        "url": f.get("url", ""), "collections": [],
                    }
                    order.append(key)
                coll = (f.get("resource") or {}).get("collection")
                if coll:
                    agg[key]["collections"].append(coll)

        findings: list[dict] = []
        for key in order:
            a = agg[key]
            check, pid, sec = a["check"], a["pid"], a["sec"]
            severity = "critical" if sec == "PUBLIC_SA" else _SEVERITY.get(check, "medium")
            label    = _LABEL.get(check, check)
            uniq     = sorted(set(a["collections"]))
            title    = f"Firebase {label} truy cập unauth ({sec}): {pid}"
            ev       = (f"OpenFirebase {version} · service={a['service']} "
                        f"status={a['status']} security={sec}\n{a['message']}\nURL: {a['url']}")
            if check == "firestore" and uniq:
                title += f" — {len(uniq)} collection public"
                ev    += "\nCollections public: " + ", ".join(uniq[:30])
            findings.append(self._finding(
                source_tool = _SOURCE_TOOL[check],
                title    = title,
                severity = severity,
                type     = "misconfiguration",
                host     = host,
                url      = a["url"] or None,
                evidence = ev,
                remediation = "Sửa Firebase Security Rules để chặn đọc/ghi unauth "
                              "(yêu cầu request.auth != null; mặc định deny cho "
                              "RTDB/Firestore/Storage). PUBLIC_SA = service account lộ → "
                              "thu hồi key & xoay vòng credential ngay.",
            ))
        return findings

    def _fetch_collection_docs(self, url: str, api_key) -> list[str]:
        """GET 1 trang documents của collection public → list 'name' (path). Read-only."""
        if not url:
            return []
        probe = url + ("&" if "?" in url else "?") + "pageSize=300"
        if api_key:
            probe += f"&key={api_key}"
        try:
            r = requests.get(probe, headers=_HEADERS, timeout=_HTTP_TIMEOUT, verify=False)
            if r.status_code != 200:
                return []
            data = r.json()
            return [d["name"] for d in (data.get("documents") or []) if d.get("name")]
        except (requests.RequestException, ValueError, KeyError):
            return []

    # ── Lưu Firestore collections + documents tìm được (Documents/Collections tab) ──
    def _store_firestore(self, data: dict, host: str, cfg: dict, ctx) -> None:
        workspace_id, target_id, job_id = ctx
        api_key = cfg.get("apiKey")
        cols: list[dict] = []
        docs: list[dict] = []
        for proj in data.get("projects", []):
            pid = proj.get("project_id", "")
            for f in proj.get("findings", []):
                if f.get("service") != "firestore" or not self._is_public(f.get("unauth") or {}):
                    continue
                res        = f.get("resource") or {}
                collection = res.get("collection") or ""
                url        = f.get("url", "")
                # response_content trong scan.json bị truncate → fetch lại 1 trang documents
                # của collection public (read-only, đã xác nhận accessible) để lấy đủ doc path.
                doc_names = self._fetch_collection_docs(url, api_key)
                cols.append({"project_id": pid, "api_key": api_key, "collection": collection,
                             "url": url, "doc_count": len(doc_names)})
                for name in doc_names:
                    docs.append({"project_id": pid, "api_key": api_key, "collection": collection,
                                 "doc_path": name,
                                 "url": f"https://firestore.googleapis.com/v1/{name}"})
        try:
            if cols:
                _db.insert_firestore_collections(workspace_id, target_id, job_id, cols)
            if docs:
                _db.insert_firestore_documents(workspace_id, target_id, job_id, docs)
        except Exception as e:
            logger.error(f"firebase firestore store {host} lỗi: {e}")
        logger.info(f"firebase firestore {host} → lưu {len(cols)} collections, {len(docs)} documents")

    # ── CRAWL: dump toàn bộ document của các collection đã phát hiện ───
    def _crawl(self, workspace_id, id_list, job_id, max_docs) -> list:
        """Với mỗi target trong scope, lấy collection latest-run rồi dump TOÀN BỘ document
        (read-only) ra file JSON. Postgres chỉ giữ metadata + con trỏ file (R7)."""
        # Gom collection latest-run theo target (collection đã có sẵn target_id khi quét Firestore)
        seen: set = set()
        by_target: dict = {}   # target_id(str|None) -> [ {project_id, api_key, collection}, ... ]
        for tid in id_list:
            for r in _db.get_firestore_collections_latest(workspace_id, tid):
                key = (r["target_id"], r["project_id"], r["collection"])
                if key in seen:
                    continue
                seen.add(key)
                by_target.setdefault(r["target_id"], []).append(r)

        if not by_target:
            logger.info("firebase crawl: chưa có collection nào — chạy Firestore/Fuzz trước")
            return []

        meta_rows: list[dict] = []
        job_started = time.monotonic()
        stop = False

        for target_id, cols in by_target.items():
            rel_dir = os.path.join(str(workspace_id), target_id or "untargeted", str(job_id or "manual"))
            abs_dir = os.path.join(_CRAWL_DIR, rel_dir)
            try:
                os.makedirs(abs_dir, exist_ok=True)
            except Exception as e:
                logger.error(f"firebase crawl: tạo thư mục {abs_dir} lỗi: {e}")
                continue

            overview = {
                "collected_at": datetime.now().isoformat(timespec="seconds"),
                "workspace_id": str(workspace_id), "target_id": target_id,
                "job_id": str(job_id) if job_id else None, "collections": [],
            }

            for c in cols:
                if time.monotonic() - job_started > _CRAWL_JOB_BUDGET:
                    logger.warning("firebase crawl: chạm job time-budget — dừng sớm")
                    stop = True
                    break

                project_id, api_key, collection = c["project_id"], c["api_key"], c["collection"]
                docs, truncated, err = self._fetch_all_documents(project_id, collection, api_key, max_docs)

                fname = re.sub(r"[^A-Za-z0-9._-]", "_", collection) + ".json"
                rel_path = os.path.join(rel_dir, fname).replace("\\", "/")
                abs_path = os.path.join(_CRAWL_DIR, rel_path)
                byte_size = 0
                try:
                    with open(abs_path, "w", encoding="utf-8") as fh:
                        json.dump(docs, fh, indent=2, ensure_ascii=False)
                    byte_size = os.path.getsize(abs_path)
                except Exception as e:
                    err = (err + " | " if err else "") + f"WRITE_ERROR: {e}"

                status = "error" if (err and not docs) else ("partial" if (err or truncated) else "ok")
                meta_rows.append({
                    "target_id": target_id, "project_id": project_id, "collection": collection,
                    "doc_count": len(docs), "byte_size": byte_size, "file_path": rel_path,
                    "status": status, "error": err, "truncated": truncated,
                })
                overview["collections"].append({
                    "collection": collection, "project_id": project_id, "count": len(docs),
                    "status": status, "error": err, "truncated": truncated, "file": fname,
                })
                logger.info(f"firebase crawl {collection} (pid={project_id}) → {len(docs)} docs"
                            f"{' [TRUNCATED]' if truncated else ''}{' err=' + err if err else ''}")

            overview["total_documents"] = sum(x["count"] for x in overview["collections"])
            try:
                with open(os.path.join(abs_dir, "overview.json"), "w", encoding="utf-8") as fh:
                    json.dump(overview, fh, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"firebase crawl: ghi overview lỗi: {e}")
            if stop:
                break

        try:
            _db.insert_firestore_crawls(workspace_id, job_id, meta_rows)
        except Exception as e:
            logger.error(f"firebase crawl: lưu metadata lỗi: {e}")
        logger.info(f"firebase crawl → dump {len(meta_rows)} collection (job={job_id}, cap={max_docs}/coll)")
        return []   # crawl không tạo finding; kết quả ở bảng firestore_crawls + file

    def _fetch_all_documents(self, project_id, collection, api_key, max_docs):
        """Phân trang TOÀN BỘ document của 1 collection qua Firestore REST (read-only).
        Trả (docs, truncated, error). Mirror script người dùng + cap doc + time-budget."""
        base_url = (f"https://firestore.googleapis.com/v1/projects/{project_id}"
                    f"/databases/(default)/documents/{collection}")
        all_docs: list = []
        page_token = None
        err = None
        truncated = False
        started = time.monotonic()

        while len(all_docs) < max_docs:
            if time.monotonic() - started > _CRAWL_COLLECTION_BUDGET:
                truncated = True
                err = (err + " | " if err else "") + "TIME_BUDGET"
                break
            params = {"pageSize": min(_CRAWL_PAGE_SIZE, max_docs - len(all_docs))}
            if api_key:
                params["key"] = api_key
            if page_token:
                params["pageToken"] = page_token
            try:
                resp = requests.get(base_url, params=params, headers=_HEADERS,
                                    timeout=_CRAWL_HTTP_TIMEOUT, verify=False)
                data = resp.json()
            except Exception as e:
                err = f"REQUEST_ERROR: {e}"
                break
            if resp.status_code != 200:
                if isinstance(data, dict):
                    err = (data.get("error") or {}).get("status", f"HTTP_{resp.status_code}")
                else:
                    err = f"HTTP_{resp.status_code}"
                break
            if not isinstance(data, dict):
                break
            all_docs.extend(data.get("documents") or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break
            if len(all_docs) >= max_docs:
                truncated = True
                break
            time.sleep(0.2)

        return all_docs[:max_docs], truncated, err


registry.register(FirebaseWorker())

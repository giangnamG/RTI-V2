import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup

from core.base_handler import BaseJobHandler
from core import db, concurrency

# Hidden field names thường là CSRF / server-generated → cần fetch lại mỗi request
CSRF_FIELD_NAMES: set[str] = {
    "_token", "csrf_token", "csrfmiddlewaretoken",
    "_csrf", "csrf", "authenticity_token",
    "__requestverificationtoken", "_wpnonce",
    "nonce", "x-csrf-token",
}


class WebCrawlWorker(BaseJobHandler):
    """
    Xử lý job RECON_WEB_CRAWL — crawl web apps bằng katana.

    Payload nhận vào:
        {
            "workspace_id": "...",
            "target_id":    "...",   // tùy chọn
            "depth":        3,       // độ sâu crawl (default: 3)
            "js_crawl":     true,    // phân tích JS để tìm endpoint (default: true)
            "known_files":  true     // crawl robots.txt, sitemap.xml, ... (default: true)
        }

    Luồng:
        1. Query web_probes WHERE is_alive = true → danh sách seed URLs
        2. Chạy katana với list seed URLs → NDJSON output
        3. Parse output: mỗi dòng là 1 URL tìm được
        4. Gán base_url = seed URL có cùng host:port với discovered URL
        5. INSERT vào web_crawl_urls (append-only)
    """

    def job_types(self) -> list[str]:
        return ["RECON_WEB_CRAWL"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id") or None
        target_ids   = payload.get("target_ids") or None
        depth        = int(payload.get("depth", 3))
        js_crawl     = bool(payload.get("js_crawl", True))
        known_files  = bool(payload.get("known_files", True))

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        if not shutil.which("katana"):
            self.logger.warning("katana không được cài đặt, bỏ qua")
            return {"total_seeds": 0, "discovered": 0, "saved_urls": 0, "saved_forms": 0, "targets": 0}

        # Multi-target: target_ids (nhiều) → target_id (một) → TẤT CẢ target active.
        targets = db.resolve_scan_targets(workspace_id, target_id, target_ids)
        if not targets:
            self.logger.warning(f"Không có target nào để crawl (workspace={workspace_id})")
            return {"total_seeds": 0, "discovered": 0, "saved_urls": 0, "saved_forms": 0, "targets": 0}

        self.logger.info(f"RECON_WEB_CRAWL cho {len(targets)} target(s), depth={depth}")

        per = concurrency.run_tasks(
            targets,
            lambda t: self._crawl_one_target(job_id, workspace_id, t, depth, js_crawl, known_files),
        )
        per = [r for r in per if r]

        discovered  = sum(r["discovered"]  for r in per)
        forms_total = sum(r["forms"]       for r in per)
        saved_urls  = sum(r["saved_urls"]  for r in per)
        saved_forms = sum(r["saved_forms"] for r in per)
        self.logger.info(
            f"RECON_WEB_CRAWL xong — {len(targets)} target, {discovered} URL, "
            f"{forms_total} form (lưu {saved_urls} URL, {saved_forms} form)"
        )
        return {
            "discovered":  discovered,
            "forms":       forms_total,
            "saved_urls":  saved_urls,
            "saved_forms": saved_forms,
            "targets":     len(targets),
        }

    def _crawl_one_target(
        self, job_id: str, workspace_id: str, target: dict,
        depth: int, js_crawl: bool, known_files: bool,
    ) -> dict:
        """Crawl live web probe của 1 target, lưu URL/form per-target."""
        tid = target["id"]
        live_probes = db.get_live_web_probes(workspace_id, tid)
        if not live_probes:
            self.logger.info(
                f"  [{target.get('host') or target.get('domain')}] chưa có live web probe — chạy SCAN_WEB_INFO trước"
            )
            return {"discovered": 0, "forms": 0, "saved_urls": 0, "saved_forms": 0}

        urls, forms = self._run_katana(live_probes, depth, js_crawl, known_files)
        saved_urls  = db.insert_web_crawl_urls(workspace_id, tid, job_id, urls)
        saved_forms = db.insert_web_crawl_forms(workspace_id, tid, job_id, forms)
        self.logger.info(
            f"  [{target.get('host') or target.get('domain')}] {len(live_probes)} seed → "
            f"{len(urls)} URL, {len(forms)} form (lưu {saved_urls}/{saved_forms})"
        )
        return {
            "discovered":  len(urls),
            "forms":       len(forms),
            "saved_urls":  saved_urls,
            "saved_forms": saved_forms,
        }

    # ── Tool runner ───────────────────────────────────────────

    def _run_katana(
        self,
        probes: list[dict],
        depth: int,
        js_crawl: bool,
        known_files: bool,
    ) -> tuple[list[dict], list[dict]]:
        # Dùng URL đã được httpx xác nhận (có thể là URL sau redirect)
        seed_urls = [p["url"] for p in probes]

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as uf:
            uf.write("\n".join(seed_urls))
            urls_file = uf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "katana",
                "-list",    urls_file,
                "-j",                       # jsonl output format
                "-o",       out_file,
                "-silent",
                "-d",       str(depth),
                "-c",       "10",
                "-p",       "10",
                "-timeout", "10",
                "-retry",   "1",
                "-nc",
                "-fx",                      # form extraction → response.body included in jsonl
            ]
            if js_crawl:
                cmd.append("-jc")
            if known_files:
                cmd.extend(["-kf", "all"])

            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(
                cmd, capture_output=True, text=True, timeout=3600
            )

            if proc.stderr:
                self.logger.debug(f"katana stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"katana exit {proc.returncode}")

            return self._parse_output(out_file, probes)

        except subprocess.TimeoutExpired:
            self.logger.error("katana timeout sau 3600s")
            return [], []
        except Exception as e:
            self.logger.error(f"katana lỗi: {e}")
            return [], []
        finally:
            Path(urls_file).unlink(missing_ok=True)
            Path(out_file).unlink(missing_ok=True)

    # ── Helpers ───────────────────────────────────────────────

    def _match_base_url(self, endpoint_url: str, probes: list[dict]) -> str:
        """
        Tìm seed URL phù hợp nhất cho discovered URL dựa trên netloc (host:port).
        Nếu không khớp → dùng scheme://netloc của discovered URL.
        """
        try:
            ep = urlparse(endpoint_url)
            ep_netloc = ep.netloc  # host:port hoặc host
            for probe in probes:
                seed = urlparse(probe["url"])
                if seed.netloc == ep_netloc:
                    return probe["url"]
            # Fallback
            return f"{ep.scheme}://{ep.netloc}"
        except Exception:
            return endpoint_url

    def _parse_output(self, filepath: str, probes: list[dict]) -> tuple[list[dict], list[dict]]:
        """
        Parse katana JSONL output (v1.x).

        katana v1.1.2 fields per line:
          request.endpoint  — URL tìm được
          request.method    — HTTP method
          request.source    — page chứa link này
          request.tag       — HTML tag (a, script, form, link, ...)
          request.attribute — HTML attribute (href, src, action, ...)
          response.status_code
          response.content_type
          response.body     — HTML body (có khi dùng -fx)

        Returns: (urls, forms)
        """
        urls:        list[dict] = []
        forms:       list[dict] = []
        seen_urls:   set[str]   = set()
        seen_forms:  set[str]   = set()  # dedup theo (source_url, action_url, method)
        seen_bodies: set[str]   = set()  # pages đã parse form để tránh duplicate

        url_depth: dict[str, int] = {}
        for probe in probes:
            u = probe["url"]
            url_depth[u] = 0
            url_depth[u.rstrip("/")] = 0

        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)

                        req  = obj.get("request",  {}) or {}
                        resp = obj.get("response", {}) or {}

                        url    = req.get("endpoint", "")
                        source = req.get("source",   "") or ""
                        tag    = req.get("tag", "") or ""

                        if not url:
                            continue

                        # ── Depth tracking ────────────────────────────
                        if url not in seen_urls:
                            if source:
                                parent_depth = url_depth.get(source, url_depth.get(source.rstrip("/"), 0))
                                depth = parent_depth + 1
                            else:
                                depth = 0
                            url_depth[url] = depth
                            url_depth[url.rstrip("/")] = depth

                        # ── URLs ──────────────────────────────────────
                        if url not in seen_urls:
                            seen_urls.add(url)
                            urls.append({
                                "url":          url,
                                "base_url":     self._match_base_url(url, probes),
                                "method":       (req.get("method") or "GET").upper(),
                                "status_code":  resp.get("status_code") or None,
                                "content_type": resp.get("content_type") or None,
                                "source_tag":   tag or None,
                                "source_attr":  req.get("attribute") or None,
                                "source_url":   source or None,
                                "depth":        url_depth[url],
                            })

                        # ── Forms từ response body (katana -fx) ──────
                        # -fx đính response.body vào mỗi JSONL line.
                        # Parse một lần mỗi URL để tránh trùng lặp.
                        body = resp.get("body", "") or ""
                        if body and url not in seen_bodies:
                            seen_bodies.add(url)
                            extracted = self._extract_forms_from_html(body, url, probes)
                            for form in extracted:
                                dedup_key = f"{form['source_url']}|{form['action_url']}|{form['method']}"
                                if dedup_key not in seen_forms:
                                    seen_forms.add(dedup_key)
                                    forms.append(form)

                    except (json.JSONDecodeError, ValueError):
                        pass
        except FileNotFoundError:
            pass

        return urls, forms

    def _extract_forms_from_html(
        self,
        html: str,
        page_url: str,
        probes: list[dict],
    ) -> list[dict]:
        """
        Parse HTML body → extract tất cả <form> tags → normalize thành dict.

        URL resolution rule:
          - action là full URI (https://...) → dùng nguyên
          - action là protocol-relative (//host/...) → kế thừa scheme từ page_url
          - action là relative / root-relative / empty → urljoin(page_url, action)
        """
        results = []
        try:
            soup = BeautifulSoup(html, "html.parser")
            for form_tag in soup.find_all("form"):
                action = (form_tag.get("action") or "").strip()
                method = (form_tag.get("method") or "GET").upper()
                enctype = form_tag.get("enctype") or "application/x-www-form-urlencoded"

                # Resolve action → full URI
                if action.startswith("//"):
                    scheme = urlparse(page_url).scheme or "https"
                    action_url = f"{scheme}:{action}"
                elif action.startswith(("http://", "https://")):
                    action_url = action
                else:
                    # relative hoặc rỗng ("#") → urljoin xử lý đúng tất cả cases
                    action_url = urljoin(page_url, action or page_url)

                fields = []
                has_csrf = False

                for inp in form_tag.find_all(["input", "textarea", "select", "button"]):
                    name  = inp.get("name", "").strip()
                    if not name:
                        continue
                    ftype = inp.get("type", "text").lower()
                    value = inp.get("value", "") or ""

                    # File input → form phải dùng multipart/form-data
                    if ftype == "file":
                        enctype = "multipart/form-data"

                    is_csrf = (
                        ftype == "hidden"
                        and name.lower() in CSRF_FIELD_NAMES
                    )
                    if is_csrf:
                        has_csrf = True

                    fields.append({
                        "name":     name,
                        "type":     ftype,
                        "value":    value,
                        "dynamic":  is_csrf,
                        "required": inp.has_attr("required"),
                    })

                results.append({
                    "source_url": page_url,
                    "action_url": action_url,
                    "base_url":   self._match_base_url(action_url, probes),
                    "method":     method,
                    "enctype":    enctype,
                    "fields":     fields,
                    "has_csrf":   has_csrf,
                })
        except Exception as e:
            self.logger.debug(f"Parse form lỗi: {e}")

        return results

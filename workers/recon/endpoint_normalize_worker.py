import re
import json
import concurrent.futures
from urllib.parse import urlparse, parse_qs, urljoin

import requests
from bs4 import BeautifulSoup

from core.base_handler import BaseJobHandler
from core import db

CSRF_FIELD_NAMES: set[str] = {
    "_token", "csrf_token", "csrfmiddlewaretoken",
    "_csrf", "csrf", "authenticity_token",
    "__requestverificationtoken", "_wpnonce",
    "nonce", "x-csrf-token",
}

# Extensions tĩnh — loại bỏ khỏi GET endpoint list
STATIC_EXTENSIONS = {
    "js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico", "webp",
    "woff", "woff2", "ttf", "eot", "otf",
    "pdf", "zip", "gz", "tar", "rar",
    "mp3", "mp4", "avi", "mov", "wmv",
    "map",   # source map
    "txt",   # robots.txt đã được xử lý bởi katana
}

# Param name chứa ký tự JS expression → không phải real param
RE_JS_PARAM = re.compile(
    r"[:()\[\]{}\$]|this\.|function|=>|\|\||&&|typeof|instanceof|\.length|\.join",
    re.IGNORECASE,
)

# Source URL extensions mà URL bên trong thường là JS expressions
JS_SOURCE_EXTENSIONS = {"js", "jsx", "ts", "tsx", "mjs", "cjs"}

# Path segment trông như ID động (số, UUID, hash)
RE_DYNAMIC_SEGMENT = re.compile(
    r"^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$",
    re.IGNORECASE,
)


class EndpointNormalizeWorker(BaseJobHandler):
    """
    Xử lý job RECON_ENDPOINT_NORMALIZE.

    Đọc từ:
        - web_crawl_urls   → normalize GET endpoints + extract query params
        - web_crawl_forms  → normalize POST endpoints + map form fields

    Ghi vào:
        - fuzz_endpoints   (append-only)

    Payload nhận vào:
        {
            "workspace_id": "...",
            "target_id":    "..."   // tùy chọn
        }
    """

    def job_types(self) -> list[str]:
        return ["RECON_ENDPOINT_NORMALIZE"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id", "").strip() or None

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        # ── Bước 1: Normalize GET endpoints từ web_crawl_urls ──
        raw_urls = db.get_crawl_urls_for_normalize(workspace_id, target_id)
        get_endpoints = self._normalize_get_urls(raw_urls)
        self.logger.info(
            f"GET: {len(raw_urls)} raw → {len(get_endpoints)} endpoints sau filter"
        )

        # ── Bước 2: Fetch HTML pages và extract forms ──────────
        html_urls = self._pick_html_pages(raw_urls)
        self.logger.info(f"Sẽ fetch {len(html_urls)} HTML pages để extract forms")
        fetched_forms = self._fetch_and_extract_forms(html_urls)
        self.logger.info(f"Extract được {len(fetched_forms)} forms từ HTML pages")

        # ── Bước 3: Normalize forms từ web_crawl_forms (katana) ─
        raw_forms = db.get_crawl_forms_for_normalize(workspace_id, target_id)
        db_forms  = self._normalize_forms(raw_forms)

        # Gộp và dedup forms theo (action_url, method)
        seen_forms: set[tuple] = set()
        post_endpoints: list[dict] = []
        for f in fetched_forms + db_forms:
            key = (f["url"], f["method"])
            if key not in seen_forms:
                seen_forms.add(key)
                post_endpoints.append(f)

        self.logger.info(
            f"POST/GET-form: {len(post_endpoints)} endpoints sau dedup"
        )

        all_endpoints = get_endpoints + post_endpoints
        saved = db.insert_fuzz_endpoints(workspace_id, target_id, job_id, all_endpoints)

        self.logger.info(f"Lưu {saved} fuzz endpoints")
        return {
            "raw_urls":       len(raw_urls),
            "raw_forms":      len(raw_forms),
            "get_endpoints":  len(get_endpoints),
            "post_endpoints": len(post_endpoints),
            "saved":          saved,
        }

    # ── GET normalization ──────────────────────────────────────

    def _normalize_get_urls(self, raw_urls: list[dict]) -> list[dict]:
        """
        Filter + normalize URL list thành GET fuzz endpoints.

        Filter out:
          - Static file extensions
          - Duplicate paths (same path structure, khác query value)

        Normalize:
          - Extract query params (name + value)
          - Detect dynamic path segments → ghi chú source="path_param"
        """
        # Dedup theo (normalized_path, frozenset of param names)
        seen: set[tuple] = set()
        results = []

        for row in raw_urls:
            url        = row["url"]
            method     = (row.get("method") or "GET").upper()
            source_url = row.get("source_url") or ""

            # Chỉ xử lý GET — POST từ form được xử lý riêng
            if method != "GET":
                continue

            # Bỏ URL được extract từ JS/TS source files — thường là JS expressions
            src_ext = source_url.rsplit(".", 1)[-1].lower().split("?")[0] if "." in source_url else ""
            if src_ext in JS_SOURCE_EXTENSIONS:
                continue

            parsed = urlparse(url)

            # Loại static extensions
            path = parsed.path or "/"
            ext  = path.rsplit(".", 1)[-1].lower() if "." in path.split("/")[-1] else ""
            if ext in STATIC_EXTENSIONS:
                continue

            # Normalize path: /user/123/profile → /user/{id}/profile
            norm_path, path_params = self._normalize_path(path)

            # Parse query string — bỏ param names trông như JS expressions
            qs_params = []
            if parsed.query:
                for name, values in parse_qs(parsed.query, keep_blank_values=True).items():
                    # Bỏ param name quá dài hoặc chứa JS syntax
                    if len(name) > 60 or RE_JS_PARAM.search(name):
                        continue
                    qs_params.append({
                        "name":   name,
                        "value":  values[0] if values else "",
                        "source": "query_string",
                    })

            # Dedup: (host, norm_path, param_names_set)
            param_names = frozenset(p["name"] for p in qs_params + path_params)
            dedup_key   = (parsed.netloc, norm_path, param_names)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            # Build clean URL không có query string (params tách riêng)
            clean_url = f"{parsed.scheme}://{parsed.netloc}{path}"

            results.append({
                "url":         clean_url,
                "method":      "GET",
                "content_type": None,
                "params":      qs_params + path_params,
                "has_csrf":    False,
                "source_url":  row.get("source_url"),
                "source_type": "crawl_url",
            })

        return results

    def _normalize_path(self, path: str) -> tuple[str, list[dict]]:
        """
        Phát hiện path segments trông như ID động, thay bằng {id}.
        Trả về (normalized_path, path_params list).

        Ví dụ: /user/123/profile → /user/{id}/profile
                path_params = [{"name": "id", "value": "123", "source": "path_param"}]
        """
        segments = path.split("/")
        norm_segments = []
        path_params   = []
        id_counter    = 0

        for seg in segments:
            if seg and RE_DYNAMIC_SEGMENT.match(seg):
                id_counter += 1
                param_name = "id" if id_counter == 1 else f"id{id_counter}"
                norm_segments.append(f"{{{param_name}}}")
                path_params.append({
                    "name":   param_name,
                    "value":  seg,
                    "source": "path_param",
                })
            else:
                norm_segments.append(seg)

        return "/".join(norm_segments), path_params

    # ── POST / form normalization ──────────────────────────────

    def _normalize_forms(self, raw_forms: list[dict]) -> list[dict]:
        """
        Normalize web_crawl_forms thành fuzz_endpoints.
        fields từ DB là JSONB (list of dict).
        """
        results = []

        for row in raw_forms:
            action_url = row["action_url"]
            method     = (row.get("method") or "POST").upper()
            enctype    = row.get("enctype") or "application/x-www-form-urlencoded"
            has_csrf   = bool(row.get("has_csrf", False))
            source_url = row.get("source_url") or None

            fields = row.get("fields") or []
            # psycopg2 RealDictCursor trả JSONB đã parse → list[dict]
            if isinstance(fields, str):
                import json
                fields = json.loads(fields)

            params = [
                {
                    "name":     f.get("name", ""),
                    "type":     f.get("type", "text"),
                    "value":    f.get("value", ""),
                    "dynamic":  bool(f.get("dynamic", False)),
                    "required": bool(f.get("required", False)),
                    "source":   "form_html",
                }
                for f in fields
                if f.get("name")
            ]

            # Map enctype → content_type header
            content_type_map = {
                "application/x-www-form-urlencoded": "application/x-www-form-urlencoded",
                "multipart/form-data":               "multipart/form-data",
                "application/json":                  "application/json",
                "text/plain":                        "text/plain",
            }
            content_type = content_type_map.get(enctype, "application/x-www-form-urlencoded")

            results.append({
                "url":          action_url,
                "method":       method,
                "content_type": content_type,
                "params":       params,
                "has_csrf":     has_csrf,
                "source_url":   source_url,
                "source_type":  "crawl_form",
            })

        return results

    # ── HTML fetch + form extraction ───────────────────────────

    def _pick_html_pages(self, raw_urls: list[dict]) -> list[str]:
        """
        Chọn các URL có khả năng là HTML page để fetch.
        Giới hạn 200 pages để tránh quá tải.
        """
        candidates = []
        seen: set[str] = set()

        for row in raw_urls:
            url = row["url"]
            ct  = row.get("content_type") or ""

            if ct and "html" not in ct and "text" not in ct:
                continue

            parsed = urlparse(url)
            path   = parsed.path or "/"
            ext    = path.rsplit(".", 1)[-1].lower() if "." in path.split("/")[-1] else ""
            if ext in STATIC_EXTENSIONS:
                continue

            key = f"{parsed.netloc}{path}"
            if key in seen:
                continue
            seen.add(key)
            candidates.append(url)
            if len(candidates) >= 200:
                break

        return candidates

    def _fetch_and_extract_forms(self, urls: list[str]) -> list[dict]:
        """Fetch mỗi URL song song (max 20 threads), parse HTML, extract forms."""
        forms: list[dict] = []

        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; RTI-Scanner/2.0)"})

        def fetch_one(url: str) -> list[dict]:
            try:
                resp = session.get(url, timeout=8, allow_redirects=True, verify=False)
                ct = resp.headers.get("content-type", "")
                if "html" not in ct:
                    return []
                return self._extract_forms_from_html(resp.text, resp.url)
            except Exception as e:
                self.logger.debug(f"Fetch {url} lỗi: {e}")
                return []

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
            futures = {ex.submit(fetch_one, url): url for url in urls}
            for future in concurrent.futures.as_completed(futures):
                try:
                    forms.extend(future.result())
                except Exception:
                    pass

        return forms

    def _extract_forms_from_html(self, html: str, page_url: str) -> list[dict]:
        """Parse HTML → extract tất cả <form> → normalize thành fuzz endpoint dict."""
        results = []
        try:
            soup = BeautifulSoup(html, "html.parser")
            for form_tag in soup.find_all("form"):
                action  = (form_tag.get("action") or "").strip()
                method  = (form_tag.get("method") or "GET").upper()
                enctype = form_tag.get("enctype") or "application/x-www-form-urlencoded"

                if action.startswith("//"):
                    scheme     = urlparse(page_url).scheme or "https"
                    action_url = f"{scheme}:{action}"
                elif action.startswith(("http://", "https://")):
                    action_url = action
                else:
                    action_url = urljoin(page_url, action or page_url)

                fields   = []
                has_csrf = False

                for inp in form_tag.find_all(["input", "textarea", "select", "button"]):
                    name  = (inp.get("name") or "").strip()
                    if not name:
                        continue
                    ftype = (inp.get("type") or "text").lower()
                    value = inp.get("value") or ""

                    # File input → force multipart
                    if ftype == "file":
                        enctype = "multipart/form-data"

                    is_csrf = ftype == "hidden" and name.lower() in CSRF_FIELD_NAMES
                    if is_csrf:
                        has_csrf = True

                    fields.append({
                        "name":     name,
                        "type":     ftype,
                        "value":    value,
                        "dynamic":  is_csrf,
                        "required": inp.has_attr("required"),
                        "source":   "form_html",
                    })

                content_type_map = {
                    "application/x-www-form-urlencoded": "application/x-www-form-urlencoded",
                    "multipart/form-data":               "multipart/form-data",
                    "application/json":                  "application/json",
                }
                content_type = content_type_map.get(enctype, "application/x-www-form-urlencoded")

                results.append({
                    "url":          action_url,
                    "method":       method,
                    "content_type": content_type,
                    "params":       fields,
                    "has_csrf":     has_csrf,
                    "source_url":   page_url,
                    "source_type":  "crawl_form",
                })
        except Exception as e:
            self.logger.debug(f"Parse form lỗi ({page_url}): {e}")
        return results

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from core.base_handler import BaseJobHandler
from core import db


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
        target_id    = payload.get("target_id", "").strip() or None
        depth        = int(payload.get("depth", 3))
        js_crawl     = bool(payload.get("js_crawl", True))
        known_files  = bool(payload.get("known_files", True))

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        # Lấy danh sách live web probes làm seed
        live_probes = db.get_live_web_probes(workspace_id, target_id)

        if not live_probes:
            self.logger.warning(
                f"Không có live web probe nào để crawl "
                f"(workspace={workspace_id}, target={target_id}). "
                f"Hãy chạy SCAN_WEB_INFO trước."
            )
            return {"total_seeds": 0, "discovered": 0, "saved": 0}

        self.logger.info(
            f"Crawl {len(live_probes)} live endpoint(s), depth={depth}, "
            f"js={js_crawl}, known_files={known_files}"
        )

        results: list[dict] = []

        if shutil.which("katana"):
            results = self._run_katana(live_probes, depth, js_crawl, known_files)
        else:
            self.logger.warning("katana không được cài đặt, bỏ qua")

        saved = db.insert_web_crawl_urls(workspace_id, target_id, job_id, results)

        self.logger.info(
            f"Crawl xong: {len(results)} URLs tìm được, lưu {saved}"
        )
        return {
            "total_seeds": len(live_probes),
            "discovered":  len(results),
            "saved":       saved,
        }

    # ── Tool runner ───────────────────────────────────────────

    def _run_katana(
        self,
        probes: list[dict],
        depth: int,
        js_crawl: bool,
        known_files: bool,
    ) -> list[dict]:
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
                "-c",       "10",           # concurrency
                "-p",       "10",           # parallelism (requests per host)
                "-timeout", "10",           # request timeout seconds
                "-retry",   "1",
                "-nc",                      # no-color
            ]
            if js_crawl:
                cmd.append("-jc")           # JavaScript crawling
            if known_files:
                cmd.extend(["-kf", "all"]) # robots.txt, sitemap.xml, ...

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
            return []
        except Exception as e:
            self.logger.error(f"katana lỗi: {e}")
            return []
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

    def _parse_output(self, filepath: str, probes: list[dict]) -> list[dict]:
        """
        Parse katana JSONL output (v1.x).

        katana v1.1.2 fields per line:
          request.endpoint  — URL tìm được
          request.method    — HTTP method
          request.source    — page chứa link này (vắng mặt với seed URL)
          request.tag       — HTML tag (a, script, form, link, ...)
          request.attribute — HTML attribute (href, src, action, ...)
          response.status_code
          response.content_type

        Lưu ý: katana v1.1.2 không expose field `depth` trong JSONL output.
        Depth được tính từ source chain: seed=0, discovered từ depth-N → depth N+1.
        """
        results: list[dict] = []
        seen: set[str] = set()
        # url → depth map; khởi tạo seeds ở depth 0
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

                        if not url or url in seen:
                            continue
                        seen.add(url)

                        # Tính depth từ source chain
                        if source:
                            parent_depth = url_depth.get(source, url_depth.get(source.rstrip("/"), 0))
                            depth = parent_depth + 1
                        else:
                            depth = 0  # seed URL

                        url_depth[url] = depth
                        url_depth[url.rstrip("/")] = depth

                        results.append({
                            "url":          url,
                            "base_url":     self._match_base_url(url, probes),
                            "method":       (req.get("method") or "GET").upper(),
                            "status_code":  resp.get("status_code") or None,
                            "content_type": resp.get("content_type") or None,
                            "source_tag":   req.get("tag")       or None,
                            "source_attr":  req.get("attribute") or None,
                            "source_url":   source or None,
                            "depth":        depth,
                        })
                    except (json.JSONDecodeError, ValueError):
                        pass
        except FileNotFoundError:
            pass

        return results

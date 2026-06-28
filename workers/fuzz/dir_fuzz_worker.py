import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from core.base_handler import BaseJobHandler
from core import db

# Wordlist mặc định trong container
DEFAULT_WORDLIST = "/app/wordlists/common.txt"

# Status codes không thú vị khi đánh giá is_interesting
BORING_STATUS_CODES: set[int] = {404, 429}


class DirFuzzWorker(BaseJobHandler):
    """
    Xử lý job FUZZ_DIR — directory/file bruteforce bằng ffuf.

    Payload nhận vào:
        {
            "workspace_id":  "uuid",
            "target_id":     "uuid",
            "wordlist":      "common",          // "common" hoặc đường dẫn tuyệt đối
            "extensions":    "",                // "" | "php,asp,html"
            "threads":       40,
            "status_filter": "200,201,204,301,302,307,401,403,405"
        }

    Luồng:
        1. Resolve wordlist path
        2. Lấy live web probes từ DB → base URLs
        3. Deduplicate theo (scheme, netloc)
        4. Với mỗi base URL (tối đa 20), chạy ffuf → parse JSON output
        5. Đánh dấu is_interesting, lưu vào DB
    """

    def job_types(self) -> list[str]:
        return ["FUZZ_DIR"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id  = payload.get("workspace_id", "")
        target_id     = payload.get("target_id", "").strip() or None
        wordlist_arg  = payload.get("wordlist", "common")
        extensions    = payload.get("extensions", "").strip()
        threads       = int(payload.get("threads", 40))
        status_filter = payload.get("status_filter", "200,201,204,301,302,307,401,403,405")

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        if not shutil.which("ffuf"):
            self.logger.warning("ffuf không được cài đặt, bỏ qua FUZZ_DIR")
            return {
                "total_urls":  0,
                "total_hits":  0,
                "interesting": 0,
                "saved":       0,
            }

        # Resolve wordlist
        if wordlist_arg == "common":
            wordlist = DEFAULT_WORDLIST
        else:
            wordlist = wordlist_arg

        if not Path(wordlist).exists():
            self.logger.warning(f"Wordlist không tồn tại: {wordlist}, bỏ qua FUZZ_DIR")
            return {
                "total_urls":  0,
                "total_hits":  0,
                "interesting": 0,
                "saved":       0,
            }

        live_probes = db.get_live_web_probes(workspace_id, target_id)

        if not live_probes:
            self.logger.warning(
                f"Không có live web probe nào để fuzz dir "
                f"(workspace={workspace_id}, target={target_id}). "
                f"Hãy chạy SCAN_WEB_INFO trước."
            )
            return {
                "total_urls":  0,
                "total_hits":  0,
                "interesting": 0,
                "saved":       0,
            }

        # Deduplicate base URLs theo (scheme, netloc)
        seen_netloc: set[tuple[str, str]] = set()
        base_urls: list[str] = []
        for p in live_probes:
            url = p["url"]
            parsed = urlparse(url)
            key = (parsed.scheme, parsed.netloc)
            if key not in seen_netloc:
                seen_netloc.add(key)
                # Dùng origin URL (không có path) làm base
                base_urls.append(f"{parsed.scheme}://{parsed.netloc}")

        # Giới hạn 20 base URLs mỗi job
        base_urls = base_urls[:20]
        self.logger.info(
            f"Fuzz dir cho {len(base_urls)} base URL(s) — "
            f"wordlist={wordlist}, threads={threads}, ext={extensions or 'none'}"
        )

        all_results: list[dict] = []

        for base_url in base_urls:
            hits = self._run_ffuf(base_url, wordlist, extensions, threads, status_filter)
            all_results.extend(hits)
            if hits:
                interesting = sum(1 for h in hits if h.get("is_interesting"))
                self.logger.info(
                    f"  {base_url} → {len(hits)} hits, {interesting} interesting"
                )

        saved = db.insert_dir_fuzz_results(workspace_id, target_id, job_id, all_results)
        interesting_total = sum(1 for r in all_results if r.get("is_interesting"))

        self.logger.info(
            f"FUZZ_DIR xong: {len(base_urls)} URLs, {len(all_results)} hits, "
            f"{interesting_total} interesting, lưu {saved}"
        )
        return {
            "total_urls":  len(base_urls),
            "total_hits":  len(all_results),
            "interesting": interesting_total,
            "saved":       saved,
        }

    # ── Tool runner ───────────────────────────────────────────

    def _run_ffuf(
        self,
        base_url: str,
        wordlist: str,
        extensions: str,
        threads: int,
        status_filter: str,
    ) -> list[dict]:
        """
        Chạy ffuf cho một base URL → trả về danh sách hits.
        """
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "ffuf",
                "-u",       f"{base_url}/FUZZ",
                "-w",       wordlist,
                "-mc",      status_filter,
                "-t",       str(threads),
                "-timeout", "10",
                "-o",       out_file,
                "-of",      "json",
                "-s",
                "-ac",
            ]

            # Thêm extensions nếu có (ví dụ: "php,asp" → "-e .php,.asp")
            if extensions:
                ext_list = ",".join(
                    f".{e.strip().lstrip('.')}"
                    for e in extensions.split(",")
                    if e.strip()
                )
                if ext_list:
                    cmd.extend(["-e", ext_list])

            self.logger.debug(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=1800,
            )

            if proc.returncode != 0:
                self.logger.debug(f"ffuf exit {proc.returncode} cho {base_url}")

            return self._parse_ffuf_output(out_file, base_url)

        except subprocess.TimeoutExpired:
            self.logger.error(f"ffuf timeout cho {base_url}")
            return []
        except Exception as e:
            self.logger.error(f"ffuf lỗi ({base_url}): {e}")
            return []
        finally:
            Path(out_file).unlink(missing_ok=True)

    def _parse_ffuf_output(self, filepath: str, base_url: str) -> list[dict]:
        """
        Parse ffuf JSON output.

        ffuf -of json viết object với key "results" là list of hits.
        Mỗi hit có: url, status, length, words, lines, redirectlocation, input.
        """
        results: list[dict] = []
        try:
            path = Path(filepath)
            if not path.exists() or path.stat().st_size == 0:
                return []

            with open(filepath) as f:
                data = json.load(f)

            hits = data.get("results", [])
            if not isinstance(hits, list):
                return []

            for hit in hits:
                status_code    = hit.get("status") or 0
                content_length = hit.get("length") or 0
                redirect_url   = hit.get("redirectlocation") or None
                words          = hit.get("words") or 0
                lines          = hit.get("lines") or 0
                url            = hit.get("url", "")
                content_type   = hit.get("content-type") or hit.get("content_type") or None

                # Lấy path từ URL bằng cách bỏ base_url prefix
                path_str = ""
                if url.startswith(base_url):
                    path_str = url[len(base_url):]
                    if not path_str.startswith("/"):
                        path_str = "/" + path_str
                else:
                    parsed = urlparse(url)
                    path_str = parsed.path or "/"

                # Heuristic is_interesting:
                # - status không phải 404/429
                # - content_length > 200 (không chỉ là trang redirect về homepage)
                is_interesting = (
                    status_code not in BORING_STATUS_CODES
                    and content_length > 200
                )

                results.append({
                    "base_url":       base_url,
                    "path":           path_str,
                    "url":            url,
                    "status_code":    status_code,
                    "content_length": content_length,
                    "content_type":   content_type,
                    "words":          words,
                    "lines":          lines,
                    "redirect_url":   redirect_url,
                    "is_interesting": is_interesting,
                })

        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass

        return results

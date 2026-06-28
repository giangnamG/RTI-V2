import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db


class ParamFuzzWorker(BaseJobHandler):
    """
    Xử lý job FUZZ_PARAM — discover hidden HTTP parameters bằng arjun.

    Payload nhận vào:
        {
            "workspace_id":  "uuid",
            "target_id":     "uuid",
            "method_filter": "ALL",   // GET | POST | ALL
            "threads":       5,
            "stable":        true
        }

    Luồng:
        1. Lấy fuzz_endpoints từ DB theo workspace/target/method
        2. Deduplicate theo (url, method)
        3. Với mỗi endpoint (tối đa 100), chạy arjun → phân tích JSON output
        4. Lưu các URL có params vào DB
    """

    def job_types(self) -> list[str]:
        return ["FUZZ_PARAM"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id  = payload.get("workspace_id", "")
        target_id     = payload.get("target_id", "").strip() or None
        method_filter = payload.get("method_filter", "ALL").upper()
        threads       = int(payload.get("threads", 5))
        stable        = bool(payload.get("stable", True))

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        if not shutil.which("arjun"):
            self.logger.warning("arjun không được cài đặt, bỏ qua FUZZ_PARAM")
            return {
                "total_endpoints":    0,
                "endpoints_with_params": 0,
                "total_params":       0,
                "saved":              0,
            }

        raw_endpoints = db.get_fuzz_endpoints_for_fuzz(workspace_id, target_id, method_filter)

        if not raw_endpoints:
            self.logger.warning(
                f"Không có fuzz endpoint nào "
                f"(workspace={workspace_id}, target={target_id}, method={method_filter}). "
                f"Hãy chạy RECON_NORMALIZE_ENDPOINTS trước."
            )
            return {
                "total_endpoints":    0,
                "endpoints_with_params": 0,
                "total_params":       0,
                "saved":              0,
            }

        # Deduplicate theo (url, method)
        seen: set[tuple[str, str]] = set()
        endpoints: list[dict] = []
        for ep in raw_endpoints:
            key = (ep["url"], ep.get("method", "GET").upper())
            if key not in seen:
                seen.add(key)
                endpoints.append(ep)

        # Giới hạn 100 endpoints mỗi job
        endpoints = endpoints[:100]
        self.logger.info(f"Fuzz params cho {len(endpoints)} endpoint(s) với arjun")

        all_results: list[dict] = []
        total_params = 0

        for ep in endpoints:
            url    = ep["url"]
            method = ep.get("method", "GET").upper()
            found  = self._run_arjun(url, method, threads, stable)
            if found:
                all_results.append({
                    "url":    url,
                    "method": method,
                    "params": found,
                })
                total_params += len(found)
                self.logger.info(f"  {method} {url} → {len(found)} params: {found}")

        saved = db.insert_fuzz_param_results(workspace_id, target_id, job_id, all_results)

        self.logger.info(
            f"FUZZ_PARAM xong: {len(endpoints)} endpoints, "
            f"{len(all_results)} có params, {total_params} params tổng, lưu {saved}"
        )
        return {
            "total_endpoints":       len(endpoints),
            "endpoints_with_params": len(all_results),
            "total_params":          total_params,
            "saved":                 saved,
        }

    # ── Tool runner ───────────────────────────────────────────

    def _run_arjun(self, url: str, method: str, threads: int, stable: bool) -> list[str]:
        """
        Chạy arjun cho một URL/method → trả về danh sách params tìm được.
        Trả về [] nếu arjun không tìm thấy hoặc lỗi.
        """
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "arjun",
                "-u",   url,
                "-m",   method,
                "-oJ",  out_file,
                "-t",   str(threads),
                "-q",
            ]
            if stable:
                cmd.append("--stable")

            self.logger.debug(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
            )

            if proc.returncode != 0:
                self.logger.debug(f"arjun exit {proc.returncode} cho {url}")

            return self._parse_arjun_output(out_file)

        except subprocess.TimeoutExpired:
            self.logger.error(f"arjun timeout cho {url}")
            return []
        except Exception as e:
            self.logger.error(f"arjun lỗi ({url}): {e}")
            return []
        finally:
            Path(out_file).unlink(missing_ok=True)

    def _parse_arjun_output(self, filepath: str) -> list[str]:
        """
        Parse arjun -oJ output.

        arjun viết file JSON với format:
            { "<url>": { "<METHOD>": ["param1", "param2", ...] } }

        Hoặc nhiều URLs:
            { "<url1>": { "GET": [...] }, "<url2>": { "POST": [...] } }

        Trả về danh sách params phẳng (flat list) từ tất cả methods/urls.
        """
        params: list[str] = []
        try:
            path = Path(filepath)
            if not path.exists() or path.stat().st_size == 0:
                return []

            with open(filepath) as f:
                data = json.load(f)

            if not isinstance(data, dict):
                return []

            for _url, method_map in data.items():
                if not isinstance(method_map, dict):
                    continue
                for _method, param_list in method_map.items():
                    if isinstance(param_list, list):
                        params.extend(str(p) for p in param_list)

        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass

        # Deduplicate, preserve order
        seen: set[str] = set()
        unique: list[str] = []
        for p in params:
            if p not in seen:
                seen.add(p)
                unique.append(p)
        return unique

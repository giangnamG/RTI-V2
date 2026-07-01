import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from core.base_handler import BaseJobHandler
from core import db, concurrency

# Ports that almost always run HTTPS
HTTPS_PORTS = {443, 8443, 9443, 4443, 10443}

# Service names that indicate HTTPS
HTTPS_SERVICES = {"https", "https-alt", "ssl/http", "ssl/https"}


class WebProbeWorker(BaseJobHandler):
    """
    Xử lý job SCAN_WEB_INFO — probe web services bằng httpx.

    Payload nhận vào:
        {
            "workspace_id": "...",
            "target_id":    "..."   // tùy chọn
        }

    Luồng:
        1. Query ports WHERE service_category = 'web' (từ SCAN_PORT)
           + SEED root domain target(s) từ bảng `targets` (không cần SCAN_PORT)
        2. Build URL list — port luôn explicit (http://host:80, https://host:443)
           để có key duy nhất cho từng endpoint
        3. Chạy httpx → NDJSON output
        4. Parse: giữ cả `input` (URL gốc) lẫn `url` (URL sau redirect)
        5. Match kết quả về đúng port qua `input` URL
        6. INSERT vào web_probes — mỗi (host, port) là 1 row riêng biệt,
           http:80 redirect sang https:443 vẫn là endpoint khác với https:443
    """

    def job_types(self) -> list[str]:
        return ["SCAN_WEB_INFO"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id") or None
        target_ids   = payload.get("target_ids") or None

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        # Multi-target: target_ids (nhiều) → target_id (một) → TẤT CẢ target active.
        targets = db.resolve_scan_targets(workspace_id, target_id, target_ids)
        if not targets:
            self.logger.warning(f"Không có target nào để probe (workspace={workspace_id})")
            return {"total_ports": 0, "probed": 0, "alive": 0, "saved": 0, "targets": 0}

        self.logger.info(f"SCAN_WEB_INFO cho {len(targets)} target(s)")

        # Loop qua target SONG SONG (scan pool), mỗi target probe riêng + lưu đúng per-target.
        per = concurrency.run_tasks(
            targets, lambda t: self._probe_one_target(job_id, workspace_id, t)
        )
        per = [r for r in per if r]

        probed = sum(r["probed"] for r in per)
        alive  = sum(r["alive"]  for r in per)
        saved  = sum(r["saved"]  for r in per)
        self.logger.info(
            f"SCAN_WEB_INFO xong — {len(targets)} target, {probed} probe, {alive} alive, lưu {saved}"
        )
        return {"probed": probed, "alive": alive, "saved": saved, "targets": len(targets)}

    def _probe_one_target(self, job_id: str, workspace_id: str, target: dict) -> dict:
        """Probe web endpoint của 1 target (web ports từ SCAN_PORT + seed root domain), lưu per-target."""
        tid = target["id"]

        # (a) web ports của target (từ SCAN_PORT) + (b) seed root domain target.
        web_ports = db.get_web_ports(workspace_id, tid)
        url_to_port: dict[str, dict] = {}
        for p in web_ports:
            url_to_port[self._build_url(p)] = p

        seeded = 0
        for url, host, port in self._target_seed_urls(target):
            if url not in url_to_port:
                url_to_port[url] = {"host": host, "port": port}
                seeded += 1

        if not url_to_port:
            self.logger.info(f"  [{target.get('host') or target.get('domain')}] không có URL để probe")
            return {"probed": 0, "alive": 0, "saved": 0}

        urls = list(url_to_port.keys())

        httpx_results: list[dict] = []
        if shutil.which("httpx"):
            httpx_results = self._run_httpx(urls)
        else:
            self.logger.warning("httpx không được cài đặt, bỏ qua")

        # WhatWeb — enrich technologies (match qua input_url TRƯỚC khi _enrich_with_port pop nó).
        if shutil.which("whatweb"):
            ww_map = self._run_whatweb(urls)
            for r in httpx_results:
                extra = ww_map.get(r.get("input_url", ""), [])
                if extra:
                    r["technologies"] = self._merge_technologies(r.get("technologies", []), extra)

        results = self._enrich_with_port(httpx_results, url_to_port)
        saved = db.insert_web_probes(workspace_id, tid, job_id, results)
        alive = sum(1 for r in results if r.get("is_alive"))
        self.logger.info(
            f"  [{target.get('host') or target.get('domain')}] "
            f"{len(web_ports)} port + {seeded} seed → {len(results)} probe, {alive} alive, lưu {saved}"
        )
        return {"probed": len(results), "alive": alive, "saved": saved}

    # ── Helpers ──────────────────────────────────────────────

    def _build_url(self, port_row: dict) -> str:
        """
        Luôn include port explicit — kể cả 80/443.
        http://host:80 và https://host:443 là 2 endpoint khác nhau.
        """
        host     = port_row["host"]
        port     = int(port_row["port"])
        svc_name = (port_row.get("service_name") or "").lower()

        scheme = "https" if (port in HTTPS_PORTS or svc_name in HTTPS_SERVICES) else "http"
        return f"{scheme}://{host}:{port}"

    def _target_seed_urls(self, target: dict) -> list[tuple[str, str, int]]:
        """target (dict đã chuẩn hoá từ backend) → list (url, host, port) để probe.

        Đọc scheme/host/port từ DB (backend parse 1 lần) thay vì tự parse domain thô:
        - scheme + port  → giữ nguyên cả hai
        - scheme, ko port → port mặc định theo scheme (https→443, else 80)
        - port, ko scheme → scheme suy từ port (https nếu HTTPS_PORTS, else http)
        - chỉ host       → thử cả http:80 và https:443 (httpx loại cái chết)
        Fallback: row cũ chưa backfill (host rỗng) → parse domain thô.
        """
        host   = (target.get("host") or "").strip()
        if not host:
            return self._parse_domain_seed_urls(target.get("domain") or "")
        scheme = (target.get("scheme") or "").strip().lower()
        port   = target.get("port")

        if scheme and port:
            return [(f"{scheme}://{host}:{int(port)}", host, int(port))]
        if scheme:
            p = 443 if scheme == "https" else 80
            return [(f"{scheme}://{host}:{p}", host, p)]
        if port:
            sch = "https" if int(port) in HTTPS_PORTS else "http"
            return [(f"{sch}://{host}:{int(port)}", host, int(port))]
        return [
            (f"http://{host}:80",   host, 80),
            (f"https://{host}:443", host, 443),
        ]

    def _parse_domain_seed_urls(self, domain: str) -> list[tuple[str, str, int]]:
        """Fallback cho target row cũ chưa có cột host (parse chuỗi domain thô)."""
        d = (domain or "").strip()
        if not d:
            return []
        p = urlparse(d if "://" in d else f"//{d}")
        host = p.hostname
        if not host:
            return []
        if "://" in d:
            scheme = p.scheme or "http"
            port = p.port or (443 if scheme == "https" else 80)
            return [(f"{scheme}://{host}:{port}", host, port)]
        if p.port:
            scheme = "https" if p.port in HTTPS_PORTS else "http"
            return [(f"{scheme}://{host}:{p.port}", host, p.port)]
        return [
            (f"http://{host}:80",   host, 80),
            (f"https://{host}:443", host, 443),
        ]

    def _enrich_with_port(
        self,
        results: list[dict],
        url_to_port: dict[str, dict],
    ) -> list[dict]:
        """
        Gắn (host, port) vào mỗi kết quả httpx.

        Dùng field `input_url` (URL gốc trước redirect) để tra cứu port_row.
        `url` (URL sau redirect) được giữ nguyên để hiển thị đích thực.

        Ví dụ:
            input_url = http://agribank.vnpay.vn:80   → port_row port=80
            url       = https://agribank.vnpay.vn     → final destination (redirect)
        """
        enriched = []
        for r in results:
            input_url = r.pop("input_url", "") or ""

            # Tra cứu trực tiếp qua input_url
            port_row = url_to_port.get(input_url)

            if port_row:
                r["host"] = port_row["host"]
                r["port"] = int(port_row["port"])
            else:
                # Fallback: parse từ input_url
                parsed = urlparse(input_url) if input_url else urlparse(r.get("url", ""))
                host = parsed.hostname or ""
                port = parsed.port
                if not host:
                    continue
                r["host"] = host
                r["port"] = port or (443 if parsed.scheme == "https" else 80)

            enriched.append(r)

        return enriched

    # ── Tool runner ───────────────────────────────────────────

    def _run_httpx(self, urls: list[str]) -> list[dict]:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as uf:
            uf.write("\n".join(urls))
            urls_file = uf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "httpx",
                "-list",           urls_file,
                "-json",
                "-o",              out_file,
                "-silent",
                "-title",
                "-status-code",
                "-tech-detect",
                "-server",
                "-content-length",
                "-content-type",
                "-response-time",
                "-follow-redirects",
                "-max-redirects",  "3",
                "-timeout",        "10",
                "-threads",        "50",
                "-no-color",
            ]

            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)

            if proc.stderr:
                self.logger.debug(f"httpx stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"httpx exit {proc.returncode}")

            return self._parse_output(out_file)

        except subprocess.TimeoutExpired:
            self.logger.error("httpx timeout sau 1800s")
            return []
        except Exception as e:
            self.logger.error(f"httpx lỗi: {e}")
            return []
        finally:
            Path(urls_file).unlink(missing_ok=True)
            Path(out_file).unlink(missing_ok=True)

    def _run_whatweb(self, urls: list[str]) -> dict[str, list[str]]:
        """
        Chạy WhatWeb → trả về {input_url: [technologies_with_version]}.
        WhatWeb phát hiện CMS (WordPress, Joomla, Drupal...) chính xác hơn httpx.
        """
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as uf:
            uf.write("\n".join(urls))
            urls_file = uf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "whatweb",
                f"--input-file={urls_file}",
                f"--log-json={out_file}",
                "--quiet",
                "--no-errors",
                "--threads=20",
            ]
            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

            if proc.returncode != 0:
                self.logger.warning(f"WhatWeb exit {proc.returncode}")

            return self._parse_whatweb(out_file)

        except subprocess.TimeoutExpired:
            self.logger.error("WhatWeb timeout sau 600s")
            return {}
        except Exception as e:
            self.logger.error(f"WhatWeb lỗi: {e}")
            return {}
        finally:
            Path(urls_file).unlink(missing_ok=True)
            Path(out_file).unlink(missing_ok=True)

    def _parse_whatweb(self, filepath: str) -> dict[str, list[str]]:
        """
        Parse WhatWeb --log-json output → {url: [tech_names]}.
        WhatWeb output là JSON array; mỗi entry có "target" và "plugins" dict.

        WhatWeb follow redirects → output có thể có nhiều entry cho 1 URL gốc
        (1 entry per hop trong redirect chain).  Ví dụ:
            ganket.vnpay.vn:443 → 301 → akabiz.net/ (WordPress)
        Cần merge technologies của URL đích vào URL gốc để WordPress
        được gán đúng về endpoint ban đầu.
        """
        results: dict[str, list[str]] = {}
        redirect_map: dict[str, str] = {}  # src_norm → dst_norm
        try:
            with open(filepath) as f:
                content = f.read().strip()
            if not content:
                return results

            # WhatWeb output có thể là array hoặc NDJSON (1 object/line)
            try:
                data = json.loads(content)
                entries = data if isinstance(data, list) else [data]
            except json.JSONDecodeError:
                entries = []
                for line in content.splitlines():
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass

            for entry in entries:
                target  = entry.get("target", "").rstrip("/")
                plugins = entry.get("plugins", {})
                techs: list[str] = []
                redirect_dest: str | None = None

                for name, info in plugins.items():
                    if name == "RedirectLocation":
                        # Ghi lại redirect destination, không add vào tech list
                        if isinstance(info, dict):
                            locs = info.get("string", [])
                            if locs:
                                redirect_dest = locs[0].rstrip("/")
                        continue

                    if isinstance(info, dict):
                        versions = info.get("version", [])
                        if versions:
                            techs.append(f"{name} {versions[0]}")
                        else:
                            techs.append(name)
                    else:
                        techs.append(str(name))

                if target:
                    results[target] = techs
                    if redirect_dest:
                        redirect_map[target] = redirect_dest

            # Follow redirect chain: merge technologies của redirect target
            # vào URL gốc.  Ví dụ: ganket.vnpay.vn:443 → akabiz.net/ có WordPress
            # → WordPress được gán về ganket.vnpay.vn:443
            for src, dst in redirect_map.items():
                dst_techs = results.get(dst, results.get(dst.rstrip("/"), []))
                if not dst_techs:
                    continue
                merged: dict[str, str] = {}
                for t in results.get(src, []) + dst_techs:
                    t = t.strip()
                    if not t:
                        continue
                    key = t.split(" ")[0].lower()
                    if len(t) > len(merged.get(key, "")):
                        merged[key] = t
                results[src] = sorted(merged.values())

        except FileNotFoundError:
            pass
        return results

    def _merge_technologies(self, httpx_techs: list[str], whatweb_techs: list[str]) -> list[str]:
        """
        Merge technologies từ httpx và WhatWeb.
        Key = tên chính (lowercase), ưu tiên entry dài hơn (có version info).
        Ví dụ: httpx="WordPress", WhatWeb="WordPress 6.2" → giữ "WordPress 6.2"
        """
        merged: dict[str, str] = {}
        for tech in httpx_techs + whatweb_techs:
            tech = tech.strip()
            if not tech:
                continue
            key = tech.split(" ")[0].lower()
            if len(tech) > len(merged.get(key, "")):
                merged[key] = tech
        return sorted(merged.values())

    def _parse_output(self, filepath: str) -> list[dict]:
        """
        Parse httpx NDJSON output.

        httpx JSON fields:
          - `input`  : URL gốc trước redirect (dùng để match lại port)
          - `url`    : URL sau redirect (final destination)
          - `scheme` : scheme của URL sau redirect
        """
        results = []
        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)

                        if obj.get("failed"):
                            continue

                        technologies = (
                            obj.get("technologies") or
                            obj.get("tech") or
                            []
                        )

                        results.append({
                            # input_url = URL gốc httpx nhận vào (trước redirect)
                            # dùng nội bộ để match port_row, sẽ bị pop trong _enrich_with_port
                            "input_url":      obj.get("input") or obj.get("url", ""),
                            "url":            obj.get("url", ""),
                            "scheme":         obj.get("scheme"),
                            "status_code":    obj.get("status_code") or obj.get("status-code"),
                            "title":          obj.get("title") or None,
                            "web_server":     obj.get("webserver") or obj.get("web-server") or None,
                            "technologies":   [str(t) for t in technologies],
                            "content_type":   obj.get("content_type") or obj.get("content-type") or None,
                            "content_length": obj.get("content_length") or obj.get("content-length") or None,
                            # httpx v1.6+ dùng field "time" (vd "20.56ms"), không phải "response_time"
                            "response_time":  obj.get("time") or obj.get("response_time") or obj.get("response-time") or None,
                            "ip_address":     obj.get("host") or None,
                            "is_alive":       True,
                        })
                    except (json.JSONDecodeError, ValueError):
                        pass
        except FileNotFoundError:
            pass
        return results

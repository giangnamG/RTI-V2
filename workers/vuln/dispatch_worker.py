"""
VulnDispatchWorker — VULN_DISPATCH job handler.

Đọc tech stack từ web_probes, điều phối các tool phù hợp cho từng target.
Kết quả đổ về bảng findings (source_tool + source_domain columns).

Payload:
{
    "workspace_id": "uuid",
    "target_id":    "uuid | null",       // null = tất cả targets
    "domains":      ["common", "cms"],   // default: common + cms + software + cloud + discovery
    "tools":        ["nuclei", "wpscan"] // optional: chỉ chạy tool cụ thể
}
"""
import logging
from core.base_handler import BaseJobHandler
from core import db, concurrency
from vuln import registry

# Import để trigger đăng ký vào registry
import vuln.common.nuclei_worker      # noqa: F401
import vuln.common.testssl_worker     # noqa: F401
import vuln.cms.wpscan_worker         # noqa: F401
import vuln.cms.wpprobe_worker        # noqa: F401
import vuln.cms.joomscan_worker       # noqa: F401
import vuln.cms.droopescan_worker     # noqa: F401
import vuln.software.gitlab_worker    # noqa: F401
import vuln.software.jenkins_worker   # noqa: F401
import vuln.software.confluence_worker  # noqa: F401
import vuln.software.grafana_worker   # noqa: F401
import vuln.software.tomcat_worker    # noqa: F401
import vuln.cloud.aws_worker          # noqa: F401
import vuln.cloud.gcp_worker          # noqa: F401
import vuln.cloud.azure_worker        # noqa: F401
import vuln.cloud.firebase_worker     # noqa: F401
import vuln.discovery.git_worker      # noqa: F401
import vuln.discovery.env_worker      # noqa: F401
import vuln.discovery.cors_worker     # noqa: F401
import vuln.network_service.redis_worker    # noqa: F401
import vuln.network_service.mysql_worker    # noqa: F401
import vuln.network_service.mongodb_worker  # noqa: F401
import vuln.web_params.sqlmap_worker  # noqa: F401
import vuln.web_params.dalfox_worker  # noqa: F401

logger = logging.getLogger(__name__)

DEFAULT_DOMAINS = ["common", "cms", "software", "cloud", "discovery"]


class VulnDispatchWorker(BaseJobHandler):

    def job_types(self) -> list[str]:
        return ["VULN_DISPATCH"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id  = payload.get("workspace_id", "")
        target_id_raw = payload.get("target_id") or None
        target_id     = str(target_id_raw).strip() if target_id_raw else None
        # target_ids: nhiều target được chọn cụ thể (ưu tiên hơn target_id đơn)
        target_ids    = payload.get("target_ids") or None
        if target_ids:
            target_ids = [str(t).strip() for t in target_ids if t]
        domains       = payload.get("domains", DEFAULT_DOMAINS)
        tool_filter   = payload.get("tools")   # None = không filter

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        handlers = registry.get_all()
        if tool_filter:
            handlers = [h for h in handlers if any(h.handles_tool(t) for t in tool_filter)]

        logger.info(f"VULN_DISPATCH bắt đầu — domains: {domains}, tools: {tool_filter or 'all'}")
        logger.info(f"Registry: {registry.summary()}")

        runs: list[dict] = []
        total_findings   = 0

        # ── Web-probe based domains ───────────────────────────────
        web_domains = [d for d in domains if d in ("common", "cms", "software", "cloud", "discovery")]
        if web_domains:
            # Workspace-level handlers — chạy 1 lần per workspace (ví dụ: NucleiWorker)
            ws_handlers = [h for h in handlers if h.input_source == "workspace" and h.domain in web_domains]
            for h in ws_handlers:
                ws_target = {"workspace_id": workspace_id, "target_id": target_id,
                             "target_ids": target_ids, "tools": tool_filter,
                             # tham số scan tuỳ chọn cho workspace-handler (firebase fuzz/crawl)
                             "fuzz_wordlist": payload.get("fuzz_wordlist"),
                             "max_docs": payload.get("max_docs")}
                run = {"tool": h.tool, "domain": h.domain, "target": f"workspace:{workspace_id}"}
                if not h.is_available():
                    run["status"] = "skipped"; run["reason"] = "not_installed"
                    runs.append(run); continue
                if not h.detect(ws_target):
                    run["status"] = "skipped"; run["reason"] = "not_applicable"
                    runs.append(run); continue
                logger.info(f"  [{h.domain}] {h.tool} → workspace {workspace_id}")
                try:
                    findings = h.run(ws_target, job_id, workspace_id, target_id)
                    if findings and not getattr(h, "streams_to_db", False):
                        db.insert_vuln_findings(workspace_id, target_id, job_id, findings)
                    total_findings += len(findings)
                    run["status"] = "completed"; run["findings"] = len(findings)
                except Exception as e:
                    logger.error(f"  [{h.domain}] {h.tool} lỗi: {e}")
                    run["status"] = "failed"; run["error"] = str(e)
                runs.append(run)

            # Per-probe handlers — chạy cho mỗi live web probe
            web_handlers = [h for h in handlers if h.input_source == "web_probes" and h.domain in web_domains]
            if target_ids:
                probes, _seen = [], set()
                for tid in target_ids:
                    for p in db.get_live_web_probes(workspace_id, tid):
                        key = (p.get("host"), p.get("port"))
                        if key not in _seen:
                            _seen.add(key); probes.append(p)
            else:
                probes = db.get_live_web_probes(workspace_id, target_id)

            if not probes:
                logger.warning("Không có live web probe — hãy chạy SCAN_WEB_INFO trước")
            else:
                # Fan-out: mỗi probe = 1 (target, url) → quét SONG SONG qua scan pool dùng chung
                for cnt, recs in self._fan_out(
                    probes, web_handlers, lambda p: p.get("url", ""),
                    job_id, workspace_id, target_id,
                ):
                    total_findings += cnt
                    runs.extend(recs)

        # ── Port-based domains ────────────────────────────────────
        if "network_service" in domains:
            port_handlers = [h for h in handlers if h.input_source == "ports"]
            ports = db.get_open_ports(workspace_id, target_id)

            if not ports:
                logger.warning("Không có open port — hãy chạy SCAN_PORT trước")
            else:
                for cnt, recs in self._fan_out(
                    ports, port_handlers, lambda p: f"{p.get('host')}:{p.get('port')}",
                    job_id, workspace_id, target_id,
                ):
                    total_findings += cnt
                    runs.extend(recs)

        # ── Fuzz-param based domains ──────────────────────────────
        if "web_params" in domains:
            param_handlers = [h for h in handlers if h.input_source == "fuzz_params"]
            params = db.get_fuzz_param_results_for_vuln(workspace_id, target_id)

            if not params:
                logger.warning("Không có fuzz param results — hãy chạy FUZZ_PARAM trước")
            else:
                for cnt, recs in self._fan_out(
                    params, param_handlers, lambda p: p.get("url", ""),
                    job_id, workspace_id, target_id,
                ):
                    total_findings += cnt
                    runs.extend(recs)

        completed = sum(1 for r in runs if r.get("status") == "completed")
        skipped   = sum(1 for r in runs if r.get("status") == "skipped")
        failed    = sum(1 for r in runs if r.get("status") == "failed")

        logger.info(
            f"VULN_DISPATCH xong — {total_findings} findings | "
            f"{completed} ran, {skipped} skipped, {failed} failed"
        )
        return {
            "total_findings": total_findings,
            "runs_completed": completed,
            "runs_skipped":   skipped,
            "runs_failed":    failed,
        }

    # ── helpers ───────────────────────────────────────────────────

    def _fan_out(self, items, handlers, label_fn, job_id, workspace_id, target_id):
        """Quét `items` (probe/port/param) SONG SONG qua scan pool dùng chung (bounded).
        Mỗi item = 1 (target, url). Trả list (count, records); item lỗi (None) bị loại.
        Aggregation (total/runs) do caller gộp ĐƠN LUỒNG → không cần lock."""
        results = concurrency.run_tasks(
            items,
            lambda item: self._run_handlers(
                handlers, item, label_fn(item), job_id, workspace_id, target_id
            ),
        )
        return [r for r in results if r is not None]

    def _run_handlers(
        self, handlers, target, label, job_id, workspace_id, target_id
    ) -> tuple[int, list]:
        """Chạy mọi handler trên 1 target/url. STATELESS + thread-safe: chỉ biến local,
        trả (tổng findings, list run records) — KHÔNG mutate state dùng chung."""
        total = 0
        records: list[dict] = []
        for h in handlers:
            run = {"tool": h.tool, "domain": h.domain, "target": label}

            if not h.is_available():
                run["status"] = "skipped"; run["reason"] = "not_installed"
                records.append(run); continue

            if not h.detect(target):
                run["status"] = "skipped"; run["reason"] = "not_applicable"
                records.append(run); continue

            logger.info(f"  [{h.domain}] {h.tool} → {label}")
            try:
                findings = h.run(target, job_id, workspace_id, target_id)
                if findings and not getattr(h, "streams_to_db", False):
                    # streams_to_db=True → worker đã insert realtime, bỏ qua batch
                    db.insert_vuln_findings(workspace_id, target_id, job_id, findings)
                total += len(findings)
                run["status"] = "completed"; run["findings"] = len(findings)
            except Exception as e:
                logger.error(f"  [{h.domain}] {h.tool} lỗi: {e}")
                run["status"] = "failed"; run["error"] = str(e)

            records.append(run)
        return total, records

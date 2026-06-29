"""
BaseVulnHandler — abstract base class cho tất cả vulnerability scan handlers.

Cách thêm tool mới:
  1. Kế thừa BaseVulnHandler
  2. Set class attributes: domain, tool
  3. Implement detect() và run()
  4. Gọi registry.register(MyWorker()) ở cuối file
"""
from __future__ import annotations

import shutil
import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)

# Các domain hợp lệ
DOMAINS = (
    "common",           # chạy trên tất cả targets
    "cms",              # CMS: WordPress, Joomla, Drupal, Magento
    "software",         # Platform: GitLab, Jenkins, Confluence, Grafana, Tomcat...
    "cloud",            # Cloud: AWS, GCP, Azure
    "discovery",        # Info disclosure: .git, .env, CORS, open redirect
    "network_service",  # Port-based: Redis, MySQL, MongoDB, SMB, FTP...
    "web_params",       # Param-based: SQLMap, Dalfox (cần FUZZ_PARAM trước)
)


class BaseVulnHandler(ABC):
    """
    Base class cho tất cả vulnerability scan handlers.
    Mỗi subclass = 1 tool cụ thể trong 1 domain.
    """

    # Override trong subclass
    domain: str = ""   # một trong DOMAINS
    tool:   str = ""   # tên binary/script: nuclei, wpscan, sqlmap, ...

    # Nguồn input mặc định — override nếu cần port scan hoặc fuzz_params
    input_source: str = "web_probes"  # "web_probes" | "ports" | "fuzz_params"

    # True nếu worker tự insert findings vào DB từng dòng (real-time streaming).
    # dispatch_worker sẽ bỏ qua batch insert cuối nếu cờ này bật.
    streams_to_db: bool = False

    @property
    def requires_binary(self) -> bool:
        """True nếu tool là binary trong PATH. False nếu là Python module."""
        return True

    def is_available(self) -> bool:
        """Check tool có sẵn không. Override nếu cần logic phức tạp hơn."""
        if self.requires_binary:
            return shutil.which(self.tool) is not None
        return True

    def handles_tool(self, tool_key: str) -> bool:
        """True nếu handler phụ trách tool_key được chọn từ UI (payload.tools).
        Mặc định khớp đúng self.tool; override nếu 1 worker phục vụ nhiều tool key
        (vd: FirebaseWorker phục vụ 'firebase' + các check 'firebase-*')."""
        return tool_key == self.tool

    @abstractmethod
    def detect(self, target: dict) -> bool:
        """
        Kiểm tra tool này có áp dụng cho target không.

        target là một dict từ DB với các keys tuỳ theo input_source:
          web_probes:  url, host, port, scheme, technologies[], web_server,
                       status_code, title, is_alive
          ports:       host, port, protocol, service_name, banner
          fuzz_params: url, method, params[]
        """
        ...

    @abstractmethod
    def run(
        self,
        target:       dict,
        job_id:       str,
        workspace_id: str,
        target_id:    Optional[str],
    ) -> list[dict]:
        """
        Chạy tool trên target.

        Trả về list findings, mỗi finding là dict:
        {
            "title":         str,            # bắt buộc
            "severity":      str,            # critical|high|medium|low|info
            "type":          str,            # vulnerability|misconfiguration|exposure|credential|informational
            "host":          str | None,
            "url":           str | None,
            "port":          int | None,
            "evidence":      str | None,     # PoC snippet, request/response
            "cve_id":        str | None,     # "CVE-2024-XXXX"
            "cvss_score":    float | None,
            "remediation":   str | None,
            "source_tool":   str,            # tự điền = self.tool
            "source_domain": str,            # tự điền = self.domain
        }
        """
        ...

    def _finding(self, **kwargs) -> dict:
        """Helper tạo finding với source_tool và source_domain tự điền."""
        return {
            "title":         "",
            "severity":      "info",
            "type":          "informational",
            "host":          None,
            "url":           None,
            "port":          None,
            "evidence":      None,
            "cve_id":        None,
            "cvss_score":    None,
            "remediation":   None,
            "source_tool":   self.tool,
            "source_domain": self.domain,
            **kwargs,
        }

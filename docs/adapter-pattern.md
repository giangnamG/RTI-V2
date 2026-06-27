# RTI - Adapter Pattern cho Pentest Modules

---

## Tổng quan và phân biệt Recon vs Pentest Adapter

```
┌─────────────────────────────────────────────────────────────────┐
│  RECON PIPELINE (chạy cho MỌI web target — không phân biệt)    │
│                                                                  │
│  httpx → nuclei (generic) → ffuf (common.txt) → nikto           │
│  Screenshot → JS analysis → Certificate scan → ...             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Phát hiện framework
                           ▼
              service_type = "wordpress" / "gitlab" / ...
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  FRAMEWORK PENTEST ADAPTER (chỉ chạy khi xác định được CMS/app) │
│                                                                  │
│  Đây là bộ phương pháp & kỹ thuật pentest CHUYÊN SÂU            │
│  cho từng framework — kết hợp:                                  │
│    • Tool chuyên biệt (wpscan, droopescan, ...)                 │
│    • Custom script tự viết (kiểm tra logic đặc thù)             │
│    • Kỹ thuật manual được tự động hoá                           │
│    • Các check không có tool nào cover                          │
└─────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc**: Adapter KHÔNG chạy lại nuclei/ffuf/nikto generic vì recon đã làm.
Adapter chỉ tập trung vào những gì **đặc thù và chuyên sâu** của framework đó.

---

## Class Hierarchy

```
BasePentestAdapter (abstract)
├── Web Adapters
│   ├── WordPressAdapter     ← XML-RPC abuse, REST API enum, wp-config leak, login brute
│   ├── GitLabAdapter        ← GraphQL unauth, runner token, CI/CD secrets, user enum
│   ├── LaravelAdapter       ← .env leak, debug mode, Ignition RCE, Telescope/Horizon
│   ├── JiraAdapter          ← SSRF via webhooks, user enum, attachment path traversal
│   ├── JenkinsAdapter       ← Script console RCE, credential dump, build artifact leak
│   ├── DrupalAdapter        ← Drupalgeddon, services endpoint, install.php exposure
│   ├── PhpMyAdminAdapter    ← Default creds, version-specific CVE, file read
│   └── GenericWebAdapter    ← Fallback khi không xác định được framework
└── Network Adapters
    ├── SMBAdapter           ← Null session, share enum, relay check, EternalBlue
    ├── FTPAdapter           ← Anonymous login, banner grab, writable dirs
    ├── RDPAdapter           ← BlueKeep, NLA check, brute force
    ├── MSSQLAdapter         ← xp_cmdshell, linked servers, default creds
    ├── MySQLAdapter         ← Default creds, file read (LOAD DATA), UDF exploit
    └── LDAPAdapter          ← Anonymous bind, domain info dump, AS-REP roasting
```

---

## Python Interface

### `base_adapter.py`

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

class Severity(str, Enum):
    INFO     = "info"
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"

@dataclass
class Finding:
    title:       str
    severity:    Severity
    description: str
    proof:       str = ""
    remediation: str = ""
    tags:        list[str] = field(default_factory=list)

@dataclass
class AdapterResult:
    success:      bool
    adapter_name: str
    findings:     list[Finding] = field(default_factory=list)
    raw_output:   dict[str, Any] = field(default_factory=dict)
    error:        str = ""

@dataclass
class ServiceContext:
    """Thông tin service được truyền vào adapter"""
    workspace_id: str
    host:         str
    port:         int
    service_type: str          # wordpress, gitlab, smb, ...
    service_name: str          # http, https, ftp, ...
    url:          str = ""     # full URL nếu là web
    technologies: list[str] = field(default_factory=list)
    headers:      dict = field(default_factory=dict)
    job_id:       str = ""


class BasePentestAdapter(ABC):
    """
    Bộ phương pháp pentest chuyên sâu cho 1 framework/service.
    Mỗi adapter tự chứa toàn bộ kỹ thuật đặc thù của framework đó:
      - Gọi tool chuyên biệt (wpscan, droopescan, ...)
      - Chạy custom script tự viết
      - Thực hiện các check không có tool nào cover
    """
    name: str = ""
    description: str = ""
    version: str = "1.0.0"

    def __init__(self, ctx: ServiceContext):
        self.ctx  = ctx
        self.http = self._build_http_client(ctx)   # requests.Session với proxy, timeout
        self.findings: list[Finding] = []

    @classmethod
    @abstractmethod
    def identify(cls, ctx: ServiceContext) -> bool:
        """Trả về True nếu adapter này phù hợp với service."""
        ...

    @abstractmethod
    def run(self) -> AdapterResult:
        """
        Chạy toàn bộ phương pháp pentest cho framework.
        Trả về AdapterResult chứa findings + raw output từng bước.
        """
        ...

    def add_finding(self, title: str, severity: Severity,
                    description: str, proof: str = "",
                    remediation: str = "", tags: list[str] = None):
        self.findings.append(Finding(
            title=title, severity=severity, description=description,
            proof=proof, remediation=remediation, tags=tags or []
        ))

    def _run_tool(self, cmd: list[str], timeout: int = 300) -> str:
        """Chạy tool ngoài và trả về stdout."""
        import subprocess
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout

    def _build_http_client(self, ctx: ServiceContext):
        import requests
        s = requests.Session()
        s.verify = False
        s.timeout = 15
        if ctx.proxy:
            s.proxies = {"http": ctx.proxy, "https": ctx.proxy}
        return s

BasePentestAdapter.__abstractmethods__  # noqa — alias
BaseAdapter = BasePentestAdapter
```

---

### `adapter_registry.py`

```python
from workers.pentest.adapters.base_adapter import BaseAdapter, ServiceContext
from workers.pentest.adapters.web.wordpress_adapter import WordPressAdapter
from workers.pentest.adapters.web.gitlab_adapter import GitLabAdapter
from workers.pentest.adapters.web.generic_web_adapter import GenericWebAdapter
from workers.pentest.adapters.network.smb_adapter import SMBAdapter
from workers.pentest.adapters.network.ftp_adapter import FTPAdapter

# Danh sách tất cả adapters - thứ tự quan trọng (specific trước, generic sau)
ADAPTER_REGISTRY: list[type[BaseAdapter]] = [
    # Web - specific
    WordPressAdapter,
    GitLabAdapter,
    # Network
    SMBAdapter,
    FTPAdapter,
    # Web - generic (luôn để cuối)
    GenericWebAdapter,
]

def get_adapter(ctx: ServiceContext) -> BaseAdapter | None:
    """
    Tự động chọn adapter phù hợp dựa trên ServiceContext.
    Trả về instance của adapter đầu tiên match.
    """
    for adapter_cls in ADAPTER_REGISTRY:
        if adapter_cls.identify(ctx):
            return adapter_cls(ctx)
    return None

def get_all_adapters(ctx: ServiceContext) -> list[BaseAdapter]:
    """Trả về tất cả adapters match (để chạy nhiều module song song)."""
    return [cls(ctx) for cls in ADAPTER_REGISTRY if cls.identify(ctx)]
```

---

### Ví dụ: `wordpress_adapter.py`

Adapter này thể hiện **toàn bộ phương pháp pentest WordPress** — kết hợp tool chuyên biệt
và custom script tự viết cho những kỹ thuật không có tool nào cover:

```python
import json, re
from workers.pentest.adapters.base_adapter import (
    BasePentestAdapter, AdapterResult, ServiceContext, Severity
)

class WordPressAdapter(BasePentestAdapter):
    name        = "wordpress"
    description = "Phương pháp pentest toàn diện cho WordPress"
    version     = "1.0.0"

    @classmethod
    def identify(cls, ctx: ServiceContext) -> bool:
        if ctx.service_type == "wordpress":
            return True
        return any("wordpress" in t.lower() for t in ctx.technologies)

    def run(self) -> AdapterResult:
        raw: dict = {}

        # --- 1. WPScan: enum plugin, theme, user, version CVE ---
        # Tool chuyên biệt — không có generic tool nào thay thế được
        raw["wpscan"] = self._run_wpscan()
        self._parse_wpscan(raw["wpscan"])

        # --- 2. XML-RPC abuse (kỹ thuật đặc thù WP) ---
        # Custom script — kiểm tra multicall brute force, pingback SSRF
        raw["xmlrpc"] = self._check_xmlrpc()

        # --- 3. User enumeration qua REST API ---
        # WP REST API /wp-json/wp/v2/users lộ username (ảnh hưởng brute force)
        raw["user_enum"] = self._enum_users_rest_api()

        # --- 4. File nhạy cảm đặc thù WP ---
        # wp-config.php backup, debug.log, readme.html, license.txt
        raw["sensitive_files"] = self._check_sensitive_files()

        # --- 5. wp-login.php: check lockout, check username valid ---
        raw["login_check"] = self._check_login_endpoint()

        # --- 6. Upload directory listing ---
        raw["uploads"] = self._check_uploads_listing()

        return AdapterResult(
            success=True,
            adapter_name=self.name,
            findings=self.findings,
            raw_output=raw,
        )

    # ----------------------------------------------------------------
    # Tool chuyên biệt
    # ----------------------------------------------------------------

    def _run_wpscan(self) -> dict:
        out = self._run_tool([
            "wpscan", "--url", self.ctx.url,
            "--format", "json",
            "--enumerate", "vp,vt,u,m",   # plugin, theme, user, media
            "--plugins-detection", "aggressive",
            "--no-update",
        ])
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            return {}

        for vuln in data.get("version", {}).get("vulnerabilities", []):
            self.add_finding(
                title=f"WP Core: {vuln.get('title')}",
                severity=self._cvss_to_severity(vuln.get("cvss", {}).get("score", 0)),
                description=vuln.get("description", ""),
                proof=f"Detected by wpscan on {self.ctx.url}",
                tags=["wordpress", "core", "cve"],
            )
        for name, info in data.get("plugins", {}).items():
            for vuln in info.get("vulnerabilities", []):
                self.add_finding(
                    title=f"Plugin {name}: {vuln.get('title')}",
                    severity=self._cvss_to_severity(vuln.get("cvss", {}).get("score", 0)),
                    description=vuln.get("description", ""),
                    tags=["wordpress", "plugin", "cve"],
                )
        return data

    # ----------------------------------------------------------------
    # Custom scripts — kỹ thuật đặc thù WordPress
    # ----------------------------------------------------------------

    def _check_xmlrpc(self) -> dict:
        """
        Kiểm tra XML-RPC có bật không và có thể dùng để:
        - Multicall brute force (1 request = nhiều lần thử password)
        - Pingback SSRF (gọi internal services)
        """
        url = self.ctx.url.rstrip("/") + "/xmlrpc.php"
        result = {"url": url, "enabled": False, "multicall": False, "pingback": False}

        try:
            r = self.http.get(url)
            if r.status_code == 405 or "XML-RPC server accepts POST requests only" in r.text:
                result["enabled"] = True

                # Thử system.listMethods
                payload = "<?xml version='1.0'?><methodCall><methodName>system.listMethods</methodName></methodCall>"
                r2 = self.http.post(url, data=payload, headers={"Content-Type": "text/xml"})
                if "wp.getUsersBlogs" in r2.text:
                    result["multicall"] = True
                    self.add_finding(
                        title="XML-RPC bật — có thể brute force qua multicall",
                        severity=Severity.MEDIUM,
                        description="XML-RPC cho phép system.multicall, attacker có thể thử hàng nghìn password trong 1 request.",
                        proof=f"POST {url} → system.listMethods trả về wp.getUsersBlogs",
                        remediation="Disable XML-RPC hoặc chặn /xmlrpc.php qua .htaccess / nginx",
                        tags=["wordpress", "xmlrpc", "brute-force"],
                    )
                if "pingback.ping" in r2.text:
                    result["pingback"] = True
                    self.add_finding(
                        title="XML-RPC Pingback SSRF",
                        severity=Severity.MEDIUM,
                        description="pingback.ping cho phép server gọi ra bất kỳ URL nào, có thể dùng để scan internal network.",
                        proof=f"POST {url} → system.listMethods trả về pingback.ping",
                        tags=["wordpress", "xmlrpc", "ssrf"],
                    )
        except Exception:
            pass
        return result

    def _enum_users_rest_api(self) -> dict:
        """
        WordPress REST API /wp-json/wp/v2/users lộ username và display name.
        Username lộ ra trực tiếp giúp attacker target brute force.
        """
        url = self.ctx.url.rstrip("/") + "/wp-json/wp/v2/users"
        result = {"url": url, "users": []}
        try:
            r = self.http.get(url)
            if r.status_code == 200:
                users = r.json()
                result["users"] = [{"id": u["id"], "slug": u["slug"], "name": u["name"]} for u in users]
                if users:
                    self.add_finding(
                        title=f"WordPress REST API lộ {len(users)} username",
                        severity=Severity.LOW,
                        description="Endpoint /wp-json/wp/v2/users công khai danh sách user không cần xác thực.",
                        proof=f"GET {url} → {[u['slug'] for u in users[:5]]}",
                        remediation="Thêm `remove_action('rest_api_init', 'wp_oembed_register_route');` hoặc dùng plugin để ẩn user endpoint",
                        tags=["wordpress", "user-enum", "information-disclosure"],
                    )
        except Exception:
            pass
        return result

    def _check_sensitive_files(self) -> dict:
        """
        Kiểm tra các file nhạy cảm đặc thù WordPress:
        wp-config.php backup, debug.log, readme.html (lộ version), license.txt
        """
        checks = [
            ("/wp-config.php.bak",   Severity.CRITICAL, "wp-config backup lộ database credentials"),
            ("/wp-config.php~",      Severity.CRITICAL, "wp-config backup lộ database credentials"),
            ("/.wp-config.php.swp",  Severity.CRITICAL, "vim swap file lộ wp-config"),
            ("/wp-content/debug.log",Severity.HIGH,     "Debug log lộ stack trace và thông tin nội bộ"),
            ("/readme.html",         Severity.INFO,     "Lộ phiên bản WordPress"),
            ("/license.txt",         Severity.INFO,     "Lộ phiên bản WordPress"),
            ("/wp-json/",            Severity.INFO,     "REST API bật, kiểm tra các endpoint nhạy cảm"),
        ]
        result = {}
        base = self.ctx.url.rstrip("/")
        for path, severity, desc in checks:
            try:
                r = self.http.get(base + path)
                if r.status_code in (200, 403):
                    result[path] = r.status_code
                    self.add_finding(
                        title=f"File nhạy cảm: {path} (HTTP {r.status_code})",
                        severity=severity,
                        description=desc,
                        proof=f"GET {base + path} → {r.status_code}",
                        tags=["wordpress", "sensitive-file", "information-disclosure"],
                    )
            except Exception:
                pass
        return result

    def _check_login_endpoint(self) -> dict:
        """
        Kiểm tra wp-login.php:
        - Có bị giới hạn không? (rate limit, lockout)
        - Có lộ thông tin username valid không?
        """
        url  = self.ctx.url.rstrip("/") + "/wp-login.php"
        result = {"url": url, "accessible": False, "username_oracle": False}
        try:
            r = self.http.get(url)
            result["accessible"] = r.status_code == 200
            # Thử POST với user giả — nếu lỗi khác nhau với user đúng là username oracle
            r2 = self.http.post(url, data={"log": "admin_fake_xyz", "pwd": "wrong", "wp-submit": "Log In"})
            result["username_oracle"] = "Invalid username" in r2.text
            if result["username_oracle"]:
                self.add_finding(
                    title="wp-login.php lộ username hợp lệ (Username Oracle)",
                    severity=Severity.LOW,
                    description='WP phân biệt "Invalid username" vs "incorrect password" giúp attacker xác nhận username tồn tại.',
                    proof=f"POST {url} → response chứa chuỗi phân biệt username/password",
                    tags=["wordpress", "login", "username-enum"],
                )
        except Exception:
            pass
        return result

    def _check_uploads_listing(self) -> dict:
        """Kiểm tra wp-content/uploads có bật directory listing không."""
        url = self.ctx.url.rstrip("/") + "/wp-content/uploads/"
        result = {"url": url, "listing_enabled": False}
        try:
            r = self.http.get(url)
            if r.status_code == 200 and ("Index of" in r.text or "<a href=" in r.text):
                result["listing_enabled"] = True
                self.add_finding(
                    title="Directory Listing bật trên wp-content/uploads/",
                    severity=Severity.MEDIUM,
                    description="Attacker có thể liệt kê và tải về toàn bộ file trong thư mục uploads.",
                    proof=f"GET {url} → HTTP 200 với directory listing",
                    remediation="Thêm `Options -Indexes` vào .htaccess hoặc cấu hình nginx deny autoindex",
                    tags=["wordpress", "directory-listing", "information-disclosure"],
                )
        except Exception:
            pass
        return result

    @staticmethod
    def _cvss_to_severity(score: float) -> Severity:
        if score >= 9.0: return Severity.CRITICAL
        if score >= 7.0: return Severity.HIGH
        if score >= 4.0: return Severity.MEDIUM
        if score > 0:    return Severity.LOW
        return Severity.INFO
```

---

## Cách thêm framework adapter mới

Ví dụ thêm `JiraAdapter`:

1. Tạo `workers/pentest/adapters/web/jira_adapter.py`
2. Kế thừa `BasePentestAdapter`, implement `identify()` và `run()`
3. Trong `run()`, viết từng kỹ thuật pentest đặc thù của Jira
4. Thêm vào `ADAPTER_REGISTRY`

```python
class JiraAdapter(BasePentestAdapter):
    name        = "jira"
    description = "Phương pháp pentest toàn diện cho Atlassian Jira"

    @classmethod
    def identify(cls, ctx: ServiceContext) -> bool:
        return ctx.service_type == "jira" or \
               any("jira" in t.lower() for t in ctx.technologies)

    def run(self) -> AdapterResult:
        raw = {}

        # Kỹ thuật 1: SSRF qua webhooks Jira
        raw["webhook_ssrf"] = self._check_webhook_ssrf()

        # Kỹ thuật 2: User enumeration qua API
        raw["user_enum"] = self._enum_users()

        # Kỹ thuật 3: Path traversal trên attachment
        raw["attachment_traversal"] = self._check_attachment_traversal()

        # Kỹ thuật 4: Chạy nuclei với Jira-specific templates
        raw["nuclei"] = self._run_tool([
            "nuclei", "-u", self.ctx.url,
            "-tags", "jira", "-json", "-silent"
        ])
        self._parse_nuclei_output(raw["nuclei"])

        return AdapterResult(success=True, adapter_name=self.name,
                             findings=self.findings, raw_output=raw)

    def _check_webhook_ssrf(self) -> dict:
        # ... custom script kiểm tra Jira webhook endpoint
        ...

    def _enum_users(self) -> dict:
        # GET /rest/api/2/user/picker?query=a — không cần auth trên một số version
        ...

    def _check_attachment_traversal(self) -> dict:
        # ... test path traversal trên Jira attachment download
        ...
```

**Nguyên tắc**: Mỗi method trong `run()` là 1 kỹ thuật pentest độc lập cho framework đó.
Không cần và không nên gọi lại nuclei/ffuf generic vì recon pipeline đã làm rồi —
trừ trường hợp nuclei có template **chuyên biệt** cho framework đó (Jira templates, WP templates, ...).

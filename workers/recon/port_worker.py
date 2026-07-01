import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db, concurrency

# naabu CHỈ chấp nhận -top-ports ∈ {100, 1000, full} (xem `naabu -h`).
# Giá trị khác (vd 500) → "invalid top ports option" → naabu exit 1 → CHẾT cả scan.
NAABU_TOP_PORTS = {"100", "1000", "full"}


def _naabu_top_ports(value: str) -> str:
    """Quy top-ports về giá trị naabu hợp lệ (làm tròn LÊN tier — superset), lạ → '100'."""
    v = (value or "").strip().lower()
    if v in NAABU_TOP_PORTS:
        return v
    if v.isdigit():
        n = int(v)
        return "100" if n <= 100 else "1000" if n <= 1000 else "full"
    return "100"

# Mapping port number → (service_name, service_category)
# Best-effort hint dựa trên well-known ports. User có thể override trực tiếp trên UI.
PORT_SERVICES: dict[int, tuple[str, str]] = {
    # ── Web services ──────────────────────────────────────
    80:    ("http",                 "web"),
    443:   ("https",                "web"),
    3000:  ("http-alt",             "web"),
    4000:  ("http-alt",             "web"),
    5000:  ("http-alt",             "web"),
    7000:  ("http-alt",             "web"),
    8000:  ("http-alt",             "web"),
    8008:  ("http-alt",             "web"),
    8080:  ("http-alt",             "web"),
    8081:  ("http-alt",             "web"),
    8082:  ("http-alt",             "web"),
    8090:  ("http-alt",             "web"),
    8443:  ("https-alt",            "web"),
    8888:  ("http-alt",             "web"),
    9000:  ("http-alt",             "web"),
    9080:  ("http-alt",             "web"),
    9090:  ("http-alt",             "web"),  # Prometheus UI
    9200:  ("elasticsearch",        "database"),
    9443:  ("https-alt",            "web"),
    15672: ("rabbitmq-management",  "web"),  # RabbitMQ management UI
    16686: ("http-alt",             "web"),  # Jaeger UI
    # ── Remote access ─────────────────────────────────────
    21:    ("ftp",                  "remote"),
    22:    ("ssh",                  "remote"),
    23:    ("telnet",               "remote"),
    69:    ("tftp",                 "remote"),
    111:   ("rpcbind",              "remote"),
    135:   ("msrpc",                "remote"),
    137:   ("netbios-ns",           "remote"),
    138:   ("netbios-dgm",          "remote"),
    139:   ("netbios-ssn",          "remote"),
    389:   ("ldap",                 "remote"),
    445:   ("smb",                  "remote"),
    512:   ("rsh",                  "remote"),
    513:   ("rlogin",               "remote"),
    514:   ("rsh",                  "remote"),
    636:   ("ldaps",                "remote"),
    873:   ("rsync",                "remote"),
    88:    ("kerberos",             "remote"),
    161:   ("snmp",                 "remote"),
    162:   ("snmptrap",             "remote"),
    179:   ("bgp",                  "remote"),
    500:   ("ike",                  "remote"),
    1080:  ("socks5",               "remote"),
    1701:  ("l2tp",                 "remote"),
    1723:  ("pptp",                 "remote"),
    2049:  ("nfs",                  "remote"),
    3268:  ("ldap",                 "remote"),  # Global Catalog LDAP
    3269:  ("ldaps",                "remote"),  # Global Catalog LDAPS
    3389:  ("rdp",                  "remote"),
    5900:  ("vnc",                  "remote"),
    5901:  ("vnc",                  "remote"),
    5902:  ("vnc",                  "remote"),
    5985:  ("winrm",                "remote"),
    5986:  ("winrm",                "remote"),
    6000:  ("x11",                  "remote"),
    6001:  ("x11",                  "remote"),
    53:    ("dns",                  "remote"),
    # ── Database ──────────────────────────────────────────
    1433:  ("mssql",                "database"),
    1434:  ("mssql",                "database"),  # MSSQL browser
    1521:  ("oracle",               "database"),
    1830:  ("oracle",               "database"),
    2181:  ("zookeeper",            "database"),
    2375:  ("docker",               "other"),
    2376:  ("docker",               "other"),
    2379:  ("etcd",                 "database"),
    2380:  ("etcd",                 "database"),
    3306:  ("mysql",                "database"),
    3307:  ("mysql",                "database"),
    4369:  ("rabbitmq",             "messaging"),  # Erlang port mapper
    5432:  ("postgresql",           "database"),
    5433:  ("postgresql",           "database"),
    5984:  ("couchdb",              "database"),
    5985:  ("winrm",                "remote"),
    6379:  ("redis",                "database"),
    6380:  ("redis",                "database"),
    7200:  ("janusgraph",           "database"),
    7474:  ("neo4j",                "database"),
    7687:  ("neo4j",                "database"),  # Neo4j Bolt
    8086:  ("influxdb",             "database"),
    8087:  ("influxdb",             "database"),
    8123:  ("clickhouse",           "database"),
    8529:  ("arangodb",             "database"),
    9042:  ("cassandra",            "database"),
    9092:  ("kafka",                "messaging"),
    9200:  ("elasticsearch",        "database"),
    9300:  ("elasticsearch",        "database"),
    9301:  ("elasticsearch",        "database"),
    10000: ("webmin",               "web"),
    11211: ("memcached",            "database"),
    16010: ("hbase",                "database"),
    19000: ("cassandra",            "database"),
    27017: ("mongodb",              "database"),
    27018: ("mongodb",              "database"),
    27019: ("mongodb",              "database"),
    28017: ("mongodb",              "database"),
    50070: ("hbase",                "database"),
    # ── Mail ──────────────────────────────────────────────
    25:    ("smtp",                 "mail"),
    110:   ("pop3",                 "mail"),
    143:   ("imap",                 "mail"),
    465:   ("smtps",                "mail"),
    587:   ("smtp",                 "mail"),
    993:   ("imaps",                "mail"),
    995:   ("pop3s",                "mail"),
    2525:  ("smtp",                 "mail"),
    # ── Messaging & Streaming ─────────────────────────────
    1883:  ("mqtt",                 "messaging"),
    4222:  ("nats",                 "messaging"),
    5672:  ("amqp",                 "messaging"),
    5671:  ("amqps",                "messaging"),
    6650:  ("pulsar",               "messaging"),
    8161:  ("activemq",             "messaging"),
    61613: ("stomp",                "messaging"),
    61616: ("activemq",             "messaging"),
}


class PortWorker(BaseJobHandler):
    """
    Xử lý job SCAN_PORT — quét open ports bằng naabu.

    Payload nhận vào:
        {
            "workspace_id": "...",
            "target_id":    "...",
            "domain":       "example.com",   // target domain chính (sẽ scan cùng với subdomains)
            "top_ports":    "100",           // "100" | "500" | "1000" | "full"
            "custom_ports": "80,443,8080"    // override top_ports nếu có
        }
    """

    def job_types(self) -> list[str]:
        return ["SCAN_PORT"]

    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        workspace_id = payload.get("workspace_id", "")
        target_id    = payload.get("target_id") or None
        target_ids   = payload.get("target_ids") or None
        raw_top      = str(payload.get("top_ports", "100"))
        top_ports    = _naabu_top_ports(raw_top)
        custom_ports = payload.get("custom_ports", "").strip()

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        if top_ports != raw_top and not custom_ports:
            self.logger.warning(
                f"top_ports={raw_top!r} không hợp lệ với naabu (chỉ 100/1000/full) → dùng {top_ports!r}"
            )

        if not shutil.which("naabu"):
            self.logger.warning("naabu không được cài đặt, bỏ qua")
            return {"total_hosts": 0, "open_ports": 0, "saved": 0, "targets": 0}

        # Multi-target: target_ids (nhiều) → target_id (một) → TẤT CẢ target active.
        targets = db.resolve_scan_targets(workspace_id, target_id, target_ids)
        if not targets:
            self.logger.warning(f"Không có target nào để scan port (workspace={workspace_id})")
            return {"total_hosts": 0, "open_ports": 0, "saved": 0, "targets": 0}

        self.logger.info(f"SCAN_PORT cho {len(targets)} target(s)")

        # Loop qua target SONG SONG (scan pool), mỗi target scan host của nó, lưu per-target.
        per = concurrency.run_tasks(
            targets,
            lambda t: self._scan_one_target(job_id, workspace_id, t, top_ports, custom_ports),
        )
        per = [r for r in per if r]

        total_hosts = sum(r["total_hosts"] for r in per)
        open_ports  = sum(r["open_ports"]  for r in per)
        alive_hosts = sum(r["alive_hosts"] for r in per)
        dead_hosts  = sum(r["dead_hosts"]  for r in per)
        saved       = sum(r["saved"]       for r in per)

        self.logger.info(
            f"SCAN_PORT xong — {len(targets)} target, {open_ports} open port trên "
            f"{total_hosts} host, lưu {saved}"
        )
        return {
            "total_hosts": total_hosts,
            "open_ports":  open_ports,
            "alive_hosts": alive_hosts,
            "dead_hosts":  dead_hosts,
            "saved":       saved,
            "targets":     len(targets),
        }

    def _scan_one_target(
        self, job_id: str, workspace_id: str, target: dict,
        top_ports: str, custom_ports: str,
    ) -> dict:
        """Port scan các host của 1 target (subdomains + chính target host) + lưu per-target."""
        tid         = target["id"]
        target_host = (target.get("host") or target.get("domain") or "").strip()
        target_port = target.get("port")

        # Host list = subdomains của target + chính target host.
        hosts: list[str] = db.get_subdomains_by_target(workspace_id, tid)
        if target_host and target_host not in hosts:
            hosts.insert(0, target_host)

        if not hosts:
            self.logger.warning(f"  [{target_host}] không có host nào để scan")
            return {"total_hosts": 0, "open_ports": 0, "alive_hosts": 0, "dead_hosts": 0, "saved": 0}

        # Port tường minh của target (vd :9999) LUÔN được quét kèm top-ports/custom.
        extra_ports = [target_port] if target_port else None
        ports_found = self._run_naabu(hosts, top_ports, custom_ports, extra_ports)

        alive_hosts = set(p["host"] for p in ports_found)

        # Gom tất cả IP của mỗi host (1 domain có thể có nhiều A record).
        host_ips: dict[str, list[str]] = {}
        for p in ports_found:
            ip = p.get("ip_address")
            if ip:
                host_ips.setdefault(p["host"], [])
                if ip not in host_ips[p["host"]]:
                    host_ips[p["host"]].append(ip)

        alive_count = sum(1 for h in hosts if h in alive_hosts)
        dead_count  = len(hosts) - alive_count

        observations = [
            {"domain": h, "is_alive": h in alive_hosts, "ip_addresses": host_ips.get(h, [])}
            for h in hosts
        ]
        db.insert_subdomain_observations(workspace_id, tid, job_id, observations)
        saved = db.insert_ports(workspace_id, tid, job_id, ports_found)

        self.logger.info(
            f"  [{target_host}] {len(ports_found)} open port / {len(hosts)} host "
            f"(alive {alive_count}), lưu {saved}"
        )
        return {
            "total_hosts": len(hosts),
            "open_ports":  len(ports_found),
            "alive_hosts": alive_count,
            "dead_hosts":  dead_count,
            "saved":       saved,
        }

    # ── Tool runners ─────────────────────────────────────────

    def _run_naabu(
        self,
        hosts: list[str],
        top_ports: str,
        custom_ports: str,
        extra_ports: list | None = None,
    ) -> list[dict]:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as hf:
            hf.write("\n".join(hosts))
            hosts_file = hf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        # Port tường minh của target (vd :9999) phải luôn được quét.
        extra = [str(p) for p in (extra_ports or []) if p]

        try:
            cmd = [
                "naabu",
                "-list",    hosts_file,
                "-json",
                "-o",       out_file,
                "-silent",
                "-rate",    "1000",
                "-c",       "50",
                "-timeout", "5",
                "-retries", "1",
            ]

            if custom_ports:
                # -p = custom ∪ extra (dedup, giữ thứ tự)
                ports = ",".join(dict.fromkeys(custom_ports.split(",") + extra))
                cmd += ["-p", ports]
            else:
                # naabu union được -top-ports với -p → giữ top-ports sweep + thêm port target
                cmd += ["-top-ports", top_ports]
                if extra:
                    cmd += ["-p", ",".join(dict.fromkeys(extra))]

            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)

            if proc.stderr:
                self.logger.debug(f"naabu stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"naabu exit {proc.returncode}")

            return self._parse_output(out_file)

        except subprocess.TimeoutExpired:
            self.logger.error("naabu timeout sau 1800s")
            return []
        except Exception as e:
            self.logger.error(f"naabu lỗi: {e}")
            return []
        finally:
            Path(hosts_file).unlink(missing_ok=True)
            Path(out_file).unlink(missing_ok=True)

    def _parse_output(self, filepath: str) -> list[dict]:
        """Parse naabu JSON output — mỗi dòng là một JSON object."""
        results = []
        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj   = json.loads(line)
                        host  = obj.get("host", "")
                        port  = obj.get("port", 0)
                        ip    = obj.get("ip") or None
                        proto = obj.get("protocol", "tcp")

                        if host and port:
                            svc = PORT_SERVICES.get(int(port))
                            results.append({
                                "host":             host,
                                "ip_address":       ip,
                                "port":             int(port),
                                "protocol":         proto,
                                "state":            "open",
                                "service_name":     svc[0] if svc else None,
                                "service_category": svc[1] if svc else None,
                            })
                    except (json.JSONDecodeError, ValueError):
                        pass
        except FileNotFoundError:
            pass
        return results

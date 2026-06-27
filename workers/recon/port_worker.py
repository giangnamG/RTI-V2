import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.base_handler import BaseJobHandler
from core import db

# Mapping port number → service name (well-known services)
PORT_SERVICES: dict[int, str] = {
    21: "ftp",      22: "ssh",       23: "telnet",   25: "smtp",
    53: "dns",      80: "http",      110: "pop3",    143: "imap",
    443: "https",   445: "smb",      465: "smtps",   587: "smtp",
    993: "imaps",   995: "pop3s",    1080: "socks5",
    1433: "mssql",  1521: "oracle",  3306: "mysql",
    3389: "rdp",    5432: "postgresql", 5900: "vnc",
    6379: "redis",  8080: "http-alt", 8443: "https-alt",
    8888: "http-alt", 9200: "elasticsearch", 9300: "elasticsearch",
    27017: "mongodb", 27018: "mongodb", 28017: "mongodb",
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
        target_id    = payload.get("target_id", "")
        domain       = payload.get("domain", "").strip()
        top_ports    = str(payload.get("top_ports", "100"))
        custom_ports = payload.get("custom_ports", "").strip()

        if not workspace_id:
            raise ValueError("payload.workspace_id bắt buộc")

        # Lấy danh sách subdomains từ DB
        hosts: list[str] = db.get_subdomains_by_target(workspace_id, target_id)

        # Thêm domain chính của target vào danh sách nếu chưa có
        if domain and domain not in hosts:
            hosts.insert(0, domain)

        if not hosts:
            self.logger.warning(f"Không có host nào để scan (target={target_id})")
            return {"total_hosts": 0, "open_ports": 0, "saved": 0}

        self.logger.info(
            f"Scan {len(hosts)} hosts, ports={custom_ports or f'top-{top_ports}'}"
        )

        ports_found: list[dict] = []

        if shutil.which("naabu"):
            ports_found = self._run_naabu(hosts, top_ports, custom_ports)
        else:
            self.logger.warning("naabu không được cài đặt, bỏ qua")

        # Xác định alive/dead: host có ít nhất 1 open port → alive
        alive_hosts = set(p["host"] for p in ports_found)

        # Thu thập TẤT CẢ IPs của mỗi host (1 domain có thể có nhiều A record)
        host_ips: dict[str, list[str]] = {}
        for p in ports_found:
            ip = p.get("ip_address")
            if ip:
                host = p["host"]
                if host not in host_ips:
                    host_ips[host] = []
                if ip not in host_ips[host]:
                    host_ips[host].append(ip)

        alive_count = sum(1 for h in hosts if h in alive_hosts)
        dead_count  = len(hosts) - alive_count

        # Ghi lịch sử alive/dead + tất cả IPs vào subdomains (append-only)
        observations = [
            {
                "domain":       host,
                "is_alive":     host in alive_hosts,
                "ip_addresses": host_ips.get(host, []),  # có thể nhiều IP
            }
            for host in hosts
        ]
        db.insert_subdomain_observations(workspace_id, target_id, job_id, observations)
        self.logger.info(f"Alive: {alive_count}, Dead: {dead_count}")

        # Lưu ports vào DB
        saved = db.insert_ports(workspace_id, target_id, job_id, ports_found)

        self.logger.info(
            f"Tìm thấy {len(ports_found)} open port trên {len(hosts)} hosts, lưu {saved}"
        )
        return {
            "total_hosts": len(hosts),
            "open_ports": len(ports_found),
            "alive_hosts": alive_count,
            "dead_hosts":  dead_count,
            "saved": saved,
        }

    # ── Tool runners ─────────────────────────────────────────

    def _run_naabu(self, hosts: list[str], top_ports: str, custom_ports: str) -> list[dict]:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as hf:
            hf.write("\n".join(hosts))
            hosts_file = hf.name

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as of:
            out_file = of.name

        try:
            cmd = [
                "naabu",
                "-list",    hosts_file,
                "-json",
                "-o",       out_file,
                "-silent",
                "-rate",    "1000",   # SYN scan khi có CAP_NET_RAW
                "-c",       "50",     # concurrent goroutines
                "-timeout", "5",      # giây/host
                "-retries", "1",
            ]

            if custom_ports:
                cmd += ["-p", custom_ports]
            else:
                cmd += ["-top-ports", top_ports]

            self.logger.info(f"Chạy: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30 phút

            if proc.stderr:
                self.logger.debug(f"naabu stderr: {proc.stderr[:500]}")
            if proc.returncode != 0:
                self.logger.warning(f"naabu exit {proc.returncode}")

            return self._parse_output(out_file)

        except subprocess.TimeoutExpired:
            self.logger.error("naabu timeout sau 600s")
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
                        # naabu JSON: {"host":"...", "ip":"...", "port":80, "protocol":"tcp"}
                        obj   = json.loads(line)
                        host  = obj.get("host", "")
                        port  = obj.get("port", 0)
                        ip    = obj.get("ip") or None
                        proto = obj.get("protocol", "tcp")

                        if host and port:
                            results.append({
                                "host":         host,
                                "ip_address":   ip,
                                "port":         int(port),
                                "protocol":     proto,
                                "state":        "open",
                                "service_name": PORT_SERVICES.get(int(port)),
                            })
                    except (json.JSONDecodeError, ValueError):
                        pass
        except FileNotFoundError:
            pass
        return results

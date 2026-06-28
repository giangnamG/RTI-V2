"""
VulnHandler Registry — danh sách tất cả handlers đã đăng ký.

Cách dùng:
  # Trong worker file:
  from vuln import registry
  registry.register(MyWorker())

  # Trong dispatcher:
  from vuln import registry
  handlers = registry.get_all()
  handlers = registry.get_by_domain("cms")
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from vuln.base import BaseVulnHandler

_REGISTRY: list["BaseVulnHandler"] = []


def register(handler: "BaseVulnHandler") -> "BaseVulnHandler":
    """Đăng ký một handler vào registry. Trả về handler để dùng như decorator."""
    _REGISTRY.append(handler)
    return handler


def get_all() -> list["BaseVulnHandler"]:
    return list(_REGISTRY)


def get_by_domain(domain: str) -> list["BaseVulnHandler"]:
    return [h for h in _REGISTRY if h.domain == domain]


def get_by_source(input_source: str) -> list["BaseVulnHandler"]:
    return [h for h in _REGISTRY if h.input_source == input_source]


def summary() -> dict:
    """Trả về summary registry cho logging."""
    from collections import defaultdict
    by_domain: dict[str, list[str]] = defaultdict(list)
    for h in _REGISTRY:
        by_domain[h.domain].append(h.tool)
    return dict(by_domain)

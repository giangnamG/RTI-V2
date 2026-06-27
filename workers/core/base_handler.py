import logging
from abc import ABC, abstractmethod


class BaseJobHandler(ABC):
    """
    Base class cho mọi job handler.
    Subclass cần implement: job_types() và handle().
    """

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def job_types(self) -> list[str]:
        """Danh sách job_type mà handler này xử lý."""

    @abstractmethod
    def handle(self, job_id: str, job_type: str, payload: dict) -> dict:
        """
        Xử lý job.
        Trả về dict result khi thành công.
        Raise exception khi thất bại.
        """

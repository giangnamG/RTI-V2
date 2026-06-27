import logging
import sys

from core import config
from core.dispatcher import Dispatcher
from recon.subdomain_worker import SubdomainWorker

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger("main")


def main():
    logger.info("RTI V2 Worker khởi động")

    dispatcher = Dispatcher()

    # Đăng ký handlers
    dispatcher.register(SubdomainWorker())

    logger.info("Tất cả handlers đã đăng ký:")
    dispatcher.run()


if __name__ == "__main__":
    main()

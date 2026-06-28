import logging
import sys

from core import config
from core.dispatcher import Dispatcher
from recon.subdomain_worker import SubdomainWorker
from recon.port_worker import PortWorker
from recon.web_probe_worker import WebProbeWorker
from recon.web_crawl_worker import WebCrawlWorker
from recon.endpoint_normalize_worker import EndpointNormalizeWorker
from fuzz.param_fuzz_worker import ParamFuzzWorker
from fuzz.dir_fuzz_worker import DirFuzzWorker

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
    dispatcher.register(PortWorker())
    dispatcher.register(WebProbeWorker())
    dispatcher.register(WebCrawlWorker())
    dispatcher.register(EndpointNormalizeWorker())
    dispatcher.register(ParamFuzzWorker())
    dispatcher.register(DirFuzzWorker())

    logger.info("Tất cả handlers đã đăng ký:")
    dispatcher.run()


if __name__ == "__main__":
    main()

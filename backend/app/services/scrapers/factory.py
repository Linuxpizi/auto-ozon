"""URL → platform detection and scraper dispatch."""

import re
from typing import List, Optional
from app.services.scrapers.base import PlatformScraper, ScrapedProduct

# Registry of all available scrapers (order matters — first match wins)
_REGISTRY: List[PlatformScraper] = []


def _register(scraper: PlatformScraper) -> None:
    _REGISTRY.append(scraper)


# ── Import platform scrapers to trigger registration ────────
from app.services.scrapers.ozon import OzonScraper       # noqa: E402, F401
from app.services.scrapers.scraper_1688 import Ali1688Scraper  # noqa: E402, F401
from app.services.scrapers.aliexpress import AliExpressScraper  # noqa: E402, F401

_register(OzonScraper())
_register(Ali1688Scraper())
_register(AliExpressScraper())


# ── Public API ──────────────────────────────────────────────

def detect_platform(url: str) -> Optional[PlatformScraper]:
    """Return the matching scraper for a URL, or None."""
    for scraper in _REGISTRY:
        if scraper.matches_url(url):
            return scraper
    return None


async def scrape_product(url: str) -> ScrapedProduct:
    """Detect platform from URL, scrape, and return normalised data.

    Raises ValueError if no scraper matches the URL.
    """
    scraper = detect_platform(url)
    if scraper is None:
        raise ValueError(f"Unsupported platform for URL: {url}")
    return await scraper.scrape(url)


def supported_platforms() -> list[dict]:
    """Return a list of supported platforms with their keys and names."""
    return [
        {"key": s.platform_key, "name": s.platform_name}
        for s in _REGISTRY
    ]

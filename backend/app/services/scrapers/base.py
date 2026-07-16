"""Base class and standardized data model for platform scrapers.

Every platform scraper extends PlatformScraper and returns a ScrapedProduct.
This ensures the frontend always receives the same data shape regardless
of which platform the product was scraped from.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List


@dataclass
class ScrapedProduct:
    """Standardized product data returned by all platform scrapers.

    This is the contract between scrapers and the frontend form.
    Regardless of source platform, the data is normalised into this shape.
    """
    platform: str                    # "ozon" | "1688" | "aliexpress" | …
    source_url: str                  # Original product URL
    source_id: str = ""              # Platform-specific ID (SKU, product_id, …)
    title: str = ""
    description: str = ""            # HTML or plain text
    images: List[str] = field(default_factory=list)
    price: str = ""                  # Original price (e.g. "¥120.00")
    currency: str = ""               # Original currency code
    brand: str = ""
    category: str = ""               # Platform category path
    weight: str = ""
    dimensions: str = ""             # "L x W x H"
    min_order_qty: str = ""          # For B2B platforms
    seller_name: str = ""
    seller_url: str = ""
    rating: str = ""                 # Average rating
    review_count: str = ""           # Number of reviews
    extra: dict = field(default_factory=dict)  # Platform-specific extras


class PlatformScraper(ABC):
    """Abstract base class for all platform scrapers."""

    @property
    @abstractmethod
    def platform_key(self) -> str:
        """Unique key for this platform, e.g. 'ozon', '1688', 'aliexpress'."""
        ...

    @property
    @abstractmethod
    def platform_name(self) -> str:
        """Human-readable platform name."""
        ...

    @abstractmethod
    def matches_url(self, url: str) -> bool:
        """Return True if this scraper can handle the given URL."""
        ...

    @abstractmethod
    async def scrape(self, url: str) -> ScrapedProduct:
        """Scrape the product page and return normalised data."""
        ...

"""Ozon product page scraper (ozon.ru).

Scrapes the public product page at ozon.ru to extract:
  title, images, price, attributes, description, etc.

Ozon has strong anti-bot protection. This scraper uses httpx with
browser-like headers and extracts data from JSON-LD or embedded
<script> tags.  If the page returns a captcha/403, the scraper
raises a clear error so the frontend can fall back to manual input.
"""

import json
import re
import logging
from typing import List, Optional
from urllib.parse import urlparse

import httpx

from app.services.scrapers.base import PlatformScraper, ScrapedProduct, ScrapedAttribute

logger = logging.getLogger(__name__)

# Realistic browser headers to reduce the chance of being blocked
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}


class OzonScraper(PlatformScraper):
    """Scrape ozon.ru product pages."""

    @property
    def platform_key(self) -> str:
        return "ozon"

    @property
    def platform_name(self) -> str:
        return "Ozon"

    def matches_url(self, url: str) -> bool:
        host = urlparse(url).hostname or ""
        return host in ("ozon.ru", "www.ozon.ru")

    # ── main entry ──────────────────────────────────────────

    async def scrape(self, url: str) -> ScrapedProduct:
        async with httpx.AsyncClient(
            headers=_HEADERS,
            timeout=20,
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)

        if resp.status_code == 403:
            raise ValueError(
                "Ozon blocked the request (anti-bot). "
                "Please enter product data manually or try again later."
            )
        if resp.status_code != 200:
            raise ValueError(f"Ozon returned HTTP {resp.status_code}")

        html = resp.text

        # ── Try extracting embedded JSON data ───────────────
        title = ""
        images: List[str] = []
        price = ""
        currency = "RUB"
        description = ""
        attributes: List[ScrapedAttribute] = []
        source_id = ""

        # 1) Look for __NEXT_DATA__ or similar JSON blob
        json_data = self._extract_json_data(html)
        if json_data:
            title = json_data.get("title", "")
            images = json_data.get("images", [])
            price = json_data.get("price", "")
            description = json_data.get("description", "")
            attributes = json_data.get("attributes", [])
            source_id = json_data.get("source_id", "")

        # 2) Fallback: JSON-LD
        if not title:
            ld = self._extract_json_ld(html)
            if ld:
                title = ld.get("name", "")
                desc = ld.get("description", "")
                if desc:
                    description = desc
                offers = ld.get("offers", {})
                if isinstance(offers, dict):
                    price = str(offers.get("price", ""))
                    currency = offers.get("priceCurrency", currency)
                imgs = ld.get("image", [])
                if isinstance(imgs, str):
                    imgs = [imgs]
                if imgs:
                    images = imgs

        # 3) Fallback: regex from meta tags
        if not title:
            m = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"', html)
            if m:
                title = m.group(1)
        if not images:
            m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]*)"', html)
            if m:
                images = [m.group(1)]
        if not price:
            m = re.search(r'"price"\s*:\s*"?(\d[\d.,]*)"?', html)
            if m:
                price = m.group(1)

        # 4) Extract product_id from URL if present
        if not source_id:
            m = re.search(r'/product/[^/]*-(\d+)', url)
            if m:
                source_id = m.group(1)

        # 5) Try extracting attributes from the HTML
        if not attributes:
            attributes = self._extract_attributes_from_html(html)

        if not title:
            raise ValueError(
                "Could not extract product data from the page. "
                "The page structure may have changed, or it may be blocked."
            )

        return ScrapedProduct(
            platform=self.platform_key,
            source_url=url,
            source_id=source_id,
            title=title,
            description=description,
            images=images,
            price=price,
            currency=currency,
            attributes=attributes,
        )

    # ── internal helpers ────────────────────────────────────

    def _extract_json_data(self, html: str) -> Optional[dict]:
        """Try to extract structured data from embedded JS state."""
        # Pattern: window.__NUXT__, window.__NEXT_DATA__, etc.
        patterns = [
            r'window\.__NEXT_DATA__\s*=\s*({.+?})\s*;?\s*</script>',
            r'window\.__NUXT__\s*=\s*({.+?})\s*;?\s*</script>',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.DOTALL)
            if m:
                try:
                    blob = json.loads(m.group(1))
                    return self._normalise_state(blob)
                except (json.JSONDecodeError, KeyError):
                    continue
        return None

    def _normalise_state(self, blob: dict) -> Optional[dict]:
        """Extract product info from various Ozon JS state shapes."""
        # Walk through common paths
        result = {}

        # Title
        for path in [
            ("props", "pageProps", "product", "name"),
            ("props", "initialState", "product", "name"),
        ]:
            val = blob
            for key in path:
                if isinstance(val, dict):
                    val = val.get(key)
                else:
                    val = None
                    break
            if val:
                result["title"] = str(val)
                break

        # Images
        for path in [
            ("props", "pageProps", "product", "images"),
            ("props", "initialState", "product", "images"),
        ]:
            val = blob
            for key in path:
                if isinstance(val, dict):
                    val = val.get(key)
                else:
                    val = None
                    break
            if val and isinstance(val, list):
                result["images"] = [
                    img if isinstance(img, str) else img.get("url", "")
                    for img in val
                    if img
                ]
                break

        return result or None

    def _extract_json_ld(self, html: str) -> Optional[dict]:
        """Extract Product JSON-LD structured data."""
        for m in re.finditer(
            r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
            html, re.DOTALL,
        ):
            try:
                data = json.loads(m.group(1))
                if isinstance(data, list):
                    for item in data:
                        if item.get("@type") == "Product":
                            return item
                elif isinstance(data, dict) and data.get("@type") == "Product":
                    return data
            except (json.JSONDecodeError, KeyError):
                continue
        return None

    def _extract_attributes_from_html(self, html: str) -> List[ScrapedAttribute]:
        """Try to scrape spec tables from the product page."""
        attrs = []
        # Ozon often uses <dl> or <tr> for specs
        for m in re.finditer(
            r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>',
            html, re.DOTALL,
        ):
            name = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            value = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if name and value:
                attrs.append(ScrapedAttribute(name=name, value=value))
        # Also try table rows
        for m in re.finditer(
            r'<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>',
            html, re.DOTALL,
        ):
            name = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            value = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if name and value and name != value:
                attrs.append(ScrapedAttribute(name=name, value=value))
        return attrs

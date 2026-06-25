"""AliExpress product page scraper.

Scrapes product detail pages on aliexpress.com to extract:
  title, images, price, attributes, etc.

AliExpress embeds product data in a JSON blob inside a <script> tag.
This scraper extracts that data and normalises it into ScrapedProduct.
"""

import json
import re
import logging
from typing import List, Optional
from urllib.parse import urlparse

import httpx

from app.services.scrapers.base import PlatformScraper, ScrapedProduct, ScrapedAttribute

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}


class AliExpressScraper(PlatformScraper):
    """Scrape AliExpress product pages."""

    @property
    def platform_key(self) -> str:
        return "aliexpress"

    @property
    def platform_name(self) -> str:
        return "AliExpress (速卖通)"

    def matches_url(self, url: str) -> bool:
        host = urlparse(url).hostname or ""
        return host in (
            "aliexpress.com", "www.aliexpress.com",
            "m.aliexpress.com",
        )

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
                "AliExpress blocked the request (anti-bot). "
                "Please enter product data manually."
            )
        if resp.status_code != 200:
            raise ValueError(f"AliExpress returned HTTP {resp.status_code}")

        html = resp.text

        title = ""
        images: List[str] = []
        price = ""
        currency = "USD"
        description = ""
        attributes: List[ScrapedAttribute] = []
        source_id = ""
        brand = ""

        # ── 1. Extract from window.runParams / __INIT_DATA__ ──
        run_data = self._extract_run_params(html)
        if run_data:
            parsed = self._parse_run_params(run_data)
            title = parsed.get("title", "")
            images = parsed.get("images", [])
            price = parsed.get("price", "")
            description = parsed.get("description", "")
            attributes = parsed.get("attributes", [])
            source_id = parsed.get("source_id", "")
            brand = parsed.get("brand", "")

        # ── 2. Fallback: meta tags ──────────────────────────
        if not title:
            m = re.search(
                r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"',
                html,
            )
            if m:
                title = m.group(1)

        if not images:
            m = re.search(
                r'<meta[^>]+property="og:image"[^>]+content="([^"]*)"',
                html,
            )
            if m:
                images = [m.group(1)]

        if not price:
            m = re.search(
                r'"formatedActivityPrice"\s*:\s*"([^"]*)"|"minPrice"\s*:\s*"([^"]*)"|"price"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]*)"',
                html,
            )
            if m:
                price = m.group(1) or m.group(2) or m.group(3) or ""

        # ── 3. Product ID from URL ──────────────────────────
        if not source_id:
            m = re.search(r'/item/(\d+)\.html', url)
            if not m:
                m = re.search(r'itemId=(\d+)', url)
            if m:
                source_id = m.group(1)

        # ── 4. JSON-LD ──────────────────────────────────────
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

        if not title:
            raise ValueError(
                "Could not extract product data from AliExpress page. "
                "The page may require login or may have changed structure."
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
            brand=brand,
        )

    # ── internal helpers ────────────────────────────────────

    def _extract_run_params(self, html: str) -> Optional[dict]:
        """Extract the window.runParams or __INIT_DATA__ JSON blob."""
        patterns = [
            r'window\.runParams\s*=\s*({.+?})\s*;?\s*</script>',
            r'window\.__INIT_DATA__\s*=\s*({.+?})\s*;?\s*</script>',
            r'"data"\s*:\s*({[^{}]*"productId"[^{}]*})',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group(1))
                except json.JSONDecodeError:
                    continue

        # Try to find a larger JSON blob containing product info
        m = re.search(
            r'var\s+data\s*=\s*({.+?})\s*;\s*</script>',
            html, re.DOTALL,
        )
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass

        return None

    def _parse_run_params(self, data: dict) -> dict:
        """Parse AliExpress runParams into normalised fields."""
        result = {}

        # Walk through common paths
        product = data
        for key in ("data", "productInfo", "detail", "item"):
            if isinstance(product, dict) and key in product:
                inner = product[key]
                if isinstance(inner, dict):
                    product = inner
                    break

        # Title
        for k in ("subject", "title", "productTitle"):
            if isinstance(product, dict) and k in product:
                result["title"] = str(product[k])
                break

        # Images
        for k in ("images", "imageList", "imageUrlList"):
            if isinstance(product, dict) and k in product:
                imgs = product[k]
                if isinstance(imgs, list):
                    result["images"] = [
                        img if isinstance(img, str)
                        else img.get("url", "") if isinstance(img, dict) else ""
                        for img in imgs
                    ]
                    result["images"] = [i for i in result["images"] if i]
                break

        # Price
        for k in ("prices", "price", "activityPrice"):
            if isinstance(product, dict) and k in product:
                p = product[k]
                if isinstance(p, str):
                    result["price"] = p
                elif isinstance(p, dict):
                    result["price"] = str(p.get("text", p.get("minPrice", "")))
                elif isinstance(p, list) and p:
                    first = p[0]
                    if isinstance(first, dict):
                        result["price"] = str(first.get("text", ""))
                break

        # Attributes
        for k in ("attributes", "skuProps", "props"):
            if isinstance(product, dict) and k in product:
                attrs_raw = product[k]
                if isinstance(attrs_raw, list):
                    attrs = []
                    for a in attrs_raw:
                        if isinstance(a, dict):
                            name = a.get("name") or a.get("attributeName") or ""
                            value = a.get("value") or a.get("attributeValue") or ""
                            if name and value:
                                if isinstance(value, list):
                                    value = ", ".join(str(v) for v in value)
                                attrs.append(ScrapedAttribute(name=str(name), value=str(value)))
                    result["attributes"] = attrs
                break

        # Product ID
        for k in ("productId", "itemId", "id"):
            if isinstance(product, dict) and k in product:
                result["source_id"] = str(product[k])
                break

        return result

    def _extract_json_ld(self, html: str) -> Optional[dict]:
        """Extract Product JSON-LD structured data."""
        for m in re.finditer(
            r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
            html, re.DOTALL,
        ):
            try:
                data = json.loads(m.group(1))
                if isinstance(data, dict) and data.get("@type") == "Product":
                    return data
            except (json.JSONDecodeError, KeyError):
                continue
        return None

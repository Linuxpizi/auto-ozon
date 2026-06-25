"""1688 (阿里巴巴中国站) product page scraper.

Scrapes product detail pages on 1688.com to extract:
  title, images, price, SKU attributes, MOQ, seller info, etc.

1688 uses heavy anti-bot + login walls.  This scraper:
  1. First tries to extract data from the embedded JSON state
     (window.__INIT_DATA__ / window.__data__).
  2. Falls back to HTML regex for meta tags and spec tables.
  3. Raises a clear error if the page is blocked so the frontend
     can offer manual input as a fallback.
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
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.1688.com/",
}


class Ali1688Scraper(PlatformScraper):
    """Scrape 1688.com product pages."""

    @property
    def platform_key(self) -> str:
        return "1688"

    @property
    def platform_name(self) -> str:
        return "1688 (阿里巴巴)"

    def matches_url(self, url: str) -> bool:
        host = urlparse(url).hostname or ""
        return host in (
            "1688.com", "www.1688.com",
            "detail.1688.com", "m.1688.com",
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
                "1688 blocked the request (anti-bot / login required). "
                "Please enter product data manually."
            )
        if resp.status_code != 200:
            raise ValueError(f"1688 returned HTTP {resp.status_code}")

        html = resp.text

        title = ""
        images: List[str] = []
        price = ""
        currency = "CNY"
        description = ""
        attributes: List[ScrapedAttribute] = []
        source_id = ""
        brand = ""
        min_order = ""
        seller_name = ""

        # ── 1. Embedded JSON state ──────────────────────────
        json_state = self._extract_json_state(html)
        if json_state:
            parsed = self._parse_json_state(json_state)
            title = parsed.get("title", "")
            images = parsed.get("images", [])
            price = parsed.get("price", "")
            description = parsed.get("description", "")
            attributes = parsed.get("attributes", [])
            source_id = parsed.get("source_id", "")
            brand = parsed.get("brand", "")
            min_order = parsed.get("min_order", "")
            seller_name = parsed.get("seller_name", "")

        # ── 2. Fallback: meta tags ──────────────────────────
        if not title:
            m = re.search(
                r'<meta[^>]+(?:name|property)="(?:og:title|title)"[^>]+content="([^"]*)"',
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
            # 1688 often has priceRange in data attributes
            m = re.search(
                r'data-price="([^"]+)"|"priceRange"\s*:\s*"([^"]+)"|"price"\s*:\s*"?(\d[\d.,]*)"?',
                html,
            )
            if m:
                price = m.group(1) or m.group(2) or m.group(3) or ""

        # ── 3. Extract product ID from URL ──────────────────
        if not source_id:
            m = re.search(r'/offer/(\d+)', url)
            if not m:
                m = re.search(r'offerId=(\d+)', url)
            if m:
                source_id = m.group(1)

        # ── 4. Attributes from spec table ───────────────────
        if not attributes:
            attributes = self._extract_spec_table(html)

        if not title:
            raise ValueError(
                "Could not extract product data from 1688 page. "
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
            min_order_qty=min_order,
            seller_name=seller_name,
        )

    # ── internal helpers ────────────────────────────────────

    def _extract_json_state(self, html: str) -> Optional[str]:
        """Extract the embedded JSON state blob from 1688 page."""
        patterns = [
            r'window\.__INIT_DATA__\s*=\s*({.+?})\s*;?\s*</script>',
            r'window\.__data__\s*=\s*({.+?})\s*;?\s*</script>',
            r'var\s+iDetailData\s*=\s*({.+?})\s*;?\s*</script>',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.DOTALL)
            if m:
                return m.group(1)
        return None

    def _parse_json_state(self, raw: str) -> dict:
        """Parse 1688's embedded JSON into our normalised fields."""
        result = {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return result

        # 1688 data can be nested in various ways
        # Try to find the offer/product object
        product = data
        for key in ("data", "offerDetail", "result", "content"):
            if isinstance(product, dict) and key in product:
                inner = product[key]
                if isinstance(inner, dict):
                    product = inner
                    break

        # Title
        for k in ("subject", "title", "offerTitle"):
            if isinstance(product, dict) and k in product:
                result["title"] = str(product[k])
                break

        # Images
        for k in ("images", "imageList", "imgList"):
            if isinstance(product, dict) and k in product:
                imgs = product[k]
                if isinstance(imgs, list):
                    result["images"] = []
                    for img in imgs:
                        if isinstance(img, str):
                            result["images"].append(img)
                        elif isinstance(img, dict):
                            url = img.get("url") or img.get("originalUrl") or ""
                            if url:
                                result["images"].append(url)
                break

        # Price
        for k in ("priceRange", "price"):
            if isinstance(product, dict) and k in product:
                p = product[k]
                if isinstance(p, str):
                    result["price"] = p
                elif isinstance(p, dict):
                    result["price"] = str(p.get("price", p.get("promotionPrice", "")))
                elif isinstance(p, list) and p:
                    first = p[0]
                    if isinstance(first, dict):
                        result["price"] = str(first.get("price", ""))
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
                                attrs.append(ScrapedAttribute(name=str(name), value=str(value)))
                    result["attributes"] = attrs
                break

        # Seller
        for k in ("seller", "company"):
            if isinstance(product, dict) and k in product:
                s = product[k]
                if isinstance(s, dict):
                    result["seller_name"] = s.get("name") or s.get("companyName") or ""
                break

        # MOQ
        for k in ("quantityBegin", "minOrderQuantity", "moq"):
            if isinstance(product, dict) and k in product:
                result["min_order"] = str(product[k])
                break

        # Product ID
        for k in ("offerId", "id", "productId"):
            if isinstance(product, dict) and k in product:
                result["source_id"] = str(product[k])
                break

        return result

    def _extract_spec_table(self, html: str) -> List[ScrapedAttribute]:
        """Extract attributes from 1688's spec table HTML."""
        attrs = []
        # Pattern: <div class="... attributeName">...</div> <div class="... attributeValue">...</div>
        for m in re.finditer(
            r'class="[^"]*attribute[Nn]ame[^"]*"[^>]*>(.*?)</div>\s*'
            r'class="[^"]*attribute[Vv]alue[^"]*"[^>]*>(.*?)</div>',
            html, re.DOTALL,
        ):
            name = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            value = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if name and value:
                attrs.append(ScrapedAttribute(name=name, value=value))
        return attrs

"""1688 (阿里巴巴中国站) product page scraper + search.

Scrapes product detail pages on 1688.com to extract:
  title, images, price, MOQ, seller info, etc.

Also supports searching 1688 for products by keyword.

1688 uses heavy anti-bot + login walls.  This scraper:
  1. First tries to extract data from the embedded JSON state
     (window.__INIT_DATA__ / window.__data__).
  2. Fallbacks to HTML regex for meta tags.
  3. Raises a clear error if the page is blocked so the frontend
     can offer manual input as a fallback.
"""

import json
import re
import logging
from dataclasses import asdict
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, quote_plus

import httpx

from app.services.scrapers.base import PlatformScraper, ScrapedProduct

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


async def search_1688(keyword: str, page: int = 1, page_size: int = 20) -> List[Dict[str, Any]]:
    """Search 1688.com by keyword and return a list of product summaries.

    Uses 1688's mobile API endpoint which is less restrictive than the
    desktop search.  Returns up to ``page_size`` items per page.
    """
    search_url = "https://m.1688.com/offer_search/-C6B7B2B5.html"
    params = {
        "keywords": keyword,
        "sortType": "booked",
        "descendOrder": "true",
        "beginPage": str(page),
        "asyncContent": "",
    }
    headers = {**_HEADERS, "Referer": "https://m.1688.com/"}
    results: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(search_url, params=params, headers=headers)
            resp.raise_for_status()
            html = resp.text

        # ── Method 1: extract from embedded JSON ──
        data = None
        for pattern in [
            r'window\.__INIT_DATA__\s*=\s*(\{.*?\});',
            r'window\.__data__\s*=\s*(\{.*?\});',
            r'"data"\s*:\s*(\{[^{}]*"offerList"[^{}]*\})',
        ]:
            m = re.search(pattern, html, re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(1))
                    break
                except (json.JSONDecodeError, ValueError):
                    continue

        if data:
            offer_list = None
            for key in ("offerList", "data", "resultData", "result"):
                if isinstance(data, dict):
                    if key in data:
                        offer_list = data[key]
                        break
                    # dig one level deeper
                    for sub_key, sub_val in data.items():
                        if isinstance(sub_val, dict) and key in sub_val:
                            offer_list = sub_val[key]
                            break
                        if isinstance(sub_val, list) and sub_val and isinstance(sub_val[0], dict):
                            offer_list = sub_val
                            break

            if isinstance(offer_list, list):
                for item in offer_list[:page_size]:
                    results.append(_parse_search_item(item))
                if results:
                    return results

        # ── Method 2: HTML regex fallback ──
        results = _parse_search_html(html, page_size)

    except httpx.HTTPStatusError as e:
        logger.warning("1688 search HTTP error %s: %s", e.response.status_code, e)
    except Exception as e:
        logger.warning("1688 search failed: %s", e)

    return results


def _parse_search_item(item: dict) -> Dict[str, Any]:
    """Parse a single search result item from JSON data."""
    title = ""
    for key in ("title", "subject", "offerTitle", "name"):
        if key in item and isinstance(item[key], str):
            title = re.sub(r'<[^>]+>', '', item[key]).strip()
            break

    image = ""
    for key in ("imageUrl", "image", "pic", "picUrl", "imgUrl"):
        if key in item and isinstance(item[key], str):
            image = item[key]
            if not image.startswith("http"):
                image = "https:" + image
            break

    price = ""
    for key in ("price", "priceRange", "priceStr"):
        if key in item:
            price = str(item[key])
            break

    offer_id = ""
    for key in ("id", "offerId", "itemId"):
        if key in item:
            offer_id = str(item[key])
            break

    url = ""
    for key in ("url", "detailUrl", "offerUrl", "href"):
        if key in item and isinstance(item[key], str):
            url = item[key]
            if not url.startswith("http"):
                url = "https:" + url
            break
    if not url and offer_id:
        url = f"https://detail.1688.com/offer/{offer_id}.html"

    seller = ""
    for key in ("sellerName", "companyName", "seller"):
        if key in item and isinstance(item[key], str):
            seller = item[key]
            break

    sales = 0
    for key in ("sales", "bookedNum", "monthSold"):
        if key in item:
            try:
                sales = int(item[key])
            except (ValueError, TypeError):
                pass
            break

    return {
        "title": title,
        "image": image,
        "price": price,
        "offer_id": offer_id,
        "url": url,
        "seller": seller,
        "sales": sales,
    }


def _parse_search_html(html: str, page_size: int = 20) -> List[Dict[str, Any]]:
    """Fallback: extract search results from HTML using regex."""
    results: List[Dict[str, Any]] = []

    # Try to find offer cards
    for m in re.finditer(
        r'(?:data-offer-id|offerId|offer_id)["\s:=]+["\']?(\d+)',
        html,
    ):
        offer_id = m.group(1)
        if any(r.get("offer_id") == offer_id for r in results):
            continue
        results.append({
            "title": "",
            "image": "",
            "price": "",
            "offer_id": offer_id,
            "url": f"https://detail.1688.com/offer/{offer_id}.html",
            "seller": "",
            "sales": 0,
        })
        if len(results) >= page_size:
            break

    # Try to enrich titles from nearby context
    for result in results:
        if result["offer_id"] and not result["title"]:
            pattern = rf'offer[_-]?[iI]d["\s:=]+["\']?{result["offer_id"]}[^<]*?(?:title|subject)["\s:=]+["\']([^"\']+)["\']'
            tm = re.search(pattern, html, re.IGNORECASE)
            if tm:
                result["title"] = tm.group(1).strip()

    return results


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

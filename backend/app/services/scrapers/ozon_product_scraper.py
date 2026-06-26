"""
Ozon Product Scraper - Scrapes product listings with full SKU attributes
using Ozon's internal entrypoint-api.bx API.

Usage:
    python -m backend.app.services.scrapers.ozon_product_scraper
    
Or import and call scrape_category(category_url, pages=3)
"""

import httpx
import json
import time
from typing import Optional


OZON_BASE = "https://www.ozon.ru"
ENTRYPOINT_API = "/api/entrypoint-api.bx/page/json/v2"

DEFAULT_HEADERS = {
    "accept": "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    "referer": "https://www.ozon.ru/",
}


def fetch_page_json(client: httpx.Client, page_url: str) -> dict:
    """Fetch Ozon entrypoint page JSON API for a given URL path."""
    r = client.get(
        f"{OZON_BASE}{ENTRYPOINT_API}",
        params={"url": page_url},
        headers=DEFAULT_HEADERS,
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()


def parse_tile_grid(tile_grid_data: dict) -> list[dict]:
    """Parse products from a tileGridDesktop widget data."""
    products = []
    for item in tile_grid_data.get("items", []):
        states = item.get("mainState", [])
        product = {"skuId": item.get("id", "")}
        
        for st in states:
            st_type = st.get("type", "")
            
            # Product name
            if st_type == "textDS" and st.get("textDS", {}).get("testInfo", {}).get("automatizationId") == "tile-name":
                product["name"] = st["textDS"].get("text", "")
            
            # Price
            if st_type == "priceV2" and st.get("priceV2"):
                prices = st["priceV2"].get("price", [])
                product["price"] = ""
                product["oldPrice"] = ""
                product["discount"] = st["priceV2"].get("discount", "")
                for p in prices:
                    if p.get("textStyle") == "PRICE":
                        product["price"] = p.get("text", "")
                    elif p.get("textStyle") == "ORIGINAL_PRICE":
                        product["oldPrice"] = p.get("text", "")
                if not product["price"] and prices:
                    product["price"] = prices[0].get("text", "")
            
            # Rating & reviews
            if st_type == "labelListV2" and st.get("labelListV2", {}).get("testInfo", {}).get("automatizationId") == "tile-list-rating":
                product["rating"] = ""
                product["reviews"] = ""
                for li in st["labelListV2"].get("items", []):
                    if li.get("type") == "text":
                        txt = li["text"]["text"]
                        import re
                        if re.match(r"^\d[\d.]*$", txt) and len(txt) < 6:
                            product["rating"] = txt
                        elif "отзыв" in txt:
                            product["reviews"] = txt
            
            # Stock
            if st_type == "textDS" and "остал" in st.get("textDS", {}).get("text", ""):
                product["stock"] = st["textDS"]["text"]
        
        # URL
        link = item.get("action", {}).get("link", "")
        product["url"] = f"{OZON_BASE}{link}" if link.startswith("/") else link
        
        products.append(product)
    
    return products


def parse_characteristics(chars_data: dict) -> list[dict]:
    """Parse product characteristics from webShortCharacteristics widget."""
    attributes = []
    for ch in chars_data.get("characteristics", []):
        title = ""
        for tr in ch.get("title", {}).get("textRs", []):
            if tr.get("type") == "text":
                title = tr.get("content", "")
                break
        
        value = ""
        for v in ch.get("values", []):
            if v.get("text"):
                value = v["text"]
                break
        
        if title:
            attributes.append({"name": title, "value": value})
    
    return attributes


def parse_brand(brand_data: dict) -> str:
    """Extract brand name from webBrand widget."""
    for t in brand_data.get("content", {}).get("title", {}).get("text", []):
        if t.get("type") == "link" and t.get("content"):
            return t["content"]
    return ""


def parse_sku_variants(sku_data: dict) -> list[dict]:
    """Parse SKU variants from skuGrid widget."""
    variants = []
    for item in sku_data.get("items", []):
        vid = item.get("id", "")
        name = ""
        for st in item.get("mainState", []):
            if st.get("type") == "textDS":
                name = st.get("textDS", {}).get("text", "")
                break
        if vid:
            variants.append({"skuId": vid, "name": name})
    return variants


def fetch_product_detail(client: httpx.Client, product_url: str) -> dict:
    """Fetch and parse product detail page for attributes, brand, SKU variants."""
    from urllib.parse import urlparse
    path = urlparse(product_url).path
    
    try:
        data = fetch_page_json(client, path)
    except Exception:
        return {}
    
    ws = data.get("widgetStates", {})
    detail = {}
    
    # Characteristics
    sc_key = next((k for k in ws if k.startswith("webShortCharacteristics")), None)
    if sc_key:
        sc = json.loads(ws[sc_key]) if isinstance(ws[sc_key], str) else ws[sc_key]
        detail["attributes"] = parse_characteristics(sc)
    
    # Brand
    brand_key = next((k for k in ws if k.startswith("webBrand")), None)
    if brand_key:
        bd = json.loads(ws[brand_key]) if isinstance(ws[brand_key], str) else ws[brand_key]
        detail["brand"] = parse_brand(bd)
    
    # SKU variants
    sku_key = next((k for k in ws if k.startswith("skuGrid")), None)
    if sku_key:
        sg = json.loads(ws[sku_key]) if isinstance(ws[sku_key], str) else ws[sku_key]
        detail["skuVariants"] = parse_sku_variants(sg)
    
    return detail


def scrape_category(category_url: str, pages: int = 3, fetch_details: bool = True) -> list[dict]:
    """
    Scrape products from an Ozon category page.
    
    Args:
        category_url: URL path like "/category/smartfony-15502/"
        pages: Number of pages to scrape (each has ~8 products)
        fetch_details: Whether to fetch detail attributes for each product
    
    Returns:
        List of product dicts with full attributes
    """
    all_products = []
    seen_ids = set()
    
    with httpx.Client() as client:
        for page_num in range(1, pages + 1):
            if page_num == 1:
                url = category_url
            else:
                url = f"{category_url}?layout_page_index={page_num}&page={page_num}"
            
            try:
                data = fetch_page_json(client, url)
            except Exception as e:
                print(f"  Failed to fetch page {page_num}: {e}")
                continue
            
            ws = data.get("widgetStates", {})
            
            # Find tileGridDesktop
            tg_key = next((k for k in ws if k.startswith("tileGridDesktop")), None)
            if not tg_key:
                print(f"  No tileGridDesktop found on page {page_num}")
                continue
            
            tg = json.loads(ws[tg_key]) if isinstance(ws[tg_key], str) else ws[tg_key]
            products = parse_tile_grid(tg)
            
            for p in products:
                if p["skuId"] in seen_ids:
                    continue
                seen_ids.add(p["skuId"])
                all_products.append(p)
            
            print(f"  Page {page_num}: found {len(products)} products (total: {len(all_products)})")
            time.sleep(0.5)
        
        # Fetch details for each product
        if fetch_details:
            for i, product in enumerate(all_products):
                if not product.get("url"):
                    continue
                try:
                    detail = fetch_product_detail(client, product["url"])
                    if detail:
                        product.update(detail)
                    print(f"  Detail {i+1}/{len(all_products)}: SKU {product['skuId']} - {len(detail.get('attributes', []))} attributes")
                except Exception as e:
                    print(f"  Detail {i+1}/{len(all_products)}: Error for SKU {product['skuId']}: {e}")
                time.sleep(0.3)
    
    return all_products


if __name__ == "__main__":
    print("=== Ozon Product Scraper ===")
    print("Scraping smartphones category...")
    
    products = scrape_category(
        category_url="/category/smartfony-15502/",
        pages=3,
        fetch_details=True,
    )
    
    output_file = "ozon_smartphones.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    print(f"\n=== Done ===")
    print(f"Total products: {len(products)}")
    print(f"Saved to: {output_file}")
    
    # Print summary
    for p in products[:3]:
        print(f"\n--- SKU: {p['skuId']} ---")
        print(f"  Name: {p.get('name', '')[:80]}")
        print(f"  Brand: {p.get('brand', '')}")
        print(f"  Price: {p.get('price', '')} (was {p.get('oldPrice', '')})")
        print(f"  Rating: {p.get('rating', '')} | Reviews: {p.get('reviews', '')}")
        attrs = p.get("attributes", [])
        if attrs:
            print(f"  Attributes ({len(attrs)}):")
            for a in attrs[:8]:
                print(f"    {a['name']}: {a['value']}")

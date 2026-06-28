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


def _extract_name_value(prop: dict) -> tuple:
    """Extract (name, value) from a single characteristic/property entry.
    Handles ALL known Ozon data structures."""
    import re as _re
    
    # ── Extract name ──
    name = ""
    # Path 1: title.textRs[].content
    title_obj = prop.get("title") or {}
    if isinstance(title_obj, dict):
        text_rs = title_obj.get("textRs") or title_obj.get("text") or []
        if isinstance(text_rs, list):
            for tr in text_rs:
                if isinstance(tr, dict) and tr.get("type") in ("text", "link") and tr.get("content"):
                    name = tr["content"]
                    break
    # Path 2: title is a string
    if not name and isinstance(prop.get("title"), str):
        name = prop["title"]
    # Path 3: direct name/label/propertyName fields
    if not name:
        name = prop.get("name") or prop.get("label") or prop.get("property") or prop.get("propertyName") or ""

    # ── Extract value ──
    value = ""
    # Path 1: values[].text
    values = prop.get("values") or []
    if isinstance(values, list):
        for v in values:
            if isinstance(v, dict):
                if v.get("text"):
                    value = v["text"]
                    break
                if v.get("content"):
                    value = v["content"]
                    break
    # Path 2: propertyValues[].value
    if not value:
        pvs = prop.get("propertyValues") or []
        if isinstance(pvs, list):
            for pv in pvs:
                if isinstance(pv, dict) and pv.get("value"):
                    value = pv["value"]
                    break
    # Path 3: direct value/text fields
    if not value:
        value = prop.get("value") or prop.get("text") or ""

    return str(name).strip(), str(value).strip()


def parse_characteristics(chars_data: dict) -> list[dict]:
    """Parse product characteristics from any Ozon characteristics widget.
    Handles ALL known structures:
      A: { characteristics: [{ title: { textRs }, values }] }
      B: { sections: [{ properties: [{ name, value, propertyValues }] }] }
      C: { characteristics: [{ groupName, properties }] }  (nested)
      D: { groups: [{ properties }] }
    """
    attributes = []
    seen = set()  # dedup by name

    def _add(name: str, value: str):
        if name and len(name) > 1 and name not in seen:
            seen.add(name)
            attributes.append({"name": name, "value": value})

    # ── Structure A: characteristics[] with title.textRs + values ──
    chars = chars_data.get("characteristics") or []
    if isinstance(chars, list):
        for ch in chars:
            if not ch or not isinstance(ch, dict):
                continue
            name, value = _extract_name_value(ch)
            if name:
                _add(name, value)
            # Nested properties inside a characteristic group
            for prop in ch.get("properties") or []:
                if isinstance(prop, dict):
                    pn, pv = _extract_name_value(prop)
                    if pn:
                        _add(pn, pv)

    # ── Structure B: sections[].properties[] ──
    sections = chars_data.get("sections") or []
    if isinstance(sections, list):
        for sec in sections:
            if not sec or not isinstance(sec, dict):
                continue
            props = sec.get("properties") or sec.get("items") or sec.get("rows") or []
            if isinstance(props, list):
                for prop in props:
                    if isinstance(prop, dict):
                        pn, pv = _extract_name_value(prop)
                        if pn:
                            _add(pn, pv)

    # ── Structure D: groups[].properties[] ──
    groups = chars_data.get("groups") or []
    if isinstance(groups, list):
        for grp in groups:
            if not grp or not isinstance(grp, dict):
                continue
            props = grp.get("properties") or grp.get("items") or []
            if isinstance(props, list):
                for prop in props:
                    if isinstance(prop, dict):
                        pn, pv = _extract_name_value(prop)
                        if pn:
                            _add(pn, pv)

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


def parse_images(images_data: dict) -> list[str]:
    """Parse image URLs from webGallery or similar widget."""
    urls = []
    for img in images_data.get("images", []):
        url = ""
        if isinstance(img, str):
            url = img
        elif isinstance(img, dict):
            url = img.get("big") or img.get("medium") or img.get("small") or img.get("url") or img.get("src") or ""
        if url:
            if url.startswith("//"):
                url = "https:" + url
            urls.append(url)
    return urls


def parse_description(desc_data: dict) -> str:
    """Parse description text from webDescription widget."""
    # Try multiple paths Ozon uses for description
    text = desc_data.get("text", "")
    if not text:
        text = desc_data.get("options", {}).get("text", "")
    if not text:
        text = desc_data.get("content", "")
    if not text:
        # Try nested items structure
        for item in desc_data.get("items", []):
            if isinstance(item, dict) and item.get("text"):
                text = item["text"]
                break
    return text[:2000] if text else ""


def parse_price_widget(price_data: dict) -> dict:
    """Parse price info from webPrice widget."""
    result = {"price": 0.0, "oldPrice": 0.0, "discount": ""}
    
    # Direct fields
    p = price_data.get("price", 0)
    op = price_data.get("oldPrice", 0) or price_data.get("basePrice", 0)
    
    if isinstance(p, str):
        import re
        p_clean = re.sub(r"[^\d.,]", "", p.replace(" ", "")).replace(",", ".")
        try:
            p = float(p_clean)
        except ValueError:
            p = 0.0
    
    if isinstance(op, str):
        import re
        op_clean = re.sub(r"[^\d.,]", "", op.replace(" ", "")).replace(",", ".")
        try:
            op = float(op_clean)
        except ValueError:
            op = 0.0
    
    if p > 0:
        result["price"] = p
    if op > 0:
        result["oldPrice"] = op
    
    # Discount badge
    disc = price_data.get("discount", "") or price_data.get("options", {}).get("discount", "")
    if disc:
        result["discount"] = str(disc)
    
    return result


def parse_rating_widget(rating_data: dict) -> dict:
    """Parse rating/reviews from webReviewProductScore widget."""
    result = {"rating": 0.0, "review_count": 0}
    
    ts = rating_data.get("totalScore") or rating_data.get("score")
    if ts:
        try:
            result["rating"] = float(str(ts).replace(",", "."))
        except (ValueError, TypeError):
            pass
    
    rc = rating_data.get("reviewsCount") or rating_data.get("reviewCount")
    if rc:
        try:
            result["review_count"] = int(str(rc).replace(" ", "").replace("\xa0", ""))
        except (ValueError, TypeError):
            pass
    
    return result


def parse_stock_widget(stock_data: dict) -> str:
    """Parse stock info from webStock or similar widget."""
    for field in ("text", "value", "stockText"):
        v = stock_data.get(field, "")
        if isinstance(v, str) and v:
            return v
    options = stock_data.get("options", {})
    for field in ("text", "value"):
        v = options.get(field, "")
        if isinstance(v, str) and v:
            return v
    return ""


def parse_phys_specs_from_attributes(attrs: list[dict]) -> dict:
    """Extract physical specs and identifiers from attribute list.
    Returns JSON-array fields: spec_list, sku_list (for DB storage)."""
    import re

    # Collect ALL weight/dimension/SKU/barcode entries (may be multiple per product)
    spec_entries = []   # [{weight_g, depth_mm, height_mm, width_mm, ...}]
    sku_entries = []    # [{sku, barcode}]
    video_urls = []     # ["url1", ...]

    # Temporary accumulator for a single spec group
    cur_spec = {}

    for a in attrs:
        name = (a.get("name") or "").lower().strip()
        val = a.get("value") or ""

        # Video URLs
        if any(k in name for k in ("видео", "video")):
            if val.startswith("http"):
                video_urls.append(val)

        # Weight
        weight_val = 0
        if any(k in name for k in ("вес", "масса", "weight")):
            m = re.search(r"([\d.,]+)\s*(г|грамм|g|kg|кг)", val, re.I)
            if m:
                num = float(m.group(1).replace(",", "."))
                if m.group(2).lower() in ("kg", "кг"):
                    num *= 1000
                weight_val = int(num)
                cur_spec["weight_g"] = weight_val

        # Combined dimensions
        dim_parsed = False
        if any(k in name for k in ("размер", "габарит", "dimension")):
            m = re.search(r"(\d[\d.,]*)\s*[x×\*]\s*(\d[\d.,]*)\s*[x×\*]\s*(\d[\d.,]*)\s*мм", val, re.I)
            if m:
                cur_spec["depth_mm"] = int(float(m.group(1).replace(",", ".")))
                cur_spec["width_mm"] = int(float(m.group(2).replace(",", ".")))
                cur_spec["height_mm"] = int(float(m.group(3).replace(",", ".")))
                dim_parsed = True

        if not dim_parsed:
            if any(k in name for k in ("глубина", "depth", "длина")):
                m = re.search(r"([\d.,]+)\s*мм", val, re.I)
                if m:
                    cur_spec["depth_mm"] = int(float(m.group(1).replace(",", ".")))
            if any(k in name for k in ("высота", "height")):
                m = re.search(r"([\d.,]+)\s*мм", val, re.I)
                if m:
                    cur_spec["height_mm"] = int(float(m.group(1).replace(",", ".")))
            if any(k in name for k in ("ширина", "width")):
                m = re.search(r"([\d.,]+)\s*мм", val, re.I)
                if m:
                    cur_spec["width_mm"] = int(float(m.group(1).replace(",", ".")))

        # Flush spec entry when we hit a non-spec attribute and have data
        if cur_spec and not any(k in name for k in ("вес", "масса", "weight", "размер", "габарит", "dimension", "глубина", "depth", "длина", "высота", "height", "ширина", "width")):
            spec_entries.append(cur_spec)
            cur_spec = {}

        # Barcode / EAN / GTIN
        if any(k in name for k in ("штрихкод", "barcode", "ean", "gtin")):
            code = re.sub(r"[^\d]", "", val)
            if len(code) >= 8:
                sku_entries.append({"sku": "", "barcode": code})

        # Supplier SKU
        if any(k in name for k in ("артикул продавца", "артикул", "supplier sku")):
            if 1 < len(val) < 64:
                sku_entries.append({"sku": val.strip(), "barcode": ""})

    # Flush remaining spec
    if cur_spec:
        spec_entries.append(cur_spec)

    return {
        "spec_list": spec_entries,
        "sku_list": sku_entries,
        "video_urls": video_urls,
    }


def fetch_product_detail(client: httpx.Client, product_url: str) -> dict:
    """Fetch and parse product detail page — extract maximum data from entrypoint-api.bx."""
    from urllib.parse import urlparse
    path = urlparse(product_url).path
    
    try:
        data = fetch_page_json(client, path)
    except Exception:
        return {}
    
    ws = data.get("widgetStates", {})
    detail = {}
    
    # ── Images: webGallery ──
    gallery_key = next((k for k in ws if k.startswith("webGallery")), None)
    if gallery_key:
        gd = json.loads(ws[gallery_key]) if isinstance(ws[gallery_key], str) else ws[gallery_key]
        imgs = parse_images(gd)
        if imgs:
            detail["images"] = imgs
    
    # ── Characteristics / Attributes: merge ALL characteristic widgets ──
    # Different categories use different widget names and structures
    all_attributes = []
    seen_chars_keys = set()
    for k in sorted(ws.keys()):
        kl = k.lower()
        if 'haract' in kl or 'roper' in kl or 'pecif' in kl or 'webfull' in kl:
            # Skip duplicates (e.g. webShortCharacteristics and webCharacteristics-123)
            base_key = k.split('-')[0] if '-' in k else k
            if base_key in seen_chars_keys:
                continue
            seen_chars_keys.add(base_key)
            try:
                cd = json.loads(ws[k]) if isinstance(ws[k], str) else ws[k]
                parsed = parse_characteristics(cd)
                all_attributes.extend(parsed)
            except Exception:
                pass
    
    if all_attributes:
        # Dedup by name, keeping first occurrence
        seen = set()
        deduped = []
        for a in all_attributes:
            if a["name"] not in seen:
                seen.add(a["name"])
                deduped.append(a)
        detail["attributes"] = deduped
    else:
        detail["attributes"] = []
    
    # ── Extract specs + identifiers from attributes → JSON arrays ──
    if detail.get("attributes"):
        specs = parse_phys_specs_from_attributes(detail["attributes"])
        if specs.get("spec_list"):
            detail["spec_list"] = specs["spec_list"]
        if specs.get("sku_list"):
            detail["sku_list"] = specs["sku_list"]
        if specs.get("video_urls"):
            detail["video_urls"] = specs["video_urls"]
    
    # ── Brand: webBrand ──
    brand_key = next((k for k in ws if k.startswith("webBrand")), None)
    if brand_key:
        bd = json.loads(ws[brand_key]) if isinstance(ws[brand_key], str) else ws[brand_key]
        detail["brand"] = parse_brand(bd)
    
    # ── Price: webPrice ──
    price_key = next((k for k in ws if k.startswith("webPrice") and "Decreased" not in k), None)
    if price_key:
        pd = json.loads(ws[price_key]) if isinstance(ws[price_key], str) else ws[price_key]
        price_info = parse_price_widget(pd)
        if price_info["price"] > 0:
            detail["price"] = price_info["price"]
        if price_info["oldPrice"] > 0:
            detail["oldPrice"] = price_info["oldPrice"]
        if price_info["discount"]:
            detail["discount"] = price_info["discount"]
    
    # ── Rating/Reviews: webReviewProductScore ──
    rating_key = next((k for k in ws if k.startswith("webReviewProductScore")), None)
    if rating_key:
        rd = json.loads(ws[rating_key]) if isinstance(ws[rating_key], str) else ws[rating_key]
        ri = parse_rating_widget(rd)
        if ri["rating"] > 0:
            detail["rating"] = ri["rating"]
        if ri["review_count"] > 0:
            detail["review_count"] = ri["review_count"]
    
    # ── Description: webDescription ──
    desc_key = next((k for k in ws if k.startswith("webDescription")), None)
    if desc_key:
        dd = json.loads(ws[desc_key]) if isinstance(ws[desc_key], str) else ws[desc_key]
        detail["description"] = parse_description(dd)
    
    # ── Stock: webStock ──
    stock_key = next((k for k in ws if k.startswith("webStock")), None)
    if stock_key:
        sd = json.loads(ws[stock_key]) if isinstance(ws[stock_key], str) else ws[stock_key]
        detail["stock"] = parse_stock_widget(sd)
    
    # ── SKU variants: skuGrid ──
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

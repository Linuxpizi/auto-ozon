"""
Re-scrape existing products to capture full attributes.
Usage: cd backend && python scripts/rescan_attributes.py

This uses the browser's entrypoint-api.bx endpoint to re-fetch
product data and re-parse ALL characteristics widgets.
"""
import json
import httpx
import sqlite3
import time

DB_PATH = "auto_ozon.db"

def get_all_products():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, title, source_url, source_id FROM scraped_products ORDER BY id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def fetch_and_parse(source_url: str) -> dict:
    """Fetch product page via entrypoint-api.bx and parse all widgets."""
    from urllib.parse import urlparse
    path = urlparse(source_url).path
    
    # Try both endpoints
    for base_url in [
        "https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2",
    ]:
        headers = {
            "accept": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
            "referer": "https://www.ozon.ru/",
            "x-requested-with": "XMLHttpRequest",
        }
        
        try:
            with httpx.Client(http2=True, timeout=30) as client:
                resp = client.get(base_url, params={"url": path}, headers=headers, follow_redirects=True)
                if resp.status_code != 200:
                    print(f"  HTTP {resp.status_code} from {base_url}")
                    continue
                
                data = resp.json()
                ws = data.get("widgetStates", {})
                if not ws:
                    print(f"  No widgetStates in response")
                    continue
                
                return ws
        except Exception as e:
            print(f"  Error: {e}")
    
    return {}

def parse_all_characteristics(ws: dict) -> list[dict]:
    """Extract ALL attributes from ALL characteristic-related widgets."""
    sys.path.insert(0, ".")
    from app.services.scrapers.ozon_product_scraper import parse_characteristics
    
    all_attrs = []
    seen = set()
    
    for k in sorted(ws.keys()):
        kl = k.lower()
        if 'haract' in kl or 'roper' in kl or 'pecif' in kl or 'webfull' in kl:
            try:
                cd = json.loads(ws[k]) if isinstance(ws[k], str) else ws[k]
                parsed = parse_characteristics(cd)
                for a in parsed:
                    if a["name"] not in seen:
                        seen.add(a["name"])
                        all_attrs.append(a)
            except:
                pass
    
    return all_attrs

def parse_physical_specs(attrs: list[dict]) -> dict:
    from app.services.scrapers.ozon_product_scraper import parse_phys_specs_from_attributes
    return parse_phys_specs_from_attributes(attrs)

def update_product(product_id: int, attributes: list, specs: dict):
    conn = sqlite3.connect(DB_PATH)
    
    # Update attributes
    attrs_json = json.dumps(attributes, ensure_ascii=False)
    conn.execute(
        "UPDATE scraped_products SET attributes = ? WHERE id = ?",
        (attrs_json, product_id),
    )
    
    # Update physical specs (only if non-zero)
    updates = []
    params = []
    for field in ("weight_g", "depth_mm", "height_mm", "width_mm", "barcode", "supplier_sku"):
        val = specs.get(field)
        if val:
            updates.append(f"{field} = ?")
            params.append(val)
    
    if updates:
        params.append(product_id)
        conn.execute(
            f"UPDATE scraped_products SET {', '.join(updates)} WHERE id = ?",
            params,
        )
    
    conn.commit()
    conn.close()


if __name__ == "__main__":
    import sys
    
    products = get_all_products()
    print(f"Found {len(products)} products in database\n")
    
    for p in products:
        pid = p["id"]
        url = p["source_url"]
        title = p["title"][:50]
        print(f"#{pid}: {title}")
        print(f"  URL: {url}")
        
        ws = fetch_and_parse(url)
        if not ws:
            print(f"  FAILED: Could not fetch page data\n")
            continue
        
        char_keys = [k for k in ws.keys() if 'haract' in k.lower() or 'roper' in k.lower()]
        print(f"  Widget keys: {len(ws)} | Characteristic keys: {char_keys}")
        
        attrs = parse_all_characteristics(ws)
        specs = parse_physical_specs(attrs)
        
        print(f"  Attributes: {len(attrs)}")
        for a in attrs[:15]:
            print(f"    {a['name']}: {a['value'][:60]}")
        if len(attrs) > 15:
            print(f"    ... and {len(attrs) - 15} more")
        
        non_zero_specs = {k: v for k, v in specs.items() if v}
        if non_zero_specs:
            print(f"  Physical specs: {non_zero_specs}")
        
        # Update database
        update_product(pid, attrs, specs)
        print(f"  UPDATED in database")
        print()
        
        time.sleep(1)  # Rate limit
    
    print("Done!")

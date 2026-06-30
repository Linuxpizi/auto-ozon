from typing import Optional, List, Any
from datetime import datetime, timezone
import re
from pydantic import BaseModel, model_validator


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<=[a-z0-9])([A-Z])', r'_\1', name).lower()


class ScrapedProductBase(BaseModel):
    platform: str
    source_id: str
    title: str = ""
    price: float = 0.0
    old_price: float = 0.0
    images: List[str] = []
    rating: float = 0.0
    review_count: int = 0
    brand: str = ""
    category: str = ""
    discount: str = ""
    stock: str = ""
    seller_name: str = ""
    seller_url: str = ""
    attributes: List[dict] = []
    description: str = ""
    source_url: str = ""
    scraped_at: Optional[datetime] = None

    # ── 多值字段 (JSON arrays) ──
    video_urls: List[str] = []
    sku_list: List[dict] = []          # [{"sku": "...", "barcode": "..."}]
    spec_list: List[dict] = []         # [{"weight_g": 0, "depth_mm": 0, "height_mm": 0, "width_mm": 0, "color": "...", "size": "..."}]

    # ── Ozon 内部分类 ──
    ozon_category_id: int = 0
    ozon_type_id: int = 0

    # ── 1688 专用字段 ──
    price_ranges: List[dict] = []       # [{"minQty": 1, "maxQty": 49, "price": 12.5}]
    min_order_qty: int = 0
    supplier_url: str = ""
    trade_quantity: int = 0

    @model_validator(mode='before')
    @classmethod
    def convert_input(cls, data):
        """浏览器插件发送 camelCase + scraped_at 字符串,统一转换"""
        if not isinstance(data, dict):
            return data
        result = {_camel_to_snake(k): v for k, v in data.items()}

        # ── Backward compat: convert old single-value fields → new JSON arrays ──
        # video_url → video_urls
        if "video_url" in result and "video_urls" not in result:
            vu = result.pop("video_url", "")
            result["video_urls"] = [vu] if vu else []
        # supplier_sku + barcode → sku_list
        if ("supplier_sku" in result or "barcode" in result) and "sku_list" not in result:
            sku = result.pop("supplier_sku", "")
            bc = result.pop("barcode", "")
            if sku or bc:
                result["sku_list"] = [{"sku": sku or "", "barcode": bc or ""}]
            else:
                result.pop("supplier_sku", None)
                result.pop("barcode", None)
                result.setdefault("sku_list", [])
        # weight_g + dims → spec_list
        has_dims = any(result.pop(f, 0) for f in ("weight_g", "depth_mm", "height_mm", "width_mm"))
        if has_dims and "spec_list" not in result:
            result["spec_list"] = [{
                "weight_g": result.pop("weight_g", 0),
                "depth_mm": result.pop("depth_mm", 0),
                "height_mm": result.pop("height_mm", 0),
                "width_mm": result.pop("width_mm", 0),
            }]
        else:
            for f in ("weight_g", "depth_mm", "height_mm", "width_mm"):
                result.pop(f, None)
            result.setdefault("spec_list", [])

        # scraped_at 字符串 → datetime
        sa = result.get('scraped_at')
        if isinstance(sa, str):
            try:
                result['scraped_at'] = datetime.fromisoformat(sa.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                result['scraped_at'] = datetime.now(timezone.utc)
        return result


class ScrapedProductCreate(ScrapedProductBase):
    pass


class ScrapedProductRead(ScrapedProductBase):
    id: int
    synced: bool = True
    matched: bool = False
    matched_suppliers: List[Any] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SyncProductsRequest(BaseModel):
    """浏览器插件批量同步请求"""
    products: List[ScrapedProductCreate]

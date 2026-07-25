from typing import Optional, List, Any
from datetime import datetime, timezone
import json
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<=[a-z0-9])([A-Z])', r'_\1', name).lower()


class ScrapedProductBase(BaseModel):
    platform: str
    source_id: str
    title: str = ""
    price: float = 0.0
    old_price: float = 0.0
    currency: str = ""  # CNY/RUB/USD — 由调用方按平台设置
    images: List[str] = []
    rating: float = 0.0
    review_count: int = 0
    brand: str = ""
    category: str = ""
    discount: str = ""
    stock: str = ""
    seller_name: str = ""
    seller_url: str = ""
    description: str = ""
    source_url: str = ""
    scraped_at: Optional[datetime] = None

    # ── Ozon 商品级采集元数据 ──
    record_name: str = ""
    selected_sku: str = ""
    title_ru: str = ""
    description_ru: str = ""
    variant_attr_ids: List[int] = []
    collection_status: str = ""
    ozon_category_path_id: int = 0

    # ── 多值字段 (JSON arrays) ──
    video_urls: List[str] = []
    sku_list: List[dict] = []          # [{"sku": "...", "barcode": "..."}]
    variants: List[dict] = []          # [{"sku": "...", "values": [{"name": "颜色", "value": "黑色"}]}]
    spec_list: List[dict] = []         # [{"weight_g": 0, "depth_mm": 0, "height_mm": 0, "width_mm": 0, "color": "...", "size": "..."}]
    facts: List[dict] = []              # [{"name": "...", "value": "...", "sourcePath": "BCS card"}]
    tags: List[str] = []                # 平台事实特征自动采集；允许用户在选品页修正
    color_list: List[str] = []
    package_facts: dict = {}             # 当前选中 SKU 的包装物理事实与字段级来源
    ozon_attribute_facts: List[dict] = []  # 显式 Ozon 属性 ID、值、作用域与来源

    # ── Ozon 内部分类 ──
    ozon_category_id: int = 0
    ozon_type_id: int = 0
    ozon_metrics: dict = {}

    # ── Ozon 物流事实 ──
    warehouse: str = ""
    warehouse_id: str = ""
    logistics_type: str = ""
    delivery_method: str = ""
    delivery_region: str = ""
    delivery_days: int = 0

    # ── 1688 专用字段 ──
    price_ranges: List[dict] = []       # [{"minQty": 1, "maxQty": 49, "price": 12.5}]
    min_order_qty: int = 0
    supplier_url: str = ""
    trade_quantity: int = 0

    @field_validator(
        "images", "video_urls", "sku_list", "variants", "spec_list", "facts", "tags",
        "color_list", "variant_attr_ids", "price_ranges", "ozon_attribute_facts", mode="before",
    )
    @classmethod
    def normalize_list_fields(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except Exception:
                return []
            return parsed if isinstance(parsed, list) else []
        return value

    @field_validator("ozon_metrics", "package_facts", mode="before")
    @classmethod
    def normalize_dict_fields(cls, value):
        if value is None or value == "":
            return {}
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except Exception:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return value

    @model_validator(mode='before')
    @classmethod
    def convert_input(cls, data):
        """浏览器插件发送 camelCase + scraped_at 字符串,统一转换"""
        if not isinstance(data, dict):
            return data
        result = {_camel_to_snake(k): v for k, v in data.items()}

        # Ozon 扩展契约中的 categoryId 是分类路径节点 ID，
        # descriptionCategoryId 是用于上架的描述分类 ID；两者在采集记录中
        # 分别持久化到不同的 ozon_* 字段。先在输入边界完成映射，避免
        # Pydantic 因 schema 未声明 category_id 这两个临时名称而静默丢字段。
        if "category_id" in result and "ozon_category_path_id" not in result:
            result["ozon_category_path_id"] = result["category_id"]
        if "description_category_id" in result and "ozon_category_id" not in result:
            result["ozon_category_id"] = result["description_category_id"]
        if "type_id" in result and "ozon_type_id" not in result:
            result["ozon_type_id"] = result["type_id"]

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
        # 注意：先集中 pop 保存值，避免 any(result.pop(...)) 把真实值消费掉后又变成 0。
        dims = {f: result.pop(f, 0) for f in ("weight_g", "depth_mm", "height_mm", "width_mm")}
        if any(dims.values()) and "spec_list" not in result:
            result["spec_list"] = [dims]
        else:
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
    # ── Ozon 上架相关 ──
    ozon_category_id: int = 0
    ozon_type_id: int = 0
    ozon_product_id: int = 0
    upload_status: str = "not_uploaded"
    upload_task_id: str = ""
    offer_id: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator("matched_suppliers", mode="before")
    @classmethod
    def normalize_matched_suppliers(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except Exception:
                return []
            return parsed if isinstance(parsed, list) else []
        return value

    model_config = ConfigDict(from_attributes=True)


class SyncProductsRequest(BaseModel):
    """浏览器插件批量同步请求"""
    products: List[ScrapedProductCreate]


class OzonListProductCreate(BaseModel):
    """Ozon 列表卡片事实；有意不包含 PDP sku_list/variants。"""
    sku: str = Field(min_length=1, max_length=80)
    title: str = ""
    image_url: str = ""
    product_url: str = ""
    price: str = ""
    original_price: str = ""
    discount: str = ""
    promo_joined: str = ""
    promo_name: str = ""
    promo_stock: str = ""
    rating: str = ""
    review_count: str = ""
    points_review: str = ""
    brand_cert: str = ""
    scraped_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def convert_camel_case(cls, data):
        if not isinstance(data, dict):
            return data
        return {_camel_to_snake(key): value for key, value in data.items()}

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit():
            raise ValueError("Ozon SKU 必须为数字")
        return value


class OzonListProductsRequest(BaseModel):
    products: List[OzonListProductCreate] = Field(min_length=1, max_length=200)


class OzonListSyncResponse(BaseModel):
    created: int
    updated: int
    skipped: int

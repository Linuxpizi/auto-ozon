from datetime import datetime
from typing import Any, Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ── 基础 ──────────────────────────────────────────────────────

class UploadDraftBase(BaseModel):
    store_id: int
    source_type: str = "scraped"
    source_product_id: int = 0
    source_sku: str = ""
    source_name: str = ""
    source_url: str = ""
    description_category_id: int = 0
    type_id: int = 0
    category_name: str = ""
    offer_id: str = ""
    barcode: str = ""
    name: str = ""
    description: str = ""
    price_cny: float = 0.0
    price_rub: float = 0.0
    old_price_rub: float = 0.0
    vat: str = "0"
    weight: Optional[int] = None
    height: Optional[int] = None
    depth: Optional[int] = None
    width: Optional[int] = None
    primary_image: str = ""
    ozonbox_tags: Optional[str] = None


# ── 创建 ──────────────────────────────────────────────────────

class CreateDraftRequest(BaseModel):
    """从采集商品创建单个上架草稿"""
    store_id: int
    source_product_id: int
    source_sku: str = ""
    description_category_id: int = 0
    type_id: int = 0
    category_name: str = ""
    offer_id: str = ""
    name: str = ""
    price_rub: float = 0.0
    old_price_rub: float = 0.0


class BatchCreateDraftRequest(BaseModel):
    """批量从采集商品创建上架草稿"""
    store_id: int
    source_product_ids: List[int]
    description_category_id: int = 0
    type_id: int = 0
    offer_id_prefix: str = ""
    price_rub: float = 0.0
    old_price_rub: float = 0.0
    markup_pct: float = 0.0
    exchange_rate: float = 0.0


# ── 更新 ──────────────────────────────────────────────────────

class UpdateDraftRequest(BaseModel):
    """更新草稿字段（仅传需要修改的字段）"""
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    offer_id: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price_cny: Optional[float] = None
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    vat: Optional[str] = None
    weight: Optional[int] = None
    height: Optional[int] = None
    depth: Optional[int] = None
    width: Optional[int] = None
    package_override_reason: Optional[str] = None
    primary_image: Optional[str] = None
    images: Optional[List[str]] = None
    ozonbox_tags: Optional[str] = None


# ── 提交 ──────────────────────────────────────────────────────

class SubmitDraftRequest(BaseModel):
    """提交单个草稿到 Ozon"""
    pass  # 所有数据已在 draft 中


class BatchSubmitRequest(BaseModel):
    """批量提交草稿到 Ozon"""
    draft_ids: List[int]


# ── 响应 ──────────────────────────────────────────────────────

class UploadDraftRead(UploadDraftBase):
    id: int
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    offer_id: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price_cny: Optional[float] = None
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    vat: Optional[str] = None
    primary_image: Optional[str] = None
    source_images: list = Field(default_factory=list)
    images: Optional[list] = None
    selected_sku_snapshot: Optional[dict[str, Any]] = None
    package_facts: Optional[dict[str, Any]] = None
    package_override_audit: Optional[dict[str, Any]] = None
    ozon_attribute_facts: Optional[list[dict[str, Any]]] = None
    video_urls: Optional[list[str]] = None
    text_facts: Optional[list[dict[str, Any]]] = None
    ozon_metrics: Optional[dict[str, Any]] = None
    readiness_errors: Optional[list[str]] = None
    status: str = "draft"
    error_message: str = ""
    ozon_task_id: int = 0
    ozon_product_id: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SubmitResult(BaseModel):
    draft_id: int
    success: bool
    task_id: int = 0
    error: str = ""


class BatchSubmitResponse(BaseModel):
    total: int
    submitted: int
    failed: int
    results: List[SubmitResult]

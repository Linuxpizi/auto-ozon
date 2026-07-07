from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


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
    name: str = ""
    description: str = ""
    price_cny: float = 0.0
    price_rub: float = 0.0
    old_price_rub: float = 0.0
    vat: str = "0"
    weight: int = 500
    height: int = 100
    depth: int = 100
    width: int = 100
    primary_image: str = ""
    attributes: list = []


# ── 创建 ──────────────────────────────────────────────────────

class CreateDraftRequest(BaseModel):
    """从采集商品创建单个上架草稿"""
    store_id: int
    source_product_id: int
    description_category_id: int = 0
    type_id: int = 0
    offer_id: str = ""
    name: str = ""
    price_rub: float = 0.0
    old_price_rub: float = 0.0
    attributes: list = []


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
    attributes: list = []


# ── 更新 ──────────────────────────────────────────────────────

class UpdateDraftRequest(BaseModel):
    """更新草稿字段（仅传需要修改的字段）"""
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    offer_id: Optional[str] = None
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
    primary_image: Optional[str] = None
    images: Optional[List[str]] = None
    attributes: Optional[list] = None


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
    source_images: list = []
    images: list = []
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

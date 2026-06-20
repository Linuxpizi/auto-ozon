from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ListingBase(BaseModel):
    store_id: int
    store_name: str
    offer_id: str = ""
    product_id: str = ""
    sku: str = ""
    name: str = ""
    primary_image: str = ""
    price: str = ""
    old_price: str = ""
    vat: str = ""
    has_fbo_stocks: bool = False
    has_fbs_stocks: bool = False
    archived: bool = False
    is_discounted: bool = False
    barcodes: str = "[]"
    description: str = ""
    images: str = "[]"
    min_price: str = ""
    status: str = ""
    type_id: int = 0
    category_id: int = 0
    volume_weight: float = 0.0
    currency_code: str = ""
    is_kgt: bool = False
    is_prepayment_allowed: bool = False
    commissions_json: str = "[]"
    stock_present: int = 0
    stock_reserved: int = 0
    ozon_created_at: str = ""


class ListingCreate(BaseModel):
    store_id: int
    offer_id: str = ""
    product_id: str = ""
    sku: str = ""
    name: str = ""
    primary_image: str = ""
    price: str = ""
    old_price: str = ""
    vat: str = ""
    has_fbo_stocks: bool = False
    has_fbs_stocks: bool = False
    archived: bool = False
    is_discounted: bool = False
    barcodes: str = "[]"
    description: str = ""
    images: str = "[]"
    min_price: str = ""
    status: str = ""
    type_id: int = 0
    category_id: int = 0
    volume_weight: float = 0.0
    currency_code: str = ""
    is_kgt: bool = False
    is_prepayment_allowed: bool = False
    commissions_json: str = "[]"
    stock_present: int = 0
    stock_reserved: int = 0
    ozon_created_at: str = ""


class ListingUpdate(BaseModel):
    offer_id: Optional[str] = None
    product_id: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    primary_image: Optional[str] = None
    price: Optional[str] = None
    old_price: Optional[str] = None
    vat: Optional[str] = None
    has_fbo_stocks: Optional[bool] = None
    has_fbs_stocks: Optional[bool] = None
    archived: Optional[bool] = None
    barcodes: Optional[str] = None
    description: Optional[str] = None
    images: Optional[str] = None
    min_price: Optional[str] = None
    status: Optional[str] = None
    type_id: Optional[int] = None
    category_id: Optional[int] = None
    volume_weight: Optional[float] = None
    currency_code: Optional[str] = None
    is_kgt: Optional[bool] = None
    is_prepayment_allowed: Optional[bool] = None
    commissions_json: Optional[str] = None
    stock_present: Optional[int] = None
    stock_reserved: Optional[int] = None
    ozon_created_at: Optional[str] = None


class ListingRead(ListingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

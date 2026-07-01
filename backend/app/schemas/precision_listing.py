from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List


class PrecisionListingBase(BaseModel):
    store_id: int
    store_name: str = ""
    mode: str = "copy_ozon"
    source_sku: str = ""
    source_name: str = ""
    source_description: str = ""
    source_images: str = "[]"
    source_attributes: str = "[]"
    category_id: int = 0
    type_id: int = 0
    category_name: str = ""
    translated_name: str = ""
    translated_description: str = ""
    translated_attributes: str = "[]"
    price: str = ""
    old_price: str = ""
    vat: str = "0"
    weight: int = 0
    depth: int = 0
    height: int = 0
    width: int = 0
    offer_id: str = ""
    product_id: str = ""
    task_id: int = 0
    status: str = "draft"
    error_message: str = ""


class PrecisionListingCreate(BaseModel):
    store_id: int
    mode: str = "copy_ozon"
    source_sku: str = ""
    source_name: str = ""
    source_description: str = ""
    source_images: str = "[]"
    source_attributes: str = "[]"
    category_id: int = 0
    type_id: int = 0
    category_name: str = ""
    translated_name: str = ""
    translated_description: str = ""
    translated_attributes: str = "[]"
    price: str = ""
    old_price: str = ""
    vat: str = "0"
    weight: int = 0
    depth: int = 0
    height: int = 0
    width: int = 0
    status: str = "draft"


class PrecisionListingUpdate(BaseModel):
    store_id: Optional[int] = None
    source_name: Optional[str] = None
    source_description: Optional[str] = None
    source_images: Optional[str] = None
    source_attributes: Optional[str] = None
    category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    translated_name: Optional[str] = None
    translated_description: Optional[str] = None
    translated_attributes: Optional[str] = None
    price: Optional[str] = None
    old_price: Optional[str] = None
    vat: Optional[str] = None
    weight: Optional[int] = None
    depth: Optional[int] = None
    height: Optional[int] = None
    width: Optional[int] = None
    offer_id: Optional[str] = None
    product_id: Optional[str] = None
    task_id: Optional[int] = None
    status: Optional[str] = None
    error_message: Optional[str] = None


class PrecisionListingRead(PrecisionListingBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ImportBySkuRequest(BaseModel):
    """Request to call Ozon /v1/product/import-by-sku."""
    store_id: int
    source_sku: str
    source_name: str = ""
    offer_id: str
    price: str = "0"
    old_price: str = "0"
    vat: str = "0"
    currency_code: str = "RUB"


class SyncImportedRequest(BaseModel):
    """Request to sync an imported product's details."""
    task_id: int


class ScrapeRequest(BaseModel):
    """Mode B: Scrape product data from an external platform URL."""
    url: str


class SubmitToOzonRequest(BaseModel):
    """Request to submit a precision listing task to Ozon as a new product."""
    description_category_id: int = 0
    type_id: int = 0
    attributes: List[dict] = []
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    weight_g: Optional[int] = None
    height_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    width_mm: Optional[int] = None
    barcode: str = ""
    offer_id: str = ""


class ScrapeResponse(BaseModel):
    """Standardised scraped product data returned to the frontend."""
    platform: str
    source_url: str
    source_id: str = ""
    title: str = ""
    description: str = ""
    images: list[str] = []
    price: str = ""
    currency: str = ""
    attributes: list[dict] = []
    brand: str = ""
    category: str = ""
    weight: str = ""
    dimensions: str = ""
    min_order_qty: str = ""
    seller_name: str = ""
    extra: dict = {}

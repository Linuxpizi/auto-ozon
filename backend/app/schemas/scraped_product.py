from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel


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
    seller_name: str = ""
    seller_url: str = ""
    attributes: List[dict] = []
    description: str = ""
    source_url: str = ""
    scraped_at: Optional[str] = None


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

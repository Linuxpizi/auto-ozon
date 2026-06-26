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
    seller_name: str = ""
    seller_url: str = ""
    attributes: List[dict] = []
    description: str = ""
    source_url: str = ""
    scraped_at: Optional[datetime] = None

    @model_validator(mode='before')
    @classmethod
    def convert_input(cls, data):
        """浏览器插件发送 camelCase + scraped_at 字符串,统一转换"""
        if not isinstance(data, dict):
            return data
        result = {_camel_to_snake(k): v for k, v in data.items()}
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

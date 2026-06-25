"""Pydantic schemas for the Intelligence (智囊) module.

Covers pricing strategies, platform promos, and seller promos.
"""

from typing import Optional
from pydantic import BaseModel


# ======================================================================
# 一、定价策略 (Pricing Strategy)
# ======================================================================

class CompetitorItem(BaseModel):
    """单个竞争对手配置."""
    competitor_id: int
    coefficient: float = 1.0


class PricingStrategyCreate(BaseModel):
    """创建定价策略请求."""
    strategy_name: str
    competitors: list[CompetitorItem] | None = None


class PricingStrategyUpdate(BaseModel):
    """更新定价策略请求."""
    strategy_name: str
    competitors: list[CompetitorItem] = []


class PricingStrategyStatus(BaseModel):
    """启用/禁用策略."""
    is_active: bool


class PricingProductAdd(BaseModel):
    """添加商品到策略."""
    strategy_id: str
    product_id: list[str]


class StrategyIdsByProductIds(BaseModel):
    """查询商品绑定的策略."""
    product_id: list[str]


class CompetitorProductPriceRequest(BaseModel):
    """获取单个商品竞品价格."""
    product_id: int


# ======================================================================
# 二、平台促销活动 (Platform Promos)
# ======================================================================

class PlatformActionProduct(BaseModel):
    """活动商品(激活/参加)."""
    id: int
    action_price: float
    stock: int = 0


class PlatformActionActivate(BaseModel):
    """添加商品到活动."""
    products: list[PlatformActionProduct]


class PlatformActionDeactivate(BaseModel):
    """从活动中移除商品."""
    product_ids: list[int]


# ======================================================================
# 三、卖家自定义促销 (Seller Promos)
# ======================================================================

class SellerActionProduct(BaseModel):
    """卖家促销商品."""
    sku: int
    discount_percent: float = 0
    currency: str = "RUB"


class SellerActionCreate(BaseModel):
    """创建卖家促销请求."""
    title: str
    date_start: str
    date_end: str
    discount_type: str = "PERCENT"  # PERCENT | AMOUNT
    discount_value: float = 0
    budget: float = 0
    min_action_percent: float = 0
    is_participating: bool = True


class SellerActionProducts(BaseModel):
    """添加商品到卖家促销."""
    products: list[SellerActionProduct]


class SellerActionRemoveProducts(BaseModel):
    """从卖家促销移除商品."""
    product_ids: list[int]

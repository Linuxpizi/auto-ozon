"""Intelligence (智囊) router — pricing strategies, platform promos, seller actions."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.crud import store as store_crud
from app.core.db import get_db
from app.schemas.intelligence import (
    PricingStrategyCreate,
    PricingStrategyUpdate,
    PricingStrategyStatus,
    PricingProductAdd,
    StrategyIdsByProductIds,
    CompetitorProductPriceRequest,
    PlatformActionActivate,
    PlatformActionDeactivate,
    SellerActionCreate,
    SellerActionProducts,
    SellerActionRemoveProducts,
)
from app.services.ozon_client import OzonClient, OzonAPIError

router = APIRouter()


def _get_client(store_id: int, db: Session) -> OzonClient:
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    return OzonClient(store.client_id, store.api_key)


def _call(client_fn, *args, **kwargs):
    """Call an Ozon client method, converting OzonAPIError → HTTPException."""
    try:
        return client_fn(*args, **kwargs)
    except OzonAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=f"Ozon API 错误: {exc.body}",
        )


# ======================================================================
# 一、定价策略 (PricingStrategyAPI)
# ======================================================================

@router.get("/pricing/strategies")
def list_pricing_strategies(
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取定价策略列表"""
    client = _get_client(store_id, db)
    return _call(client.get_pricing_strategies)


@router.get("/pricing/strategies/{strategy_id}")
def get_pricing_strategy(
    strategy_id: str = "",
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取策略详情(含竞争对手列表)"""
    client = _get_client(store_id, db)
    return _call(client.get_pricing_strategy_info, strategy_id)


@router.post("/pricing/strategies")
def create_pricing_strategy(
    store_id: int = Query(...),
    body: PricingStrategyCreate = PricingStrategyCreate(strategy_name=""),
    db: Session = Depends(get_db),
) -> Any:
    """创建新策略"""
    client = _get_client(store_id, db)
    competitors = None
    if body.competitors:
        competitors = [c.model_dump() for c in body.competitors]
    return _call(client.create_pricing_strategy, body.strategy_name, competitors)


@router.put("/pricing/strategies/{strategy_id}")
def update_pricing_strategy(
    strategy_id: str,
    store_id: int = Query(...),
    body: PricingStrategyUpdate = PricingStrategyUpdate(strategy_name=""),
    db: Session = Depends(get_db),
) -> Any:
    """更新策略名称和竞争对手"""
    client = _get_client(store_id, db)
    competitors = [c.model_dump() for c in body.competitors]
    return _call(client.update_pricing_strategy, strategy_id, body.strategy_name, competitors)


@router.delete("/pricing/strategies/{strategy_id}")
def delete_pricing_strategy(
    strategy_id: str,
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """删除策略"""
    client = _get_client(store_id, db)
    return _call(client.delete_pricing_strategy, strategy_id)


@router.post("/pricing/strategies/{strategy_id}/status")
def set_pricing_strategy_status(
    strategy_id: str,
    store_id: int = Query(...),
    body: PricingStrategyStatus = PricingStrategyStatus(is_active=True),
    db: Session = Depends(get_db),
) -> Any:
    """启用/禁用策略"""
    client = _get_client(store_id, db)
    return _call(client.set_pricing_strategy_status, strategy_id, body.is_active)


@router.get("/pricing/competitors")
def list_pricing_competitors(
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取可选竞争对手列表"""
    client = _get_client(store_id, db)
    return _call(client.get_pricing_competitors)


@router.get("/pricing/products")
def list_pricing_strategy_products(
    store_id: int = Query(...),
    strategy_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取策略关联商品"""
    client = _get_client(store_id, db)
    return _call(client.get_pricing_strategy_products, strategy_id)


@router.post("/pricing/products/add")
def add_products_to_pricing_strategy(
    store_id: int = Query(...),
    body: PricingProductAdd = PricingProductAdd(strategy_id="", product_id=[]),
    db: Session = Depends(get_db),
) -> Any:
    """添加商品到策略"""
    client = _get_client(store_id, db)
    return _call(client.add_products_to_pricing_strategy, body.strategy_id, body.product_id)


@router.post("/pricing/products/delete")
def delete_products_from_pricing_strategy(
    store_id: int = Query(...),
    body: PricingProductAdd = PricingProductAdd(strategy_id="", product_id=[]),
    db: Session = Depends(get_db),
) -> Any:
    """从策略移除商品"""
    client = _get_client(store_id, db)
    return _call(client.delete_products_from_pricing_strategy, body.strategy_id, body.product_id)


@router.post("/pricing/product/info")
def get_competitor_product_price(
    store_id: int = Query(...),
    body: CompetitorProductPriceRequest = CompetitorProductPriceRequest(product_id=0),
    db: Session = Depends(get_db),
) -> Any:
    """获取单个商品的竞品价格"""
    client = _get_client(store_id, db)
    return _call(client.get_competitor_product_price, body.product_id)


@router.post("/pricing/strategy-ids-by-product-ids")
def get_strategy_ids_by_product_ids(
    store_id: int = Query(...),
    body: StrategyIdsByProductIds = StrategyIdsByProductIds(product_id=[]),
    db: Session = Depends(get_db),
) -> Any:
    """查询商品绑定的策略"""
    client = _get_client(store_id, db)
    return _call(client.get_strategy_ids_by_product_ids, body.product_id)


# ======================================================================
# 二、平台促销活动 (Promos)
# ======================================================================

@router.get("/platform-actions")
def list_platform_actions(
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取可参加的 Ozon 平台促销活动列表"""
    client = _get_client(store_id, db)
    return _call(client.get_platform_actions)


@router.get("/platform-actions/{action_id}/products")
def list_platform_action_products(
    action_id: int,
    store_id: int = Query(...),
    limit: int = Query(100, ge=1, le=1000),
    last_id: str = Query(""),
    db: Session = Depends(get_db),
) -> Any:
    """获取活动中的商品列表"""
    client = _get_client(store_id, db)
    return _call(client.get_platform_action_products, action_id, limit, last_id)


@router.post("/platform-actions/{action_id}/activate")
def activate_products_in_action(
    action_id: int,
    store_id: int = Query(...),
    body: PlatformActionActivate = PlatformActionActivate(products=[]),
    db: Session = Depends(get_db),
) -> Any:
    """添加商品到活动"""
    client = _get_client(store_id, db)
    products = [p.model_dump() for p in body.products]
    return _call(client.activate_products_in_action, action_id, products)


@router.post("/platform-actions/{action_id}/deactivate")
def deactivate_products_in_action(
    action_id: int,
    store_id: int = Query(...),
    body: PlatformActionDeactivate = PlatformActionDeactivate(product_ids=[]),
    db: Session = Depends(get_db),
) -> Any:
    """从活动中移除商品"""
    client = _get_client(store_id, db)
    return _call(client.deactivate_products_in_action, action_id, body.product_ids)


# ======================================================================
# 三、卖家促销活动 (SellerActions)
# ======================================================================

@router.get("/seller-actions")
def list_seller_actions(
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取卖家促销列表"""
    client = _get_client(store_id, db)
    return _call(client.get_seller_actions)


@router.post("/seller-actions")
def create_seller_action(
    store_id: int = Query(...),
    body: SellerActionCreate = SellerActionCreate(title="", date_start="", date_end=""),
    db: Session = Depends(get_db),
) -> Any:
    """创建卖家促销"""
    client = _get_client(store_id, db)
    action_params = body.model_dump(exclude_none=True)
    return _call(client.create_seller_action, action_params)


@router.put("/seller-actions/{action_id}")
def update_seller_action(
    action_id: int,
    store_id: int = Query(...),
    body: SellerActionCreate = SellerActionCreate(title="", date_start="", date_end=""),
    db: Session = Depends(get_db),
) -> Any:
    """更新卖家促销"""
    client = _get_client(store_id, db)
    action_params = body.model_dump(exclude_none=True)
    return _call(client.update_seller_action, action_id, action_params)


@router.delete("/seller-actions/{action_id}")
def delete_seller_action(
    action_id: int,
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """删除卖家促销"""
    client = _get_client(store_id, db)
    return _call(client.delete_seller_action, action_id)


@router.get("/seller-actions/{action_id}/products")
def list_seller_action_products(
    action_id: int,
    store_id: int = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """获取卖家促销中的商品"""
    client = _get_client(store_id, db)
    return _call(client.get_seller_action_products, action_id)


@router.post("/seller-actions/{action_id}/products")
def add_products_to_seller_action(
    action_id: int,
    store_id: int = Query(...),
    body: SellerActionProducts = SellerActionProducts(products=[]),
    db: Session = Depends(get_db),
) -> Any:
    """添加商品到卖家促销"""
    client = _get_client(store_id, db)
    products = [p.model_dump() for p in body.products]
    return _call(client.add_products_to_seller_action, action_id, products)


@router.delete("/seller-actions/{action_id}/products")
def delete_products_from_seller_action(
    action_id: int,
    store_id: int = Query(...),
    body: SellerActionRemoveProducts = SellerActionRemoveProducts(product_ids=[]),
    db: Session = Depends(get_db),
) -> Any:
    """从卖家促销移除商品"""
    client = _get_client(store_id, db)
    return _call(client.delete_products_from_seller_action, action_id, body.product_ids)

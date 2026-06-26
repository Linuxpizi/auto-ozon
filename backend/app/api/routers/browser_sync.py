from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import scraped_product as sp_crud
from app.schemas.scraped_product import (
    ScrapedProductRead,
    SyncProductsRequest,
)

router = APIRouter()


@router.post("/sync-products")
def sync_products(body: SyncProductsRequest, db: Session = Depends(get_db)):
    """批量同步浏览器插件采集的商品数据"""
    created = sp_crud.bulk_create_scraped_products(db, body.products)
    return {
        "success": True,
        "created": len(created),
        "skipped": len(body.products) - len(created),
    }


@router.get("/products", response_model=List[ScrapedProductRead])
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    platform: Optional[str] = Query(None, description="ozon | wb"),
    db: Session = Depends(get_db),
):
    """获取已同步的采集商品列表"""
    return sp_crud.get_scraped_products(db, skip=skip, limit=limit, platform=platform)


@router.get("/products/count")
def count_products(
    platform: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """获取采集商品总数"""
    total = sp_crud.count_scraped_products(db, platform=platform)
    return {"total": total}


@router.delete("/products/{record_id}")
def delete_product(record_id: int, db: Session = Depends(get_db)):
    """删除采集商品记录"""
    ok = sp_crud.delete_scraped_product(db, record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"success": True}


@router.post("/match-suppliers")
def match_suppliers(body: dict, db: Session = Depends(get_db)):
    """触发比价匹配 — 查找国内供应链中的相似款（预留接口）"""
    record_id = body.get("record_id")
    if not record_id:
        raise HTTPException(status_code=400, detail="record_id is required")

    record = sp_crud.get_scraped_product(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # TODO: 接入 1688/淘宝搜索接口进行比价匹配
    # 目前返回占位信息
    return {
        "success": True,
        "record_id": record_id,
        "matched_suppliers": [],
        "message": "比价匹配功能开发中",
    }

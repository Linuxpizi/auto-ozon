from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.core.db import get_db
from app.crud import scraped_product as sp_crud
from app.models.ozon_cookie_snapshot import OzonCookieSnapshot
from app.schemas.ozon_cookie_snapshot import (
    OzonCookieInspection,
    OzonCookieSnapshotRead,
    OzonCookieSnapshotUpsert,
)
from app.schemas.scraped_product import (
    OzonListProductsRequest,
    OzonListSyncResponse,
    ScrapedProductRead,
    SyncProductsRequest,
)

router = APIRouter()


def _snapshot_read(snapshot: OzonCookieSnapshot) -> OzonCookieSnapshotRead:
    return OzonCookieSnapshotRead(
        client_id=snapshot.client_id,
        source=snapshot.source,
        status=snapshot.status,
        has_ozon_cookie=bool(snapshot.ozon_cookie),
        has_sso_cookie=bool(snapshot.sso_cookie),
        updated_at=snapshot.updated_at,
    )


@router.put("/ozon-cookies", response_model=OzonCookieSnapshotRead)
def upsert_ozon_cookies(
    body: OzonCookieSnapshotUpsert,
    db: Session = Depends(get_db),
):
    """Store extension cookies while deliberately omitting secrets from responses."""
    client_id = body.client_id.strip()
    snapshot = (
        db.query(OzonCookieSnapshot)
        .filter(OzonCookieSnapshot.client_id == client_id)
        .first()
    )
    if snapshot is None:
        snapshot = OzonCookieSnapshot(client_id=client_id)
        db.add(snapshot)

    snapshot.ozon_cookie = body.ozon_cookie
    snapshot.sso_cookie = body.sso_cookie
    snapshot.source = body.source
    snapshot.status = "available"
    snapshot.last_error = ""
    snapshot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(snapshot)
    return _snapshot_read(snapshot)


@router.get("/ozon-cookies/inspect")
def inspect_available_ozon_cookies(db: Session = Depends(get_db)):
    """Return aggregate Cookie availability without exposing secret values."""
    snapshots = db.query(OzonCookieSnapshot).all()
    available_count = sum(
        1
        for snapshot in snapshots
        if snapshot.status == "available" and bool(snapshot.ozon_cookie.strip())
    )
    return {
        "available_count": available_count,
        "total_count": len(snapshots),
    }


@router.get(
    "/ozon-cookies/{client_id}/inspect",
    response_model=OzonCookieInspection,
)
def inspect_ozon_cookies(client_id: str, db: Session = Depends(get_db)):
    """Inspect one client's Cookie availability without returning secrets."""
    snapshot = (
        db.query(OzonCookieSnapshot)
        .filter(OzonCookieSnapshot.client_id == client_id)
        .first()
    )
    if snapshot is None:
        return OzonCookieInspection(
            client_id=client_id,
            available=False,
            status="missing",
            has_ozon_cookie=False,
            has_sso_cookie=False,
        )
    has_ozon_cookie = bool(snapshot.ozon_cookie)
    return OzonCookieInspection(
        client_id=snapshot.client_id,
        available=snapshot.status == "available" and has_ozon_cookie,
        status=snapshot.status,
        has_ozon_cookie=has_ozon_cookie,
        has_sso_cookie=bool(snapshot.sso_cookie),
        updated_at=snapshot.updated_at,
    )


@router.post("/sync-products")
def sync_products(body: SyncProductsRequest, db: Session = Depends(get_db)):
    """批量同步浏览器插件采集的商品数据"""
    created = sp_crud.bulk_create_scraped_products(db, body.products)
    return {
        "success": True,
        "created": len(created),
        "skipped": len(body.products) - len(created),
    }


@router.post("/ozon-list-products", response_model=OzonListSyncResponse)
def sync_ozon_list_products(
    body: OzonListProductsRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """同步 Ozon 列表卡片稀疏事实；不经过 PDP 完整度校验。"""
    # 商品目录仍是全局共享；当前用户依赖仅作为认证及请求审计边界。
    _ = current_user.id
    created, updated, skipped = sp_crud.upsert_ozon_list_products(db, body.products)
    return OzonListSyncResponse(created=created, updated=updated, skipped=skipped)


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

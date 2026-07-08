from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import store as store_crud
from app.models.store import Store
from app.services.ozon_client import OzonAPIError, OzonClient, clear_cache


router = APIRouter()


class LogisticsStoreUpdate(BaseModel):
    warehouse_id: Optional[str] = None
    warehouse_status: Optional[str] = None


class LogisticsBulkUpdate(BaseModel):
    store_ids: list[int] = Field(..., min_length=1)
    warehouse_id: Optional[str] = None
    warehouse_status: Optional[str] = None


class WarehouseActionRequest(BaseModel):
    warehouse_id: int
    action: Literal["archive", "unarchive"]


class BulkWarehouseActionRequest(BaseModel):
    items: list[WarehouseActionRequest] = Field(..., min_length=1)


def _client_for_store(store: Store) -> OzonClient:
    return OzonClient(client_id=store.client_id, api_key=store.api_key)


def _ozon_error(exc: OzonAPIError) -> HTTPException:
    return HTTPException(
        status_code=502,
        detail=f"Ozon API 调用失败 ({exc.status_code}): {exc.body}",
    )


def _store_summary(store: Store) -> dict[str, Any]:
    return {
        "id": store.id,
        "name": store.name,
        "client_id": store.client_id,
        "status": store.status,
        "warehouse_id": store.warehouse_id or "",
        "warehouse_status": store.warehouse_status or "",
        "type_id": store.type_id or "",
    }


@router.get("/stores")
def list_logistics_stores(
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """查看店铺物流配置。"""
    stores = store_crud.get_stores(db, skip=0, limit=999, keyword=keyword)
    return [_store_summary(s) for s in stores]


@router.put("/stores/bulk")
def bulk_update_logistics_stores(
    payload: LogisticsBulkUpdate,
    db: Session = Depends(get_db),
):
    """批量修改店铺物流配置。"""
    updated = []
    for store_id in payload.store_ids:
        store = store_crud.get_store(db, store_id)
        if not store:
            continue
        if payload.warehouse_id is not None:
            store.warehouse_id = payload.warehouse_id
        if payload.warehouse_status is not None:
            store.warehouse_status = payload.warehouse_status
        updated.append(store)
    db.commit()
    return [_store_summary(s) for s in updated]


@router.put("/stores/{store_id}")
def update_logistics_store(
    store_id: int,
    payload: LogisticsStoreUpdate,
    db: Session = Depends(get_db),
):
    """修改单个店铺在系统内绑定的默认物流仓库。"""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    if payload.warehouse_id is not None:
        store.warehouse_id = payload.warehouse_id
    if payload.warehouse_status is not None:
        store.warehouse_status = payload.warehouse_status
    db.commit()
    db.refresh(store)
    return _store_summary(store)


@router.get("/stores/{store_id}/warehouses")
def list_store_warehouses(
    store_id: int,
    limit: int = Query(100, ge=1, le=1000),
    warehouse_ids: Optional[str] = Query(None, description="逗号分隔的 warehouse_id"),
    db: Session = Depends(get_db),
):
    """按 Ozon WarehouseAPI 查看店铺 FBS/rFBS 仓库列表。"""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    ids = [int(v) for v in warehouse_ids.split(",") if v.strip()] if warehouse_ids else None
    try:
        warehouses = _client_for_store(store).list_warehouses(limit=limit, warehouse_ids=ids)
    except OzonAPIError as exc:
        raise _ozon_error(exc)
    return [w.__dict__ for w in warehouses]


@router.get("/stores/{store_id}/delivery-methods")
def list_store_delivery_methods(
    store_id: int,
    limit: int = Query(100, ge=1, le=1000),
    warehouse_ids: Optional[str] = Query(None, description="逗号分隔的 warehouse_id"),
    statuses: Optional[str] = Query(None, description="逗号分隔状态，如 NEW,ACTIVE"),
    db: Session = Depends(get_db),
):
    """按 Ozon WarehouseAPI 查看 realFBS 配送方式/物流供应商列表。"""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    ids = [int(v) for v in warehouse_ids.split(",") if v.strip()] if warehouse_ids else None
    status_list = [v.strip() for v in statuses.split(",") if v.strip()] if statuses else None
    try:
        return _client_for_store(store).list_delivery_methods(
            limit=limit,
            warehouse_ids=ids,
            statuses=status_list,
        )
    except OzonAPIError as exc:
        raise _ozon_error(exc)


@router.post("/stores/{store_id}/warehouse-action")
def warehouse_action(
    store_id: int,
    payload: WarehouseActionRequest,
    db: Session = Depends(get_db),
):
    """修改店铺物流仓库状态：归档或解除归档。"""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    client = _client_for_store(store)
    try:
        result = (
            client.archive_warehouse(payload.warehouse_id)
            if payload.action == "archive"
            else client.unarchive_warehouse(payload.warehouse_id)
        )
        clear_cache()
        store.warehouse_id = str(payload.warehouse_id)
        store.warehouse_status = "archived" if payload.action == "archive" else "active"
        db.commit()
        return {"ok": True, "result": result, "store": _store_summary(store)}
    except OzonAPIError as exc:
        raise _ozon_error(exc)


@router.post("/stores/{store_id}/warehouse-actions/bulk")
def bulk_warehouse_actions(
    store_id: int,
    payload: BulkWarehouseActionRequest,
    db: Session = Depends(get_db),
):
    """批量修改同一店铺下多个物流仓库状态。"""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    client = _client_for_store(store)
    results = []
    for item in payload.items:
        try:
            result = (
                client.archive_warehouse(item.warehouse_id)
                if item.action == "archive"
                else client.unarchive_warehouse(item.warehouse_id)
            )
            results.append({"warehouse_id": item.warehouse_id, "action": item.action, "ok": True, "result": result})
        except OzonAPIError as exc:
            results.append({"warehouse_id": item.warehouse_id, "action": item.action, "ok": False, "error": str(exc.body)})
    clear_cache()
    return {"results": results}
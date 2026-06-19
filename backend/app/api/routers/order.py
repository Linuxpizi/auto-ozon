from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.crud import order as order_crud
from app.schemas.order import OrderCreate, OrderUpdate, OrderRead
from app.core.db import get_db
from app.services.sync_service import run_sync_task
from app.services.ozon_client import clear_cache

router = APIRouter()


@router.get("/", response_model=List[OrderRead])
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return order_crud.get_orders(
        db, skip=skip, limit=limit, store_id=store_id, status=status, keyword=keyword
    )


@router.get("/count")
def get_order_count(
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return {"count": order_crud.count_orders(db, store_id=store_id, status=status, keyword=keyword)}


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = order_crud.get_order(db, order_id)
    if not order:
        raise HTTPException(404, "订单不存在")
    return order


@router.post("/", response_model=OrderRead, status_code=201)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    return order_crud.create_order(db, order)


@router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: int, order: OrderUpdate, db: Session = Depends(get_db)):
    updated = order_crud.update_order(db, order_id, order)
    if not updated:
        raise HTTPException(404, "订单不存在")
    return updated


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    deleted = order_crud.delete_order(db, order_id)
    if not deleted:
        raise HTTPException(404, "订单不存在")
    return {"ok": True}


@router.post("/sync")
def sync_orders(db: Session = Depends(get_db)):
    """从 Ozon 同步所有店铺的 FBS 订单数据。"""
    clear_cache()
    result = run_sync_task(db, "sync_orders")
    if result == "failed":
        raise HTTPException(500, detail="订单同步失败，请检查 Ozon API 凭证和网络连接")
    return {"status": result}

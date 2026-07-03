"""Return orders CRUD endpoints."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud.return_order import (
    list_return_orders,
    get_return_order,
    count_return_orders,
)
from app.schemas.return_order import ReturnOrderRead

router = APIRouter(tags=["Return Orders"])


@router.get("/", response_model=list[ReturnOrderRead])
def api_list_return_orders(
    store_id: Optional[int] = Query(None),
    notified: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return list_return_orders(db, store_id=store_id, notified=notified, skip=skip, limit=limit)


@router.get("/count")
def api_return_orders_count(
    store_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return {"count": count_return_orders(db, store_id=store_id)}


@router.get("/{return_id}", response_model=ReturnOrderRead)
def api_get_return_order(
    return_id: str,
    db: Session = Depends(get_db),
):
    obj = get_return_order(db, return_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Return order not found")
    return obj

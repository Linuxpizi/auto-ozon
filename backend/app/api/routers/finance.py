from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.crud import finance as finance_crud
from app.schemas.finance import StoreFinanceCreate, StoreFinanceUpdate, StoreFinanceRead
from app.core.db import get_db
from app.services.sync_service import run_sync_task
from app.services.ozon_client import clear_cache

router = APIRouter()


@router.get("/", response_model=List[StoreFinanceRead])
def list_finances(
    store_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return finance_crud.list_finances(db, store_id=store_id)


@router.get("/{finance_id}", response_model=StoreFinanceRead)
def get_finance(finance_id: int, db: Session = Depends(get_db)):
    obj = finance_crud.get_finance(db, finance_id)
    if not obj:
        raise HTTPException(404, "资金记录不存在")
    return obj


@router.post("/", response_model=StoreFinanceRead, status_code=201)
def create_finance(data: StoreFinanceCreate, db: Session = Depends(get_db)):
    existing = finance_crud.get_finance_by_store(db, data.store_id)
    if existing:
        raise HTTPException(400, detail="该店铺已存在资金记录")
    return finance_crud.create_finance(db, data)


@router.put("/{finance_id}", response_model=StoreFinanceRead)
def update_finance(finance_id: int, data: StoreFinanceUpdate, db: Session = Depends(get_db)):
    obj = finance_crud.update_finance(db, finance_id, data)
    if not obj:
        raise HTTPException(404, "资金记录不存在")
    return obj


@router.put("/store/{store_id}/sync", response_model=StoreFinanceRead)
def sync_finance(store_id: int, data: StoreFinanceUpdate, db: Session = Depends(get_db)):
    """Upsert finance data for a store (sync from Ozon)."""
    return finance_crud.upsert_finance(db, store_id, data)


@router.post("/sync")
def sync_all_finances(db: Session = Depends(get_db)):
    """从 Ozon 同步所有店铺的资金流水数据。"""
    clear_cache()
    result = run_sync_task(db, "sync_finance")
    if result == "failed":
        raise HTTPException(500, detail="资金同步失败，请检查 Ozon API 凭证和网络连接")
    return {"status": result}


@router.delete("/{finance_id}")
def delete_finance(finance_id: int, db: Session = Depends(get_db)):
    ok = finance_crud.delete_finance(db, finance_id)
    if not ok:
        raise HTTPException(404, "资金记录不存在")
    return {"ok": True}

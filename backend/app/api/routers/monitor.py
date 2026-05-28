from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.crud import monitor as monitor_crud
from app.schemas.monitor import StoreMonitorCreate, StoreMonitorUpdate, StoreMonitorRead
from app.core.db import get_db

router = APIRouter()


@router.get("/summary")
def get_monitor_summary(db: Session = Depends(get_db)):
    return monitor_crud.get_monitor_summary(db)


@router.get("/", response_model=List[StoreMonitorRead])
def list_monitors(
    store_id: int = Query(None),
    db: Session = Depends(get_db),
):
    return monitor_crud.get_monitors(db, store_id=store_id)


@router.post("/", response_model=StoreMonitorRead, status_code=201)
def create_monitor(data: StoreMonitorCreate, db: Session = Depends(get_db)):
    return monitor_crud.create_monitor(db, data)


@router.put("/{monitor_id}", response_model=StoreMonitorRead)
def update_monitor(monitor_id: int, data: StoreMonitorUpdate, db: Session = Depends(get_db)):
    obj = monitor_crud.update_monitor(db, monitor_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Monitor record not found")
    return obj


@router.delete("/{monitor_id}")
def delete_monitor(monitor_id: int, db: Session = Depends(get_db)):
    ok = monitor_crud.delete_monitor(db, monitor_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Monitor record not found")
    return {"ok": True}

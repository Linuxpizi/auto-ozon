from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.crud import store as store_crud
from app.schemas.store import StoreCreate, StoreRead
from app.core.db import get_db

router = APIRouter()


@router.get("/", response_model=List[StoreRead])
def read_stores(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return store_crud.get_stores(db, skip=skip, limit=limit)


@router.post("/", response_model=StoreRead)
def create_store(store: StoreCreate, db: Session = Depends(get_db)):
    existing = store_crud.get_store_by_client_id(db, store.client_id)
    if existing:
        raise HTTPException(status_code=400, detail="client_id already exists")
    return store_crud.create_store(db, store)

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.crud import order as order_crud
from app.schemas.order import OrderCreate, OrderRead
from app.core.db import get_db

router = APIRouter()


@router.get("/", response_model=List[OrderRead])
def read_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return order_crud.get_orders(db, skip=skip, limit=limit)


@router.post("/", response_model=OrderRead)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    return order_crud.create_order(db, order)

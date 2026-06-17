from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderUpdate


def get_orders(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[Order]:
    q = db.query(Order)
    if store_id is not None:
        q = q.filter(Order.store_id == store_id)
    if status:
        q = q.filter(Order.status == status)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            Order.order_number.ilike(like)
            | Order.shipment_number.ilike(like)
            | Order.tracking_number.ilike(like)
            | Order.product_name.ilike(like)
            | Order.sku.ilike(like)
            | Order.store_name.ilike(like)
        )
    q = q.order_by(Order.created_at.desc())
    return q.offset(skip).limit(limit).all()


def get_order(db: Session, order_id: int):
    return db.query(Order).filter(Order.id == order_id).first()


def get_order_by_number(db: Session, order_number: str):
    return db.query(Order).filter(Order.order_number == order_number).first()


def count_orders(
    db: Session,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    q = db.query(func.count(Order.id))
    if store_id is not None:
        q = q.filter(Order.store_id == store_id)
    if status:
        q = q.filter(Order.status == status)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            Order.order_number.ilike(like)
            | Order.shipment_number.ilike(like)
            | Order.tracking_number.ilike(like)
            | Order.product_name.ilike(like)
            | Order.sku.ilike(like)
            | Order.store_name.ilike(like)
        )
    return q.scalar() or 0


def create_order(db: Session, order: OrderCreate):
    db_order = Order(**order.model_dump())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


def update_order(db: Session, order_id: int, order: OrderUpdate):
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if not db_order:
        return None
    update_data = order.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_order, key, value)
    db.commit()
    db.refresh(db_order)
    return db_order


def delete_order(db: Session, order_id: int) -> bool:
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if not db_order:
        return False
    db.delete(db_order)
    db.commit()
    return True


def count_quality_check_orders(db: Session):
    return db.query(func.count(Order.id)).filter(Order.is_quality_check).scalar() or 0


def total_gmv(db: Session):
    return db.query(func.coalesce(func.sum(Order.gmv), 0.0)).scalar() or 0.0


def total_gmv_by_quality(db: Session):
    return db.query(func.coalesce(func.sum(Order.gmv), 0.0)).filter(Order.is_quality_check).scalar() or 0.0

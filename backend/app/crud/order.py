from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.order import Order
from app.schemas.order import OrderCreate


def get_orders(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Order).offset(skip).limit(limit).all()


def create_order(db: Session, order: OrderCreate):
    db_order = Order(
        order_number=order.order_number,
        store_id=order.store_id,
        is_quality_check=order.is_quality_check,
        gmv=order.gmv,
        status=order.status,
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


def count_orders(db: Session):
    return db.query(func.count(Order.id)).scalar() or 0


def count_quality_check_orders(db: Session):
    return db.query(func.count(Order.id)).filter(Order.is_quality_check).scalar() or 0


def total_gmv(db: Session):
    return db.query(func.coalesce(func.sum(Order.gmv), 0.0)).scalar() or 0.0


def total_gmv_by_quality(db: Session):
    return db.query(func.coalesce(func.sum(Order.gmv), 0.0)).filter(Order.is_quality_check).scalar() or 0.0

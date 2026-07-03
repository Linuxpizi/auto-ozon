from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.return_order import ReturnOrder
from app.schemas.return_order import ReturnOrderCreate, ReturnOrderUpdate


def list_return_orders(
    db: Session,
    store_id: Optional[int] = None,
    notified: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[ReturnOrder]:
    q = db.query(ReturnOrder)
    if store_id is not None:
        q = q.filter(ReturnOrder.store_id == store_id)
    if notified is not None:
        q = q.filter(ReturnOrder.notified == notified)
    return q.order_by(desc(ReturnOrder.created_at)).offset(skip).limit(limit).all()


def get_return_order(db: Session, return_id: str) -> Optional[ReturnOrder]:
    return db.query(ReturnOrder).filter(ReturnOrder.return_id == return_id).first()


def get_unnotified_return_orders(db: Session) -> List[ReturnOrder]:
    return db.query(ReturnOrder).filter(ReturnOrder.notified == 0).all()


def create_return_order(db: Session, data: ReturnOrderCreate) -> ReturnOrder:
    obj = ReturnOrder(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def upsert_return_order(db: Session, data: ReturnOrderCreate) -> ReturnOrder:
    """Insert or update a return order by return_id."""
    existing = get_return_order(db, data.return_id)
    if existing:
        for key, val in data.model_dump(exclude_unset=True).items():
            setattr(existing, key, val)
        db.commit()
        db.refresh(existing)
        return existing
    return create_return_order(db, data)


def mark_notified(db: Session, return_id: str) -> bool:
    obj = get_return_order(db, return_id)
    if not obj:
        return False
    obj.notified = 1
    db.commit()
    return True


def count_return_orders(db: Session, store_id: Optional[int] = None) -> int:
    q = db.query(ReturnOrder)
    if store_id is not None:
        q = q.filter(ReturnOrder.store_id == store_id)
    return q.count()

from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.finance import StoreFinance
from app.schemas.finance import StoreFinanceCreate, StoreFinanceUpdate


def list_finances(db: Session, store_id: Optional[int] = None) -> List[StoreFinance]:
    q = db.query(StoreFinance)
    if store_id is not None:
        q = q.filter(StoreFinance.store_id == store_id)
    return q.order_by(StoreFinance.store_id).all()


def get_finance(db: Session, finance_id: int) -> Optional[StoreFinance]:
    return db.query(StoreFinance).filter(StoreFinance.id == finance_id).first()


def get_finance_by_store(db: Session, store_id: int) -> Optional[StoreFinance]:
    return db.query(StoreFinance).filter(StoreFinance.store_id == store_id).first()


def create_finance(db: Session, data: StoreFinanceCreate) -> StoreFinance:
    obj = StoreFinance(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_finance(db: Session, finance_id: int, data: StoreFinanceUpdate) -> Optional[StoreFinance]:
    obj = db.query(StoreFinance).filter(StoreFinance.id == finance_id).first()
    if not obj:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj


def upsert_finance(db: Session, store_id: int, data: StoreFinanceUpdate) -> StoreFinance:
    obj = db.query(StoreFinance).filter(StoreFinance.store_id == store_id).first()
    if obj:
        update_data = data.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(obj, key, val)
    else:
        obj = StoreFinance(store_id=store_id, **data.model_dump(exclude_unset=True))
        db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def delete_finance(db: Session, finance_id: int) -> bool:
    obj = db.query(StoreFinance).filter(StoreFinance.id == finance_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True

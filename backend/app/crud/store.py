from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.store import Store
from app.schemas.store import StoreCreate, StoreUpdate


def get_store(db: Session, store_id: int):
    return db.query(Store).filter(Store.id == store_id).first()


def get_store_by_client_id(db: Session, client_id: str):
    return db.query(Store).filter(Store.client_id == client_id).first()


def get_stores(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    keyword: Optional[str] = None,
) -> List[Store]:
    q = db.query(Store)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            Store.name.ilike(like)
            | Store.client_id.ilike(like)
        )
    return q.offset(skip).limit(limit).all()


def count_stores(db: Session, keyword: Optional[str] = None) -> int:
    q = db.query(func.count(Store.id))
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            Store.name.ilike(like)
            | Store.client_id.ilike(like)
        )
    return q.scalar() or 0


def create_store(db: Session, store: StoreCreate):
    db_store = Store(**store.model_dump())
    db.add(db_store)
    db.commit()
    db.refresh(db_store)
    return db_store


def update_store(db: Session, store_id: int, store: StoreUpdate):
    db_store = db.query(Store).filter(Store.id == store_id).first()
    if not db_store:
        return None
    update_data = store.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_store, key, value)
    db.commit()
    db.refresh(db_store)
    return db_store


def delete_store(db: Session, store_id: int) -> bool:
    db_store = db.query(Store).filter(Store.id == store_id).first()
    if not db_store:
        return False
    db.delete(db_store)
    db.commit()
    return True


def bulk_create_stores(db: Session, stores: List[StoreCreate]) -> List[Store]:
    db_stores = [Store(**s.model_dump()) for s in stores]
    for s in db_stores:
        db.add(s)
    db.commit()
    for s in db_stores:
        db.refresh(s)
    return db_stores

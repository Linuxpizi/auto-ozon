from sqlalchemy.orm import Session
from app.models.store import Store
from app.schemas.store import StoreCreate


def get_store(db: Session, store_id: int):
    return db.query(Store).filter(Store.id == store_id).first()


def get_store_by_client_id(db: Session, client_id: str):
    return db.query(Store).filter(Store.client_id == client_id).first()


def get_stores(db: Session, skip: int = 0, limit: int = 50):
    return db.query(Store).offset(skip).limit(limit).all()


def create_store(db: Session, store: StoreCreate):
    db_store = Store(
        name=store.name,
        client_id=store.client_id,
        api_key=store.api_key,
        status=store.status,
    )
    db.add(db_store)
    db.commit()
    db.refresh(db_store)
    return db_store

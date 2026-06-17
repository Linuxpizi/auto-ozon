from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.store_sync_config import StoreSyncConfig
from app.schemas.store_sync_config import StoreSyncConfigUpdate


def list_store_sync_configs(db: Session) -> List[StoreSyncConfig]:
    return db.query(StoreSyncConfig).order_by(StoreSyncConfig.store_id).all()


def get_store_sync_config(db: Session, store_id: int) -> Optional[StoreSyncConfig]:
    return db.query(StoreSyncConfig).filter(StoreSyncConfig.store_id == store_id).first()


def upsert_store_sync_config(db: Session, store_id: int, data: StoreSyncConfigUpdate) -> StoreSyncConfig:
    obj = db.query(StoreSyncConfig).filter(StoreSyncConfig.store_id == store_id).first()
    if obj:
        update_data = data.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(obj, key, val)
    else:
        obj = StoreSyncConfig(store_id=store_id, **data.model_dump(exclude_unset=True))
        db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def ensure_store_sync_config(db: Session, store_id: int) -> StoreSyncConfig:
    """Ensure a sync config exists for a store, create default if not."""
    obj = db.query(StoreSyncConfig).filter(StoreSyncConfig.store_id == store_id).first()
    if not obj:
        obj = StoreSyncConfig(store_id=store_id)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj

from typing import Optional
from sqlalchemy.orm import Session
from app.models.feishu_config import FeishuConfig
from app.schemas.feishu_config import FeishuConfigCreate, FeishuConfigUpdate


def get_feishu_config(db: Session) -> Optional[FeishuConfig]:
    return db.query(FeishuConfig).first()


def upsert_feishu_config(db: Session, data: FeishuConfigCreate) -> FeishuConfig:
    existing = get_feishu_config(db)
    if existing:
        for key, val in data.model_dump().items():
            setattr(existing, key, val)
        db.commit()
        db.refresh(existing)
        return existing
    obj = FeishuConfig(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_feishu_config(db: Session, data: FeishuConfigUpdate) -> Optional[FeishuConfig]:
    existing = get_feishu_config(db)
    if not existing:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(existing, key, val)
    db.commit()
    db.refresh(existing)
    return existing

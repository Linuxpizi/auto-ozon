from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from app.models.upload_draft import UploadDraft
from app.schemas.upload_draft import UploadDraftBase


def get_draft(db: Session, draft_id: int) -> Optional[UploadDraft]:
    return db.query(UploadDraft).filter(UploadDraft.id == draft_id).first()


def get_drafts(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    keyword: Optional[str] = None,
) -> list[UploadDraft]:
    q = db.query(UploadDraft)
    if store_id is not None:
        q = q.filter(UploadDraft.store_id == store_id)
    if status:
        q = q.filter(UploadDraft.status == status)
    if source_type:
        q = q.filter(UploadDraft.source_type == source_type)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            UploadDraft.name.ilike(like)
            | UploadDraft.offer_id.ilike(like)
            | UploadDraft.source_name.ilike(like)
            | UploadDraft.source_sku.ilike(like)
        )
    return q.order_by(UploadDraft.id.desc()).offset(skip).limit(limit).all()


def count_drafts(
    db: Session,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    q = db.query(sa_func.count(UploadDraft.id))
    if store_id is not None:
        q = q.filter(UploadDraft.store_id == store_id)
    if status:
        q = q.filter(UploadDraft.status == status)
    if source_type:
        q = q.filter(UploadDraft.source_type == source_type)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            UploadDraft.name.ilike(like)
            | UploadDraft.offer_id.ilike(like)
            | UploadDraft.source_name.ilike(like)
            | UploadDraft.source_sku.ilike(like)
        )
    return q.scalar() or 0


def create_draft(db: Session, data: dict) -> UploadDraft:
    obj = UploadDraft(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_draft(db: Session, draft_id: int, data: dict) -> Optional[UploadDraft]:
    obj = get_draft(db, draft_id)
    if not obj:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_draft(db: Session, draft_id: int) -> bool:
    obj = get_draft(db, draft_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def bulk_delete_drafts(db: Session, ids: list[int]) -> int:
    count = db.query(UploadDraft).filter(UploadDraft.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return count


def get_drafts_by_ids(db: Session, ids: list[int]) -> list[UploadDraft]:
    return db.query(UploadDraft).filter(UploadDraft.id.in_(ids)).all()


def get_drafts_by_store_and_status(db: Session, store_id: int, status: str) -> list[UploadDraft]:
    return (
        db.query(UploadDraft)
        .filter(UploadDraft.store_id == store_id, UploadDraft.status == status)
        .all()
    )

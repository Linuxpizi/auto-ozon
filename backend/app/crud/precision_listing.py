from typing import Optional
from sqlalchemy.orm import Session
from app.models.precision_listing import PrecisionListingTask
from app.schemas.precision_listing import PrecisionListingCreate, PrecisionListingUpdate


def get_tasks(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
) -> list[PrecisionListingTask]:
    q = db.query(PrecisionListingTask)
    if store_id is not None:
        q = q.filter(PrecisionListingTask.store_id == store_id)
    if status:
        q = q.filter(PrecisionListingTask.status == status)
    if mode:
        q = q.filter(PrecisionListingTask.mode == mode)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            PrecisionListingTask.source_name.ilike(like)
            | PrecisionListingTask.source_sku.ilike(like)
            | PrecisionListingTask.translated_name.ilike(like)
            | PrecisionListingTask.offer_id.ilike(like)
        )
    return q.order_by(PrecisionListingTask.id.desc()).offset(skip).limit(limit).all()


def count_tasks(
    db: Session,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    q = db.query(PrecisionListingTask)
    if store_id is not None:
        q = q.filter(PrecisionListingTask.store_id == store_id)
    if status:
        q = q.filter(PrecisionListingTask.status == status)
    if mode:
        q = q.filter(PrecisionListingTask.mode == mode)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            PrecisionListingTask.source_name.ilike(like)
            | PrecisionListingTask.source_sku.ilike(like)
            | PrecisionListingTask.translated_name.ilike(like)
            | PrecisionListingTask.offer_id.ilike(like)
        )
    return q.count()


def get_task(db: Session, task_id: int) -> Optional[PrecisionListingTask]:
    return db.query(PrecisionListingTask).filter(PrecisionListingTask.id == task_id).first()


def create_task(db: Session, data: PrecisionListingCreate) -> PrecisionListingTask:
    obj = PrecisionListingTask(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_task(db: Session, task_id: int, data: PrecisionListingUpdate) -> Optional[PrecisionListingTask]:
    obj = get_task(db, task_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_task(db: Session, task_id: int) -> bool:
    obj = get_task(db, task_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True

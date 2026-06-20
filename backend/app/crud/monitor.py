from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.monitor import StoreMonitor
from app.schemas.monitor import StoreMonitorCreate, StoreMonitorUpdate


def get_monitors(db: Session, store_id: Optional[int] = None) -> List[StoreMonitor]:
    query = db.query(StoreMonitor)
    if store_id is not None:
        query = query.filter(StoreMonitor.store_id == store_id)
    return query.order_by(StoreMonitor.date.desc()).all()


def get_monitor_summary(db: Session) -> List[dict]:
    """Aggregate latest monitor data per store."""
    from sqlalchemy import func
    sub = (
        db.query(
            StoreMonitor.store_id,
            func.max(StoreMonitor.date).label("max_date"),
        )
        .group_by(StoreMonitor.store_id)
        .subquery()
    )
    rows = (
        db.query(StoreMonitor)
        .join(
            sub,
            (StoreMonitor.store_id == sub.c.store_id)
            & (StoreMonitor.date == sub.c.max_date),
        )
        .all()
    )
    return [
        {
            "store_id": r.store_id,
            "store_name": r.store_name,
            "daily_remaining": r.daily_remaining,
            "total_remaining": r.total_remaining,
            "active_listings": r.active_listings,
            "date": r.date.isoformat(),
        }
        for r in rows
    ]


def create_monitor(db: Session, data: StoreMonitorCreate) -> StoreMonitor:
    obj = StoreMonitor(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_monitor(db: Session, monitor_id: int, data: StoreMonitorUpdate) -> Optional[StoreMonitor]:
    obj = db.query(StoreMonitor).filter(StoreMonitor.id == monitor_id).first()
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_monitor(db: Session, monitor_id: int) -> bool:
    obj = db.query(StoreMonitor).filter(StoreMonitor.id == monitor_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True

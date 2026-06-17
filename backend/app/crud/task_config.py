from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.task_config import TaskConfig
from app.schemas.task_config import TaskConfigCreate, TaskConfigUpdate


def list_task_configs(db: Session) -> List[TaskConfig]:
    return db.query(TaskConfig).order_by(TaskConfig.id).all()


def get_task_config(db: Session, task_key: str) -> Optional[TaskConfig]:
    return db.query(TaskConfig).filter(TaskConfig.task_key == task_key).first()


def create_task_config(db: Session, data: TaskConfigCreate) -> TaskConfig:
    obj = TaskConfig(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_task_config(db: Session, task_key: str, data: TaskConfigUpdate) -> Optional[TaskConfig]:
    obj = db.query(TaskConfig).filter(TaskConfig.task_key == task_key).first()
    if not obj:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj


def upsert_task_config(db: Session, data: TaskConfigCreate) -> TaskConfig:
    obj = db.query(TaskConfig).filter(TaskConfig.task_key == data.task_key).first()
    if obj:
        for key, val in data.model_dump().items():
            setattr(obj, key, val)
    else:
        obj = TaskConfig(**data.model_dump())
        db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def mark_task_run(db: Session, task_key: str, status: str) -> None:
    from datetime import datetime
    obj = db.query(TaskConfig).filter(TaskConfig.task_key == task_key).first()
    if obj:
        obj.last_run_at = datetime.utcnow()
        obj.last_status = status
        db.commit()

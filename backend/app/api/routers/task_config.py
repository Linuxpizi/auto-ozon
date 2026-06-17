from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.crud import task_config as tc_crud
from app.crud import store_sync_config as ssc_crud
from app.schemas.task_config import TaskConfigCreate, TaskConfigUpdate, TaskConfigRead
from app.schemas.store_sync_config import StoreSyncConfigUpdate, StoreSyncConfigRead
from app.core.db import get_db
from app.services.scheduler_service import register_job, remove_job, manual_trigger

router = APIRouter()


# ---- Task Configs ----

@router.get("/", response_model=List[TaskConfigRead])
def list_task_configs(db: Session = Depends(get_db)):
    return tc_crud.list_task_configs(db)


@router.get("/{task_key}", response_model=TaskConfigRead)
def get_task_config(task_key: str, db: Session = Depends(get_db)):
    obj = tc_crud.get_task_config(db, task_key)
    if not obj:
        raise HTTPException(404, "任务配置不存在")
    return obj


@router.put("/{task_key}", response_model=TaskConfigRead)
def update_task_config(task_key: str, data: TaskConfigUpdate, db: Session = Depends(get_db)):
    obj = tc_crud.update_task_config(db, task_key, data)
    if not obj:
        raise HTTPException(404, "任务配置不存在")
    # Sync to APScheduler
    if data.enabled is False:
        remove_job(task_key)
    else:
        register_job(obj)
    return obj


@router.post("/{task_key}/trigger")
def trigger_task(task_key: str, db: Session = Depends(get_db)):
    """Manually trigger a sync task."""
    obj = tc_crud.get_task_config(db, task_key)
    if not obj:
        raise HTTPException(404, "任务配置不存在")
    status = manual_trigger(task_key)
    return {"task_key": task_key, "status": status}


# ---- Store Sync Configs ----

@router.get("/store-sync-configs", response_model=List[StoreSyncConfigRead])
def list_store_sync_configs(db: Session = Depends(get_db)):
    return ssc_crud.list_store_sync_configs(db)


@router.put("/store-sync-configs/{store_id}", response_model=StoreSyncConfigRead)
def update_store_sync_config(store_id: int, data: StoreSyncConfigUpdate, db: Session = Depends(get_db)):
    return ssc_crud.upsert_store_sync_config(db, store_id, data)

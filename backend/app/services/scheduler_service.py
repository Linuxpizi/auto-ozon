"""APScheduler integration — manages scheduled task lifecycle.

The scheduler reads configuration from the task_configs table and
registers/updates/removes jobs at runtime.
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.crud.task_config import list_task_configs, create_task_config
from app.schemas.task_config import TaskConfigCreate
from app.services.sync_service import run_sync_task

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# --- Default task definitions ---

DEFAULT_TASKS = [
    TaskConfigCreate(
        task_key="sync_orders",
        name="同步订单",
        description="定时从 Ozon 拉取 FBS 订单数据",
        trigger_type="interval",
        interval_seconds=1800,  # 30 min
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_finance",
        name="同步流水",
        description="定时从 Ozon 拉取资金报表数据",
        trigger_type="interval",
        interval_seconds=3600,  # 60 min
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_warehouses",
        name="同步仓库",
        description="定时从 Ozon 同步仓库列表",
        trigger_type="interval",
        interval_seconds=86400,  # 24 hours
        enabled=False,
    ),
]


def _build_trigger(cfg):
    """Build APScheduler trigger from TaskConfig."""
    if cfg.trigger_type == "cron" and cfg.cron_expression:
        parts = cfg.cron_expression.strip().split()
        if len(parts) == 5:
            return CronTrigger(
                minute=parts[0], hour=parts[1], day=parts[2],
                month=parts[3], day_of_week=parts[4],
            )
        elif len(parts) == 6:
            return CronTrigger(
                second=parts[0], minute=parts[1], hour=parts[2],
                day=parts[3], month=parts[4], day_of_week=parts[5],
            )
    # default to interval
    return IntervalTrigger(seconds=cfg.interval_seconds or 1800)


def _job_func(task_key: str):
    """Callback for APScheduler — creates a DB session and runs sync."""
    db: Session = SessionLocal()
    try:
        run_sync_task(db, task_key)
    finally:
        db.close()


def register_job(cfg) -> None:
    """Register or update a single job in the scheduler."""
    job_id = cfg.task_key
    if scheduler.get_job(job_id):
        scheduler.reschedule_job(job_id, trigger=_build_trigger(cfg))
        if cfg.enabled and scheduler.get_job(job_id).next_run_time is None:
            scheduler.resume_job(job_id)
        elif not cfg.enabled:
            scheduler.pause_job(job_id)
        logger.info("Scheduler: updated job %s (enabled=%s)", job_id, cfg.enabled)
    elif cfg.enabled:
        scheduler.add_job(
            _job_func,
            trigger=_build_trigger(cfg),
            id=job_id,
            name=cfg.name,
            args=[job_id],
            replace_existing=True,
        )
        logger.info("Scheduler: added job %s", job_id)


def remove_job(task_key: str) -> None:
    """Remove a job from the scheduler."""
    if scheduler.get_job(task_key):
        scheduler.remove_job(task_key)
        logger.info("Scheduler: removed job %s", task_key)


def reload_all_jobs(db: Session) -> None:
    """Reload all enabled jobs from DB into the scheduler."""
    configs = list_task_configs(db)
    active_keys = set()
    for cfg in configs:
        register_job(cfg)
        active_keys.add(cfg.task_key)
    # Remove jobs that are no longer in DB
    for job in scheduler.get_jobs():
        if job.id not in active_keys:
            scheduler.remove_job(job.id)
    logger.info("Scheduler: reloaded %d jobs", len(configs))


def ensure_default_configs(db: Session) -> None:
    """Create default task configs if the table is empty."""
    existing = list_task_configs(db)
    if existing:
        return
    for cfg in DEFAULT_TASKS:
        create_task_config(db, cfg)
    db.commit()
    logger.info("Scheduler: created %d default task configs", len(DEFAULT_TASKS))


def manual_trigger(task_key: str) -> str:
    """Manually trigger a sync task immediately (runs in current thread)."""
    db: Session = SessionLocal()
    try:
        return run_sync_task(db, task_key)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# FastAPI lifespan hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context — initializes scheduler on startup, shuts down on exit."""
    logger.info("Scheduler: initializing...")
    db = SessionLocal()
    try:
        ensure_default_configs(db)
        reload_all_jobs(db)
    finally:
        db.close()
    scheduler.start()
    logger.info("Scheduler: started")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Scheduler: stopped")

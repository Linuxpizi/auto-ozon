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

# --- Default task definitions (staggered interval schedule) ---
# All tasks use interval triggers with different periods so they naturally
# drift apart and never execute at the same time. sync_orders has the
# shortest interval (highest priority).

DEFAULT_TASKS = [
    TaskConfigCreate(
        task_key="sync_orders",
        name="同步订单",
        description="定时从 Ozon 拉取 FBS 订单数据 (每30分钟)",
        trigger_type="interval",
        interval_seconds=1800,  # 30 min
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_finance",
        name="同步流水",
        description="定时从 Ozon 拉取资金报表数据 (每55分钟)",
        trigger_type="interval",
        interval_seconds=3300,  # 55 min
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_warehouses",
        name="同步仓库",
        description="定时从 Ozon 同步仓库列表 (每一周)",
        trigger_type="interval",
        interval_seconds=7 * 24 * 60 * 60,  # 1 周
        enabled=False,
    ),
    TaskConfigCreate(
        task_key="sync_monitors",
        name="同步监控",
        description="定时从 Ozon 同步商品库存快照 (每11小时)",
        trigger_type="interval",
        interval_seconds=39600,  # 11 h
        enabled=False,
    ),
    TaskConfigCreate(
        task_key="sync_seller_rating",
        name="同步卖家评级",
        description="定时从 Ozon 同步卖家评级 (每23小时)",
        trigger_type="interval",
        interval_seconds=82800,  # 23 h
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_products",
        name="同步商品列表",
        description="定时从 Ozon 同步商品列表 (每13小时)",
        trigger_type="interval",
        interval_seconds=46800,  # 13 h
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_fbs_error_index",
        name="同步FBS错误指数",
        description="定时从 Ozon 同步 FBS 错误指数 (每23小时)",
        trigger_type="interval",
        interval_seconds=82800,  # 23 h
        enabled=True,
    ),
    TaskConfigCreate(
        task_key="sync_return_orders",
        name="同步退货订单",
        description="定时从 Ozon 同步退货订单并推送飞书通知 (每5分钟)",
        trigger_type="interval",
        interval_seconds=60 * 60 * 6,  # 6 h
        enabled=True,
    ),
]


def _build_trigger(cfg):
    """Build APScheduler trigger from TaskConfig."""
    if cfg.trigger_type == "cron" and cfg.cron_expression:
        parts = cfg.cron_expression.strip().split()
        if len(parts) == 5:
            return CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
            )
        elif len(parts) == 6:
            return CronTrigger(
                second=parts[0],
                minute=parts[1],
                hour=parts[2],
                day=parts[3],
                month=parts[4],
                day_of_week=parts[5],
            )
    # default to interval
    return IntervalTrigger(seconds=cfg.interval_seconds or 1800)


def _job_func(task_key: str):
    """Callback for APScheduler — creates a DB session and runs sync."""
    logger.info("Scheduled job starting: %s", task_key)
    db: Session = SessionLocal()
    try:
        run_sync_task(db, task_key)
    except Exception as e:
        logger.error("Scheduled job %s FAILED: %s", task_key, e, exc_info=True)
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
            misfire_grace_time=300,
            coalesce=True,
            max_instances=1,
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
    """Create default task configs if the table is empty, or add missing ones.

    Also updates existing entries whose schedule parameters differ from defaults
    (e.g. migrating from interval to cron triggers).
    """
    existing = list_task_configs(db)
    existing_map = {c.task_key: c for c in existing}
    added = 0
    updated = 0
    for cfg in DEFAULT_TASKS:
        if cfg.task_key not in existing_map:
            create_task_config(db, cfg)
            added += 1
        else:
            obj = existing_map[cfg.task_key]
            changed = False
            if obj.trigger_type != cfg.trigger_type:
                obj.trigger_type = cfg.trigger_type
                changed = True
            if (
                cfg.trigger_type == "cron"
                and obj.cron_expression != cfg.cron_expression
            ):
                obj.cron_expression = cfg.cron_expression
                changed = True
            if (
                cfg.trigger_type == "interval"
                and obj.interval_seconds != cfg.interval_seconds
            ):
                obj.interval_seconds = cfg.interval_seconds
                changed = True
            if changed:
                obj.name = cfg.name
                obj.description = cfg.description
                updated += 1
    if added or updated:
        db.commit()
        if added:
            logger.info("Scheduler: added %d missing default task configs", added)
        if updated:
            logger.info(
                "Scheduler: updated %d default task configs to new schedule", updated
            )


def manual_trigger(task_key: str) -> str:
    """Manually trigger a sync task immediately (runs in current thread)."""
    logger.info("Manual trigger: %s", task_key)
    db: Session = SessionLocal()
    try:
        result = run_sync_task(db, task_key)
        logger.info("Manual trigger %s -> %s", task_key, result)
        return result
    except Exception as e:
        logger.error("Manual trigger %s FAILED: %s", task_key, e, exc_info=True)
        return "failed"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# FastAPI lifespan hooks
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context — initializes scheduler on startup, shuts down on exit."""
    global scheduler
    # AsyncIOScheduler keeps a reference to the event loop it was started on.
    # Recreate it for every application lifespan so TestClient restarts and
    # development reloads never reuse a closed loop from a previous run.
    scheduler = AsyncIOScheduler()
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

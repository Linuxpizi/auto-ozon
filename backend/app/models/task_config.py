from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.core.db import Base


class TaskConfig(Base):
    """Scheduled task configuration — one row per task type."""

    __tablename__ = "task_configs"

    id = Column(Integer, primary_key=True, index=True)
    task_key = Column(String(64), unique=True, nullable=False, comment="任务唯一标识")
    name = Column(String(128), nullable=False, comment="中文名称")
    description = Column(Text, default="", comment="描述")
    trigger_type = Column(String(16), nullable=False, default="interval", comment="interval / cron")
    interval_seconds = Column(Integer, default=1800, comment="interval 模式：间隔秒数")
    cron_expression = Column(String(64), default="", comment="cron 模式：cron 表达式")
    enabled = Column(Boolean, default=True, comment="是否启用")
    last_run_at = Column(DateTime, nullable=True, comment="最后执行时间")
    last_status = Column(String(16), default="", comment="success / failed")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

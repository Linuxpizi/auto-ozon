from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.core.db import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class FeishuConfig(Base):
    """Global Feishu (Lark) configuration — stores App ID and App Secret."""

    __tablename__ = "feishu_config"

    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(128), default="", comment="飞书应用 App ID")
    app_secret = Column(String(256), default="", comment="飞书应用 App Secret")
    chat_id = Column(String(128), default="", comment="目标群聊 Chat ID (oc_xxxx)")
    webhook_url = Column(String(512), default="", comment="飞书机器人 Webhook URL（备选）")
    enabled = Column(Integer, default=1, comment="是否启用: 0=禁用 1=启用")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

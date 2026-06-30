"""Prompt Template model for the YouTu Prompt Engine."""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from datetime import datetime, timezone
from app.core.db import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    platform = Column(String(32), nullable=False, index=True)  # "TB" | "OZON" | "..."
    language = Column(String(8), nullable=False, default="zh")  # "zh" | "ru" | "en"
    category = Column(String(64), nullable=True, index=True)  # e.g. "百货", "保温杯"
    version = Column(String(16), nullable=False, default="v1.0")
    model = Column(String(64), nullable=False, default="deepseek-chat")
    system_prompt = Column(Text, nullable=False)
    input_schema = Column(Text, nullable=True)  # JSON schema for input validation
    output_schema = Column(Text, nullable=True)  # JSON schema for output validation
    output_format = Column(String(16), nullable=False, default="JSON")
    is_active = Column(Boolean, nullable=False, default=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utc_now)
    updated_at = Column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)

    def __repr__(self) -> str:
        return f"<PromptTemplate {self.name} ({self.platform}/{self.language} {self.version})>"

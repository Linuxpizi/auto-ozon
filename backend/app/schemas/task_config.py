from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TaskConfigBase(BaseModel):
    task_key: str
    name: str
    description: str = ""
    trigger_type: str = "interval"
    interval_seconds: int = 1800
    cron_expression: str = ""
    enabled: bool = True


class TaskConfigCreate(TaskConfigBase):
    pass


class TaskConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_type: Optional[str] = None
    interval_seconds: Optional[int] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None


class TaskConfigRead(TaskConfigBase):
    id: int
    last_run_at: Optional[datetime] = None
    last_status: str = ""

    model_config = {"from_attributes": True}

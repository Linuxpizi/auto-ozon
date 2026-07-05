"""Schemas for PowerPaint image editing endpoints."""
from pydantic import BaseModel, Field


class PowerPaintResponse(BaseModel):
    url: str = Field(..., description="编辑后的图片 URL")
    original_url: str = Field(default="", description="原始图片 URL")
    task: str = Field(..., description="任务类型: remove / outpaint / inpaint")
    duration_ms: float = Field(default=0, description="推理耗时 (毫秒)")
    device: str = Field(default="", description="运行设备: cpu / cuda")


class PowerPaintDeviceResponse(BaseModel):
    device: str
    dtype: str
    model_dir: str
    model_exists: bool
    cuda_available: bool
    pipeline_loaded: bool = False
    pipeline_loading: bool = False

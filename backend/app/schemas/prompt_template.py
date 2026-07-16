"""Schemas for Prompt Template and Optimization endpoints."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── PromptTemplate schemas ──────────────────────────────────────────────

class PromptTemplateCreate(BaseModel):
    name: str = Field(..., max_length=128)
    platform: str = Field(..., description="TB | OZON | etc.")
    language: str = Field(default="zh", description="zh | ru | en")
    category: Optional[str] = None
    version: str = Field(default="v1.0")
    model: str = Field(default="deepseek-chat")
    system_prompt: str
    input_schema: Optional[str] = None
    output_schema: Optional[str] = None
    output_format: str = Field(default="JSON")
    is_active: bool = True
    description: Optional[str] = None


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    language: Optional[str] = None
    category: Optional[str] = None
    version: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    input_schema: Optional[str] = None
    output_schema: Optional[str] = None
    output_format: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class PromptTemplateRead(BaseModel):
    id: int
    name: str
    platform: str
    language: str
    category: Optional[str]
    version: str
    model: str
    system_prompt: str
    input_schema: Optional[str]
    output_schema: Optional[str]
    output_format: str
    is_active: bool
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Title Optimization schemas ──────────────────────────────────────────

class TitleOptimizeRequest(BaseModel):
    platform: str = Field(..., description="TB | OZON")
    language: str = Field(default="zh", description="zh | ru")
    category: Optional[str] = None
    brand: str = ""
    material: Optional[str] = None
    capacity: Optional[str] = None
    color: Optional[str] = None
    feature: List[str] = []
    source_language: Optional[str] = Field(default="zh")
    template_name: Optional[str] = Field(None, description="指定模板名称，否则自动路由")


class TitleOptimizeResponse(BaseModel):
    title: str
    title_ru: Optional[str] = None  # Ozon 俄语标题
    keywords: List[str] = []
    reason: Optional[str] = None
    seo_score: Optional[int] = None
    raw_output: Optional[str] = None  # 原始 LLM 输出，调试用


# ── Product Optimization schemas ────────────────────────────────────────

class ProductOptimizeRequest(BaseModel):
    platform: str = Field(..., description="TB | OZON")
    language: str = Field(default="zh", description="zh | ru")
    category: Optional[str] = None
    title: str = ""
    brand: str = ""
    description: Optional[str] = None
    features: List[str] = []
    template_name: Optional[str] = Field(None, description="指定模板名称，否则自动路由")


class ProductOptimizeResponse(BaseModel):
    title: Optional[str] = None
    title_ru: Optional[str] = None
    selling_points: List[str] = []
    description: Optional[str] = None
    usage_scenarios: List[str] = []
    target_audience: Optional[str] = None
    faq: List[Dict[str, str]] = []
    keywords: List[str] = []
    notes: Optional[str] = None
    raw_output: Optional[str] = None

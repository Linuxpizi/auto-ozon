"""Schemas for AI Translation and Optimization endpoints."""
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Single Text Translate ───────────────────────────────────────────────

class AITranslateRequest(BaseModel):
    text: str = Field(..., description="待翻译文本 (中文)")
    source_lang: str = Field(default="zh", description="源语言")
    target_lang: str = Field(default="ru", description="目标语言")
    context: Optional[str] = Field(None, description="上下文提示(如商品类目、品牌等)")
    field_type: str = Field(default="title", description="字段类型: title / description")


class AITranslateResponse(BaseModel):
    original: str
    translated: str
    raw_output: Optional[str] = None


# ── Batch Translate (multiple fields) ──────────────────────────────────

class AIBatchTranslateItem(BaseModel):
    key: str = Field(..., description="字段标识, 如 'title', 'color', 'material'")
    text: str = Field(..., description="待翻译文本")
    field_type: str = Field(default="description", description="字段类型: title / description")


class AIBatchTranslateRequest(BaseModel):
    items: List[AIBatchTranslateItem] = Field(..., min_length=1, description="待翻译条目列表")
    source_lang: str = Field(default="zh")
    target_lang: str = Field(default="ru")
    context: Optional[str] = Field(None, description="上下文提示")


class AIBatchTranslateItemResponse(BaseModel):
    key: str
    original: str
    translated: str


class AIBatchTranslateResponse(BaseModel):
    items: List[AIBatchTranslateItemResponse]
    raw_output: Optional[str] = None


# ── Description Optimize ───────────────────────────────────────────────

class AIOptimizeDescriptionRequest(BaseModel):
    title: str = Field(default="", description="商品标题")
    description: str = Field(default="", description="商品描述")
    field_type: str = Field(default="description", description="优化目标: title / description")
    platform: str = Field(default="OZON", description="目标平台")
    language: str = Field(default="ru", description="目标语言")
    context: Optional[str] = Field(None, description="额外优化要求")


class AIOptimizeDescriptionResponse(BaseModel):
    description: str = ""
    selling_points: List[str] = []
    keywords: List[str] = []
    raw_output: Optional[str] = None


# ── Image Translate (Chinese → Russian text on image) ───────────────────

class AIImageTranslateRequest(BaseModel):
    image_url: str = Field(..., description="原始图片URL或base64")
    context: Optional[str] = Field(None, description="商品类目/品牌上下文")


class AIImageTranslateResponse(BaseModel):
    original_url: str
    result_url: str
    raw_output: Optional[str] = None


# ── Image Subject Replace ───────────────────────────────────────────────

class AIImageReplaceRequest(BaseModel):
    image_url: str = Field(..., description="原始图片URL或base64")
    prompt: str = Field(..., description="替换描述, e.g. 'white background product photo'")
    size: str = Field(default="1024x1024", description="输出尺寸")


class AIImageReplaceResponse(BaseModel):
    original_url: str
    result_url: str
    raw_output: Optional[str] = None


# ── Image Generation ────────────────────────────────────────────────────

class AIImageGenerateRequest(BaseModel):
    title: str = Field(default="", description="商品标题")
    category: Optional[str] = Field(None, description="商品类目")
    style: Optional[str] = Field(None, description="风格偏好, e.g. 'minimalist, white background'")
    count: int = Field(default=3, description="生成数量, 最多4")
    size: str = Field(default="1024x1024", description="输出尺寸")


class AIImageGenerateResponse(BaseModel):
    images: List[str] = Field(default_factory=list, description="生成的图片URL列表")
    prompt_used: Optional[str] = None
    raw_output: Optional[str] = None

"""AI Text API router — translate, translate-batch, optimize-description"""
from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    AITranslateRequest,
    AITranslateResponse,
    AIBatchTranslateRequest,
    AIBatchTranslateResponse,
    AIOptimizeDescriptionRequest,
    AIOptimizeDescriptionResponse,
)
from app.services import ai_translate_service

router = APIRouter()


@router.post("/translate", response_model=AITranslateResponse)
def translate(body: AITranslateRequest):
    """翻译单条文本 (标题/描述/属性)"""
    try:
        return ai_translate_service.translate_text(body)
    except Exception as e:
        raise HTTPException(500, f"翻译失败: {e}")


@router.post("/translate-batch", response_model=AIBatchTranslateResponse)
def translate_batch(body: AIBatchTranslateRequest):
    """批量翻译多条文本 (属性列表等)"""
    try:
        return ai_translate_service.translate_batch(body)
    except Exception as e:
        raise HTTPException(500, f"批量翻译失败: {e}")


@router.post("/optimize-description", response_model=AIOptimizeDescriptionResponse)
def optimize_description(body: AIOptimizeDescriptionRequest):
    """优化商品描述 (AI优化)"""
    try:
        return ai_translate_service.optimize_description(body)
    except Exception as e:
        raise HTTPException(500, f"描述优化失败: {e}")

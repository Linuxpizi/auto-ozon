"""AI Image API router — image translate, replace, generate"""
from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    AIImageTranslateRequest,
    AIImageTranslateResponse,
    AIImageReplaceRequest,
    AIImageReplaceResponse,
    AIImageGenerateRequest,
    AIImageGenerateResponse,
)
from app.services import image_service

router = APIRouter()


@router.post("/translate-image", response_model=AIImageTranslateResponse)
async def api_translate_image(req: AIImageTranslateRequest):
    """Translate Chinese text on an image to Russian using GPT Image Edit."""
    try:
        return image_service.translate_image(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace-image-subject", response_model=AIImageReplaceResponse)
async def api_replace_image_subject(req: AIImageReplaceRequest):
    """Replace the subject/background of a product image."""
    try:
        return image_service.replace_image_subject(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-image", response_model=AIImageGenerateResponse)
async def api_generate_image(req: AIImageGenerateRequest):
    """Generate product images from text description."""
    try:
        return image_service.generate_image(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""Image edit router — unified editing, remove-bg, expand, upscale, chain endpoints."""
from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.schemas.image_edit import (
    EditChainRequest,
    EditChainResponse,
    ImageEditRequest,
    ImageEditResponse,
    ImageRemoveBgRequest,
    ImageRemoveBgResponse,
    ImageExpandRequest,
    ImageExpandResponse,
    ImageUpscaleRequest,
    ImageUpscaleResponse,
)
from app.services import image_edit_service
from app.services.image_edit_service import ImageEditServiceError

router = APIRouter()


def _raise_image_edit_http_error(exc: Exception) -> None:
    """Preserve service-provided status codes and return actionable messages."""
    status_code = exc.status_code if isinstance(exc, ImageEditServiceError) else 500
    raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.post("/edit", response_model=ImageEditResponse)
async def api_edit_image(req: ImageEditRequest):
    """Unified image editing — natural language instructions with optional mask."""
    try:
        return await run_in_threadpool(image_edit_service.edit_image, req)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/edit-chain", response_model=EditChainResponse)
async def api_edit_chain(req: EditChainRequest):
    """Multi-step composite editing — execute a sequence of actions in one request.

    Each action uses the previous action's output as its input,
    dramatically reducing token waste compared to N separate round-trips.
    """
    try:
        return await run_in_threadpool(image_edit_service.edit_chain, req)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/remove-bg", response_model=ImageRemoveBgResponse)
async def api_remove_background(req: ImageRemoveBgRequest):
    """Remove image background (white/transparent)."""
    try:
        return await run_in_threadpool(image_edit_service.remove_background, req)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/expand", response_model=ImageExpandResponse)
async def api_expand_image(req: ImageExpandRequest):
    """AI expand image edges (outpainting)."""
    try:
        return await run_in_threadpool(image_edit_service.expand_image, req)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/upscale", response_model=ImageUpscaleResponse)
async def api_upscale_image(req: ImageUpscaleRequest):
    """High-resolution upscale."""
    try:
        return await run_in_threadpool(image_edit_service.upscale_image, req)
    except Exception as e:
        _raise_image_edit_http_error(e)

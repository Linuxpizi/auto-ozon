"""PowerPaint API router — image editing via CPU/GPU inference."""
import logging
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.schemas.powerpaint import PowerPaintResponse, PowerPaintDeviceResponse
from app.services import powerpaint_service

router = APIRouter(prefix="/api/powerpaint", tags=["powerpaint"])
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "edited"


def _save_result(data: bytes, prefix: str) -> str:
    """Save result image to static/edited/ and return URL path."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    (STATIC_DIR / name).write_bytes(data)
    return f"/static/edited/{name}"


@router.get("/device", response_model=PowerPaintDeviceResponse)
async def api_device_info():
    """Get current device status (CPU/GPU) and model info."""
    return powerpaint_service.get_device_info()


@router.post("/remove", response_model=PowerPaintResponse)
async def api_remove_object(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(""),
    num_inference_steps: int = Form(50),
    guidance_scale: float = Form(7.5),
):
    """去除图片中的物体 (Object Removal)"""
    try:
        img_bytes = await image.read()
        mask_bytes = await mask.read()
        result, duration = await powerpaint_service.remove_object(
            img_bytes, mask_bytes, prompt, num_inference_steps, guidance_scale
        )
        url = _save_result(result, "remove")
        return PowerPaintResponse(
            url=url, original_url="", task="remove",
            duration_ms=round(duration, 1), device=powerpaint_service._device or "unknown",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("PowerPaint remove failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outpaint", response_model=PowerPaintResponse)
async def api_outpaint(
    image: UploadFile = File(...),
    horizontal_ratio: float = Form(0.5),
    vertical_ratio: float = Form(0.5),
    num_inference_steps: int = Form(50),
    guidance_scale: float = Form(7.5),
):
    """图片边缘智能扩展 (Image Outpainting)"""
    try:
        img_bytes = await image.read()
        result, duration = await powerpaint_service.outpaint_image(
            img_bytes, horizontal_ratio, vertical_ratio, num_inference_steps, guidance_scale
        )
        url = _save_result(result, "outpaint")
        return PowerPaintResponse(
            url=url, original_url="", task="outpaint",
            duration_ms=round(duration, 1), device=powerpaint_service._device or "unknown",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("PowerPaint outpaint failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inpaint", response_model=PowerPaintResponse)
async def api_inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
    num_inference_steps: int = Form(50),
    guidance_scale: float = Form(7.5),
):
    """文本引导区域修复 (Text-Guided Inpainting)"""
    try:
        img_bytes = await image.read()
        mask_bytes = await mask.read()
        result, duration = await powerpaint_service.inpaint_region(
            img_bytes, mask_bytes, prompt, num_inference_steps, guidance_scale
        )
        url = _save_result(result, "inpaint")
        return PowerPaintResponse(
            url=url, original_url="", task="inpaint",
            duration_ms=round(duration, 1), device=powerpaint_service._device or "unknown",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("PowerPaint inpaint failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

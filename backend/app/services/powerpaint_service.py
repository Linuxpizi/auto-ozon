"""PowerPaint Service — CPU-first with automatic GPU detection.

Uses OpenMMLab/PowerPaint for image editing tasks:
- Object Removal (去物体/水印)
- Image Outpainting (图片比例扩展)
- Image Inpainting (区域修复)
"""

import io
import logging
import os
import time
from pathlib import Path

import torch
from PIL import Image

logger = logging.getLogger(__name__)

# ── Model directory ─────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
POWERPAINT_MODEL_DIR = MODELS_DIR / "powerpaint-v1"

# ── Global pipeline singleton ───────────────────────────────────────────
_pipe = None
_device: str | None = None
_dtype: torch.dtype | None = None


def _detect_device() -> tuple[str, torch.dtype]:
    """Auto-detect available device: GPU (CUDA) if available, else CPU."""
    if torch.cuda.is_available():
        device = "cuda"
        dtype = torch.float16
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_mem / (1024**3)
        logger.info(
            "PowerPaint: GPU detected — %s (%.1f GB), using float16", gpu_name, gpu_mem
        )
    else:
        device = "cpu"
        dtype = torch.float32
        logger.info("PowerPaint: No GPU found, running on CPU with float32 (slower)")
    return device, dtype


def _get_pipe():
    """Lazy-load PowerPaint pipeline. CPU by default, GPU if available."""
    global _pipe, _device, _dtype, _pipeline_loading
    if _pipe is not None:
        return _pipe

        _device, _dtype = _detect_device()

        try:
            # Try importing from local powerpaint package first (if installed)
            from powerpaint.ppt_pipeline import PowerPaintPipeline

            _pipe = PowerPaintPipeline.from_pretrained(str(POWERPAINT_MODEL_DIR))
            _pipe = _pipe.to(device=_device, dtype=_dtype)
            logger.info("PowerPaint: loaded via PowerPaintPipeline")
        except ImportError:
            # Fallback: use diffusers StableDiffusionInpaintPipeline
            logger.info(
                "PowerPaint: powerpaint package not found, using diffusers fallback"
            )
            from diffusers import StableDiffusionInpaintPipeline

            _pipe = StableDiffusionInpaintPipeline.from_pretrained(
                str(POWERPAINT_MODEL_DIR),
                torch_dtype=_dtype,
            )
            _pipe = _pipe.to(_device)

        # CPU optimizations: enable attention slicing for memory efficiency
        if _device == "cpu":
            try:
                _pipe.enable_attention_slicing()
                logger.info("PowerPaint: attention slicing enabled for CPU")
            except Exception:
                pass

        logger.info("PowerPaint: model loaded on %s (%s)", _device, _dtype)
        return _pipe


def get_device_info() -> dict:
    """Return current device status for health check / frontend display."""
    global _device, _dtype, _pipeline_loading
    # Auto-detect if not yet determined (without loading the full pipeline)
    if _device is None:
        _device, _dtype = _detect_device()
    return {
        "device": _device or "not_loaded",
        "dtype": str(_dtype) if _dtype else "not_loaded",
        "model_dir": str(POWERPAINT_MODEL_DIR),
        "model_exists": POWERPAINT_MODEL_DIR.exists(),
        "cuda_available": torch.cuda.is_available(),
        "pipeline_loaded": _pipe is not None,
    }


# ── Core operations ─────────────────────────────────────────────────────


async def remove_object(
    image_bytes: bytes,
    mask_bytes: bytes,
    prompt: str = "",
    num_inference_steps: int = 50,
    guidance_scale: float = 7.5,
) -> tuple[bytes, float]:
    """Remove object from image using mask. Returns (result_bytes, duration_ms)."""
    t0 = time.time()
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

    # Resize mask to match image if needed
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.LANCZOS)

    result = pipe(
        image=image,
        mask_image=mask,
        prompt=prompt or "clean background, no objects",
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).images[0]

    duration = (time.time() - t0) * 1000
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    logger.info("PowerPaint remove_object: %.0fms on %s", duration, _device)
    return buf.getvalue(), duration


async def outpaint_image(
    image_bytes: bytes,
    horizontal_ratio: float = 0.5,
    vertical_ratio: float = 0.5,
    num_inference_steps: int = 50,
    guidance_scale: float = 7.5,
) -> tuple[bytes, float]:
    """Expand image edges intelligently. Returns (result_bytes, duration_ms)."""
    t0 = time.time()
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    orig_w, orig_h = image.size
    new_w = int(orig_w * (1 + horizontal_ratio))
    new_h = int(orig_h * (1 + vertical_ratio))

    # Create a black canvas of the target size, paste original in center
    expanded = Image.new("RGB", (new_w, new_h), (255, 255, 255))
    offset_x = (new_w - orig_w) // 2
    offset_y = (new_h - orig_h) // 2
    expanded.paste(image, (offset_x, offset_y))

    # Create mask: white = area to fill (edges)
    mask = Image.new("L", (new_w, new_h), 255)
    mask.paste(0, (offset_x, offset_y, offset_x + orig_w, offset_y + orig_h))

    result = pipe(
        image=expanded,
        mask_image=mask,
        prompt="seamless extension of the original image, consistent style",
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).images[0]

    duration = (time.time() - t0) * 1000
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    logger.info(
        "PowerPaint outpaint: %dx%d → %dx%d, %.0fms on %s",
        orig_w,
        orig_h,
        new_w,
        new_h,
        duration,
        _device,
    )
    return buf.getvalue(), duration


async def inpaint_region(
    image_bytes: bytes,
    mask_bytes: bytes,
    prompt: str,
    num_inference_steps: int = 50,
    guidance_scale: float = 7.5,
) -> tuple[bytes, float]:
    """Text-guided region fill. Returns (result_bytes, duration_ms)."""
    t0 = time.time()
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

    if mask.size != image.size:
        mask = mask.resize(image.size, Image.LANCZOS)

    result = pipe(
        image=image,
        mask_image=mask,
        prompt=prompt,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).images[0]

    duration = (time.time() - t0) * 1000
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    logger.info("PowerPaint inpaint: %.0fms on %s", duration, _device)
    return buf.getvalue(), duration

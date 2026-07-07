"""AI Image Service — image translation, subject replacement, and generation via GPT Image."""
import base64
import logging
import os
import uuid
from pathlib import Path

from openai import OpenAI

from app.core.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL
from app.schemas.ai import (
    AIImageTranslateRequest,
    AIImageTranslateResponse,
    AIImageReplaceRequest,
    AIImageReplaceResponse,
    AIImageGenerateRequest,
    AIImageGenerateResponse,
)

logger = logging.getLogger(__name__)

# ── Output directory for generated images ────────────────────────────────
STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "images"


def _get_image_client() -> OpenAI:
    """Create an OpenAI client configured for image operations."""
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


def _save_image_result(image_data: bytes, prefix: str = "ai_img") -> str:
    """Save image bytes to static/images/ and return relative URL."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    filepath = STATIC_DIR / filename
    filepath.write_bytes(image_data)
    return f"/static/images/{filename}"


def _load_image_as_b64(image_url: str) -> str:
    """Load image from URL or return as-is if already base64."""
    if image_url.startswith("data:"):
        # Already base64 data URI
        return image_url.split(",", 1)[1]
    elif image_url.startswith("http"):
        import httpx
        resp = httpx.get(image_url, timeout=30)
        resp.raise_for_status()
        return base64.b64encode(resp.content).decode()
    elif os.path.isfile(image_url):
        with open(image_url, "rb") as f:
            return base64.b64encode(f.read()).decode()
    else:
        # Assume it's raw base64
        return image_url


# ── Image Translate ──────────────────────────────────────────────────────

def translate_image(req: AIImageTranslateRequest) -> AIImageTranslateResponse:
    """
    Replace Chinese text on an image with Russian text using GPT Image Edit.
    Uses OpenAI Images Edit API.
    """
    client = _get_image_client()
    b64_data = _load_image_as_b64(req.image_url)

    prompt = (
        "Replace ALL Chinese text on this image with Russian text. "
        "Keep the exact same layout, colors, fonts style, product appearance, "
        "and design. Only change the text characters from Chinese to Russian. "
        "Ensure the Russian text is natural and accurate."
    )
    if req.context:
        prompt += f"\nContext: {req.context}"

    try:
        import httpx as _httpx
        import tempfile

        # Decode base64 to bytes for the edit API
        image_bytes = base64.b64decode(b64_data)

        # Save to temp file for the upload
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=prompt,
                    n=1,
                    size="1024x1024",
                )

            # Extract the image data
            image_data = result.data[0]
            if hasattr(image_data, "b64_json") and image_data.b64_json:
                img_bytes = base64.b64decode(image_data.b64_json)
                result_url = _save_image_result(img_bytes, prefix="translate")
            elif hasattr(image_data, "url") and image_data.url:
                result_url = image_data.url
            else:
                result_url = ""

            return AIImageTranslateResponse(
                original_url=req.image_url,
                result_url=result_url,
                raw_output=str(result),
            )
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Image translate failed: {e}")
        return AIImageTranslateResponse(
            original_url=req.image_url,
            result_url="",
            raw_output=str(e),
        )


# ── Image Subject Replace ───────────────────────────────────────────────

def replace_image_subject(req: AIImageReplaceRequest) -> AIImageReplaceResponse:
    """
    Replace the subject/background of an image using GPT Image Edit.
    Uses OpenAI Images Edit API.
    """
    client = _get_image_client()
    b64_data = _load_image_as_b64(req.image_url)

    prompt = (
        f"Transform this image: {req.prompt}. "
    )

    try:
        import tempfile

        image_bytes = base64.b64decode(b64_data)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=prompt,
                    n=1,
                    size=req.size,
                )

            image_data = result.data[0]
            if hasattr(image_data, "b64_json") and image_data.b64_json:
                img_bytes = base64.b64decode(image_data.b64_json)
                result_url = _save_image_result(img_bytes, prefix="replace")
            elif hasattr(image_data, "url") and image_data.url:
                result_url = image_data.url
            else:
                result_url = ""

            return AIImageReplaceResponse(
                original_url=req.image_url,
                result_url=result_url,
                raw_output=str(result),
            )
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Image replace failed: {e}")
        return AIImageReplaceResponse(
            original_url=req.image_url,
            result_url="",
            raw_output=str(e),
        )


# ── Image Generation ────────────────────────────────────────────────────

def generate_image(req: AIImageGenerateRequest) -> AIImageGenerateResponse:
    """
    Generate product images from text description using GPT Image Generation.
    Uses OpenAI Images Generation API.
    """
    client = _get_image_client()

    # Build prompt from product info
    parts = []
    if req.title:
        parts.append(f"Product: {req.title}")
    if req.category:
        parts.append(f"Category: {req.category}")
    if req.style:
        parts.append(f"Style: {req.style}")

    if parts:
        prompt = "Professional e-commerce product photo. " + ". ".join(parts) + ". White background, studio lighting, high resolution."
    else:
        prompt = "Professional e-commerce product photo with white background, studio lighting, high resolution."

    try:
        count = min(req.count, 4)
        result = client.images.generate(
            model=OPENAI_IMAGE_MODEL,
            prompt=prompt,
            n=count,
            size=req.size,
        )

        images = []
        for img_data in result.data:
            if hasattr(img_data, "b64_json") and img_data.b64_json:
                img_bytes = base64.b64decode(img_data.b64_json)
                url = _save_image_result(img_bytes, prefix="gen")
                images.append(url)
            elif hasattr(img_data, "url") and img_data.url:
                images.append(img_data.url)

        return AIImageGenerateResponse(
            images=images,
            prompt_used=prompt,
            raw_output=str(result),
        )

    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        return AIImageGenerateResponse(
            images=[],
            prompt_used=prompt,
            raw_output=str(e),
        )

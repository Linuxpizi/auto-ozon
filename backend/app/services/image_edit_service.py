"""Unified image editing service — wraps GPT Image Edit API for edit/remove-bg/expand/upscale."""
import base64
import io
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image
from openai import OpenAI

from app.core.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL
from app.schemas.image_edit import (
    EditAction,
    EditChainRequest,
    EditChainResponse,
    OUTPUT_PRESETS,
    GPT_SIZE_MAP,
    ImageEditRequest,
    ImageEditResponse,
    ImageExpandRequest,
    ImageExpandResponse,
    ImageRemoveBgRequest,
    ImageRemoveBgResponse,
    ImageUpscaleRequest,
    ImageUpscaleResponse,
)

logger = logging.getLogger(__name__)

# ── Directories ─────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
IMAGES_DIR = STATIC_DIR / "images"
VERSIONS_DIR = STATIC_DIR / "image_versions"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ─────────────────────────────────────────────────────────────


def _get_client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


def _save_image(data: bytes, prefix: str = "edit") -> str:
    """Save image bytes and return relative URL."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    filepath = IMAGES_DIR / filename
    filepath.write_bytes(data)
    return f"/static/images/{filename}"


def _load_image_bytes(image_url: str) -> bytes:
    """Load image from URL / base64 / file path and return bytes."""
    if image_url.startswith("data:"):
        b64_str = image_url.split(",", 1)[1]
        return base64.b64decode(b64_str)
    elif image_url.startswith("http"):
        import httpx

        resp = httpx.get(image_url, timeout=30)
        resp.raise_for_status()
        return resp.content
    # Resolve relative /static/... paths to the actual static directory
    elif image_url.startswith("/static/"):
        # /static/images/filename.png → IMAGES_DIR / filename
        rel = image_url.lstrip("/static/")
        filepath = STATIC_DIR / rel
        if filepath.is_file():
            return filepath.read_bytes()
        # fallback to old IMAGES_DIR layout
        filename = os.path.basename(image_url)
        filepath = IMAGES_DIR / filename
        if filepath.is_file():
            return filepath.read_bytes()
        raise FileNotFoundError(f"Cannot resolve static path: {image_url} (tried {STATIC_DIR / rel}, {IMAGES_DIR / filename})")
    elif os.path.isfile(image_url):
        with open(image_url, "rb") as f:
            return f.read()
    else:
        return base64.b64decode(image_url)


def _resolve_gpt_size(preset: str) -> str:
    """Map output preset to GPT API size string."""
    return GPT_SIZE_MAP.get(preset, "1024x1024")


def _resolve_target_size(
    preset: str,
    custom_w: Optional[int] = None,
    custom_h: Optional[int] = None,
) -> Tuple[int, int]:
    """Return (width, height) for final crop."""
    if custom_w and custom_h:
        return custom_w, custom_h
    p = OUTPUT_PRESETS.get(preset, OUTPUT_PRESETS["ozon_main"])
    return p["width"], p["height"]


def _crop_to_size(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale to cover target, then center-crop."""
    w, h = img.size
    scale = max(target_w / w, target_h / h)
    new_w, new_h = int(w * scale), int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return img.crop((left, top, left + target_w, top + target_h))


def _compress_image(img: Image.Image, quality: int = 90, max_bytes: int = 5 * 1024 * 1024) -> bytes:
    """Compress to JPEG/PNG under max_bytes."""
    if img.mode == "RGBA":
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        if len(data) <= max_bytes:
            return data
        # Fallback: convert to RGB and JPEG
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    data = buf.getvalue()
    # If still too large, reduce quality iteratively
    q = quality
    while len(data) > max_bytes and q > 30:
        q -= 10
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        data = buf.getvalue()
    return data


def _result_to_bytes(result) -> bytes:
    """Extract image bytes from OpenAI API result."""
    img_data = result.data[0]
    if hasattr(img_data, "b64_json") and img_data.b64_json:
        return base64.b64decode(img_data.b64_json)
    elif hasattr(img_data, "url") and img_data.url:
        import httpx

        resp = httpx.get(img_data.url, timeout=30)
        resp.raise_for_status()
        return resp.content
    raise ValueError("API returned no image data")


def _enhance_prompt(base_prompt: str, context: Optional[str] = None) -> str:
    """Append e-commerce context to prompt."""
    parts = [base_prompt]
    if context:
        parts.append(f"Context: {context}")
    parts.append("Maintain professional e-commerce product photography standards.")
    parts.append("Keep the product as the clear focal point.")
    return "\n".join(parts)


# ── Core: Unified Edit ─────────────────────────────────────────────────


def edit_image(req: ImageEditRequest) -> ImageEditResponse:
    """Core edit: natural language instruction + optional mask."""
    client = _get_client()
    image_bytes = _load_image_bytes(req.image_url)
    prompt = _enhance_prompt(req.prompt, req.context)
    gpt_size = _resolve_gpt_size(req.output_preset)
    target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        mask_file = None
        mask_path = None
        if req.mask:
            # mask is base64 (white=edit area, black=keep)
            mask_bytes = base64.b64decode(req.mask.split(",", 1)[1] if req.mask.startswith("data:") else req.mask)
            mask_path = tmp_path + "_mask.png"
            with open(mask_path, "wb") as f:
                f.write(mask_bytes)
            mask_file = open(mask_path, "rb")

        try:
            with open(tmp_path, "rb") as img_file:
                kwargs = dict(model=OPENAI_IMAGE_MODEL, image=img_file, prompt=prompt, n=1, size=gpt_size)
                if mask_file:
                    kwargs["mask"] = mask_file
                result = client.images.edit(**kwargs)

            raw_bytes = _result_to_bytes(result)
            # Crop and compress
            img = Image.open(io.BytesIO(raw_bytes))
            img = _crop_to_size(img, target_w, target_h)
            final_bytes = _compress_image(img, quality=req.quality)
            result_url = _save_image(final_bytes, prefix="edit")

            from app.services.image_version_service import create_version

            version_id = create_version(
                description=req.prompt[:40] + ("..." if len(req.prompt) > 40 else ""),
                image_bytes=final_bytes,
                prompt=req.prompt,
                output_size=f"{target_w}x{target_h}",
            )

            return ImageEditResponse(
                original_url=req.image_url,
                result_url=result_url,
                version_id=version_id,
                output_size=f"{target_w}x{target_h}",
                file_size_kb=len(final_bytes) // 1024,
            )
        finally:
            os.unlink(tmp_path)
            if mask_file:
                mask_file.close()
            if mask_path and os.path.exists(mask_path):
                os.unlink(mask_path)

    except Exception as e:
        logger.error("Image edit failed: %s", e)
        raise


# ── Multi-step Composite Edit Chain ────────────────────────────────────

IMAGE_QUALITY = 90


def _bbox_to_mask(image_bytes: bytes, bbox: dict) -> str:
    """Convert normalized bbox {x1,y1,x2,y2} to a white-on-black base64 mask.

    The mask has the same dimensions as the source image; the bbox region is
    white (255), the rest is black (0). Returns a data-URI base64 PNG string.
    """
    from PIL import ImageDraw

    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    x1 = int(bbox["x1"] * w)
    y1 = int(bbox["y1"] * h)
    x2 = int(bbox["x2"] * w)
    y2 = int(bbox["y2"] * h)
    # Clamp to image bounds
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle([x1, y1, x2, y2], fill=255)
    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _resolve_mask(image_bytes: bytes, action: EditAction) -> Optional[str]:
    """Resolve mask_data from an action: use explicit mask_data, or generate
    from bbox if present. Returns None if neither is available."""
    if action.mask_data:
        return action.mask_data
    if action.bbox:
        return _bbox_to_mask(image_bytes, action.bbox)
    return None


def _composite_masks(mask_uris: list[str], image_bytes: bytes) -> str:
    """OR-composite multiple base64 mask images into one mask.
    All white pixels from any mask become white in the output.
    Returns a data-URI base64 PNG string."""
    bg = None
    for uri in mask_uris:
        b64_data = uri.split(",", 1)[1] if uri.startswith("data:") else uri
        mask_data = base64.b64decode(b64_data)
        mask_img = Image.open(io.BytesIO(mask_data)).convert("L")
        if bg is None:
            bg = Image.new("L", mask_img.size, 0)
        # OR composite: pixel = max(existing, this_mask)
        bg = Image.composite(mask_img, bg, mask_img) if bg else mask_img

    if bg is None:
        bg = Image.new("L", Image.open(io.BytesIO(image_bytes)).size, 0)
    buf = io.BytesIO()
    bg.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _merge_prompts(actions: list[EditAction]) -> str:
    """Merge prompts from multiple mask-based actions into one instruction."""
    prompts = [a.prompt for a in actions if a.prompt]
    unique = list(dict.fromkeys(prompts))  # preserve order, deduplicate
    if not unique:
        return "Edit the selected regions in this image naturally."
    if len(unique) == 1:
        return unique[0]
    # Multiple different prompts → combine instructions
    parts = []
    for p in unique:
        p_stripped = p.strip().rstrip(".")
        parts.append(p_stripped)
    return " | ".join(parts)


def _is_mask_action(action_type: str) -> bool:
    """Return True if the action type uses a mask (brush or rect)."""
    return action_type in ("brush", "rect")


def edit_chain(req: EditChainRequest) -> EditChainResponse:
    """Execute multiple edit actions with batched AI calls.

    **Batching logic** — consecutive mask-based actions (brush/rect) are
    merged into ONE AI call by OR-compositing their masks. Non-mask actions
    (remove_bg, upscale, expand, prompt) execute sequentially.

    This drastically reduces AI API calls: 3× rect = 1 call instead of 3.
    """
    if not req.actions:
        raise ValueError("edit_chain requires at least one action")

    current_image_url = req.image_url
    target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

    # ── Step 1: Compile the execution plan ──────────────────────────────
    # Group consecutive mask-based actions into batches; keep other actions
    # as individual steps.
    execution_plan: list[dict] = []
    i = 0
    actions = req.actions
    total = len(actions)
    while i < total:
        if _is_mask_action(actions[i].type):
            # Gather consecutive mask-based actions
            batch = []
            while i < total and _is_mask_action(actions[i].type):
                batch.append(actions[i])
                i += 1
            execution_plan.append({"type": "mask_batch", "actions": batch})
        else:
            execution_plan.append({"type": "single", "action": actions[i]})
            i += 1

    # ── Step 2: Execute the plan ────────────────────────────────────────
    step_counter = 0
    for plan_item in execution_plan:
        if plan_item["type"] == "mask_batch":
            batch = plan_item["actions"]
            step_counter += len(batch)
            logger.info(
                "EditChain mask-batch %d/%d: %d actions (types=%s)",
                step_counter - len(batch) + 1, total,
                len(batch), [a.type for a in batch],
            )

            # Load the current image once (shared by all actions in the batch)
            img_bytes = _load_image_bytes(current_image_url)

            # Resolve all masks and composite them into one
            mask_uris = []
            for act in batch:
                mask = _resolve_mask(img_bytes, act)
                if mask:
                    mask_uris.append(mask)
            if not mask_uris:
                # No masks at all → fallback to a prompt-only call
                merged_prompt = _merge_prompts(batch)
                edit_req = ImageEditRequest(
                    image_url=current_image_url,
                    prompt=merged_prompt,
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                    quality=req.quality,
                )
                edit_resp = edit_image(edit_req)
                current_image_url = edit_resp.result_url
            else:
                composite_mask = _composite_masks(mask_uris, img_bytes)
                merged_prompt = _merge_prompts(batch)
                logger.info(
                    "  → 1 AI call with %d mask regions: %s",
                    len(mask_uris), merged_prompt[:80],
                )
                edit_req = ImageEditRequest(
                    image_url=current_image_url,
                    prompt=merged_prompt,
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                    quality=req.quality,
                    mask=composite_mask,
                )
                edit_resp = edit_image(edit_req)
                current_image_url = edit_resp.result_url

        elif plan_item["type"] == "single":
            action = plan_item["action"]
            step_counter += 1
            logger.info("EditChain step %d/%d: type=%s prompt=%s", step_counter, total, action.type, action.prompt or "")

            if action.type == "remove_bg":
                remove_req = ImageRemoveBgRequest(
                    image_url=current_image_url,
                    bg_color="transparent",
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                )
                remove_resp = remove_background(remove_req)
                current_image_url = remove_resp.result_url

            elif action.type == "prompt":
                edit_req = ImageEditRequest(
                    image_url=current_image_url,
                    prompt=action.prompt or "",
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                    quality=req.quality,
                    mask=action.mask_data,
                )
                edit_resp = edit_image(edit_req)
                current_image_url = edit_resp.result_url

            elif action.type == "expand":
                expand_req = ImageExpandRequest(
                    image_url=current_image_url,
                    direction=action.direction,
                    expand_ratio=action.expand_ratio,
                    prompt=action.prompt,
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                )
                expand_resp = expand_image(expand_req)
                current_image_url = expand_resp.result_url

            elif action.type == "upscale":
                upscale_req = ImageUpscaleRequest(
                    image_url=current_image_url,
                    scale=action.scale,
                    output_preset=req.output_preset,
                    custom_width=req.custom_width,
                    custom_height=req.custom_height,
                )
                upscale_resp = upscale_image(upscale_req)
                current_image_url = upscale_resp.result_url

            else:
                logger.warning("EditChain unknown action type: %s — skipping", action.type)

    # ── Save final result as a version ──────────────────────────────────
    final_bytes = _load_image_bytes(current_image_url)
    img = Image.open(io.BytesIO(final_bytes))
    img = _crop_to_size(img, target_w, target_h)
    final_bytes = _compress_image(img, quality=req.quality)
    result_url = _save_image(final_bytes, prefix="chain")

    from app.services.image_version_service import create_version

    version_id = create_version(
        description=f"编辑链 ({len(req.actions)}步)",
        image_bytes=final_bytes,
        prompt=" | ".join(a.prompt or a.type for a in req.actions if a.prompt or a.type != "prompt"),
        output_size=f"{target_w}x{target_h}",
    )

    return EditChainResponse(
        original_url=req.image_url,
        result_url=result_url,
        version_id=version_id,
        output_size=f"{target_w}x{target_h}",
        file_size_kb=len(final_bytes) // 1024,
        steps=len(req.actions),
    )


# ── Remove Background ──────────────────────────────────────────────────


def remove_background(req: ImageRemoveBgRequest) -> ImageRemoveBgResponse:
    if req.bg_color == "transparent":
        bg_instruction = "Output the product with transparent background, preserving fine details like hair or thin edges."
    else:
        bg_instruction = "Place the product on a pure white (#FFFFFF) background. Keep product edges clean and sharp."

    prompt = f"Remove the background completely. {bg_instruction}"

    edit_req = ImageEditRequest(
        image_url=req.image_url,
        prompt=prompt,
        output_preset=req.output_preset,
        custom_width=req.custom_width,
        custom_height=req.custom_height,
    )
    resp = edit_image(edit_req)
    return ImageRemoveBgResponse(
        original_url=resp.original_url,
        result_url=resp.result_url,
        version_id=resp.version_id,
        output_size=resp.output_size,
        file_size_kb=resp.file_size_kb,
    )


# ── AI Expand (Outpainting) ───────────────────────────────────────────


def expand_image(req: ImageExpandRequest) -> ImageExpandResponse:
    client = _get_client()
    image_bytes = _load_image_bytes(req.image_url)
    target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

    # Calculate expansion sizes
    img = Image.open(io.BytesIO(image_bytes))
    orig_w, orig_h = img.size
    gpt_size = _resolve_gpt_size(req.output_preset)

    expand_prompt = req.prompt or "Extend this image by filling the new area naturally. Match the existing style, lighting, colors, and context. Seamless continuation of the original photo."
    expand_prompt = _enhance_prompt(expand_prompt)

    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=expand_prompt,
                    n=1,
                    size=gpt_size,
                )

            raw_bytes = _result_to_bytes(result)
            result_img = Image.open(io.BytesIO(raw_bytes))
            result_img = _crop_to_size(result_img, target_w, target_h)
            final_bytes = _compress_image(result_img)
            result_url = _save_image(final_bytes, prefix="expand")

            from app.services.image_version_service import create_version

            version_id = create_version(
                description=f"AI扩图 ({req.direction})",
                image_bytes=final_bytes,
                prompt=expand_prompt,
                output_size=f"{target_w}x{target_h}",
            )

            return ImageExpandResponse(
                original_url=req.image_url,
                result_url=result_url,
                version_id=version_id,
                original_size=f"{orig_w}x{orig_h}",
                expanded_size=f"{target_w}x{target_h}",
            )
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error("Image expand failed: %s", e)
        raise


# ── High-Res Upscale ──────────────────────────────────────────────────


def upscale_image(req: ImageUpscaleRequest) -> ImageUpscaleResponse:
    client = _get_client()
    image_bytes = _load_image_bytes(req.image_url)

    img = Image.open(io.BytesIO(image_bytes))
    orig_w, orig_h = img.size

    upscale_prompt = (
        f"Enhance this image to {req.scale}x higher resolution. "
        "Improve sharpness, clarity, and detail while preserving the original content and style. "
        "Maintain professional e-commerce product photography quality."
    )

    # Use 1536x1536 for best quality output
    gpt_size = "1536x1536"

    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=upscale_prompt,
                    n=1,
                    size=gpt_size,
                )

            raw_bytes = _result_to_bytes(result)
            result_img = Image.open(io.BytesIO(raw_bytes))

            # Apply output preset crop if specified
            if req.output_preset:
                target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)
                result_img = _crop_to_size(result_img, target_w, target_h)

            final_bytes = _compress_image(result_img)
            result_url = _save_image(final_bytes, prefix="upscale")
            final_w, final_h = result_img.size

            from app.services.image_version_service import create_version

            version_id = create_version(
                description=f"高清修复 ({req.scale}x)",
                image_bytes=final_bytes,
                prompt=upscale_prompt,
                output_size=f"{final_w}x{final_h}",
            )

            return ImageUpscaleResponse(
                original_url=req.image_url,
                result_url=result_url,
                version_id=version_id,
                original_size=f"{orig_w}x{orig_h}",
                upscaled_size=f"{final_w}x{final_h}",
            )
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error("Image upscale failed: %s", e)
        raise

"""Unified image editing service — wraps GPT Image Edit API for edit/remove-bg/expand/upscale."""
import base64
import io
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image, ImageChops
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    OpenAI,
    OpenAIError,
    PermissionDeniedError,
    RateLimitError,
)

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


class ImageEditServiceError(RuntimeError):
    """User-facing image-editing error with an HTTP-friendly status code."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code

# ── Directories ─────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
IMAGES_DIR = STATIC_DIR / "images"
VERSIONS_DIR = STATIC_DIR / "image_versions"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ─────────────────────────────────────────────────────────────


def _get_client() -> OpenAI:
    """Create an OpenAI client and fail fast when image config is incomplete."""
    if not OPENAI_API_KEY:
        raise ImageEditServiceError(
            "OpenAI 图片服务未配置 OPENAI_API_KEY，请先检查 backend/.env。",
            status_code=503,
        )
    if not OPENAI_IMAGE_MODEL:
        raise ImageEditServiceError(
            "OpenAI 图片服务未配置 OPENAI_IMAGE_MODEL，请先检查 backend/.env。",
            status_code=503,
        )
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL, timeout=180)


def _extract_openai_message(exc: Exception) -> str:
    """Extract the useful message from OpenAI SDK exceptions/proxy payloads."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error") if isinstance(body.get("error"), dict) else body
        code = error.get("code") or error.get("type")
        message = error.get("message") or str(exc)
        return f"{code}: {message}" if code else message
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            data = response.json()
            if isinstance(data, dict):
                error = data.get("error") if isinstance(data.get("error"), dict) else data
                code = error.get("code") or error.get("type")
                message = error.get("message") or str(exc)
                return f"{code}: {message}" if code else message
        except Exception:
            pass
    return str(exc)


def _openai_error_status(exc: OpenAIError) -> int:
    """Map external OpenAI/proxy failures to stable backend HTTP status codes."""
    if isinstance(exc, BadRequestError):
        return 400
    if isinstance(exc, (AuthenticationError, PermissionDeniedError, NotFoundError)):
        return 502
    if isinstance(exc, RateLimitError):
        return 429
    if isinstance(exc, (APIConnectionError, APITimeoutError)):
        return 504
    return 502


def _raise_openai_error(operation: str, exc: OpenAIError) -> None:
    """Raise a clear, actionable image-service error for API/proxy failures."""
    raw = _extract_openai_message(exc)
    status = _openai_error_status(exc)
    upstream_status = getattr(exc, "status_code", None)

    if isinstance(exc, AuthenticationError):
        hint = "API Key 无效或中转站拒绝认证，请检查 backend/.env 的 OPENAI_API_KEY / OPENAI_BASE_URL。"
    elif isinstance(exc, PermissionDeniedError):
        hint = "账号无权限调用图片模型，请检查中转站权限和模型白名单。"
    elif isinstance(exc, NotFoundError):
        hint = f"模型或接口不存在，请检查 OPENAI_IMAGE_MODEL={OPENAI_IMAGE_MODEL!r} 是否被当前中转站支持。"
    elif isinstance(exc, BadRequestError):
        hint = "请求参数不被图片接口接受，请重点检查模型、size、mask 尺寸/格式和 prompt。"
    elif isinstance(exc, RateLimitError):
        hint = "图片接口限流或额度不足，请稍后重试或检查中转站额度。"
    elif isinstance(exc, (APIConnectionError, APITimeoutError)):
        hint = f"无法连接图片服务或请求超时，请检查 OPENAI_BASE_URL={OPENAI_BASE_URL!r} 和网络。"
    else:
        hint = "图片服务返回异常，请检查中转站日志、模型配置和请求参数。"

    upstream = f"上游状态码: {upstream_status}; " if upstream_status else ""
    raise ImageEditServiceError(
        f"{operation}失败：{hint} {upstream}原始错误: {raw}",
        status_code=status,
    ) from exc


def _wrap_processing_error(operation: str, exc: Exception) -> None:
    """Normalize local processing and OpenAI errors for API responses."""
    if isinstance(exc, ImageEditServiceError):
        raise exc
    if isinstance(exc, OpenAIError):
        _raise_openai_error(operation, exc)
    if isinstance(exc, (ValueError, FileNotFoundError)):
        raise ImageEditServiceError(f"{operation}失败：{exc}", status_code=400) from exc
    raise ImageEditServiceError(f"{operation}失败：{exc}", status_code=500) from exc


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
        from urllib.parse import urlparse, unquote

        parsed = urlparse(image_url)
        if parsed.hostname in {"127.0.0.1", "localhost", "0.0.0.0"} and parsed.path.startswith("/static/"):
            rel = unquote(parsed.path).removeprefix("/static/")
            filepath = STATIC_DIR / rel
            if filepath.is_file():
                return filepath.read_bytes()
            raise FileNotFoundError(f"Cannot resolve local static URL: {image_url} (tried {filepath})")

        import httpx

        resp = httpx.get(image_url, timeout=30)
        resp.raise_for_status()
        return resp.content
    # Resolve relative /static/... paths to the actual static directory
    elif image_url.startswith("/static/"):
        # /static/images/filename.png → STATIC_DIR / images / filename
        # Do not use str.lstrip here: it strips any of the given characters and
        # can corrupt paths such as /static/image_versions/... into mage_versions/...
        rel = image_url.removeprefix("/static/")
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


def _prepare_image_and_mask(
    image_bytes: bytes,
    mask_b64: Optional[str],
    gpt_size: str,
) -> Tuple[bytes, Optional[bytes]]:
    """Normalize the image (and optional mask) to EXACTLY the same API size
    required by the OpenAI edit API.

    The OpenAI images.edit endpoint requires the mask to have the exact same
    pixel dimensions as the image. Intermediate results in an edit chain can be
    any size, and a frontend-generated mask is only guaranteed to match the
    image it was drawn on — not later chain steps. To make this robust once and
    for all, we resize BOTH the image and the mask to the same target canvas
    (derived from ``gpt_size``) right before the API call. ``gpt_size`` may be
    rectangular (for example ``1024x1536``), so do not collapse it to a square.

    Returns ``(image_png_bytes, mask_png_bytes_or_none)``.
    """
    try:
        target_w_str, target_h_str = gpt_size.lower().split("x", 1)
        target = (int(target_w_str), int(target_h_str))
    except (ValueError, AttributeError):
        target = (1024, 1024)

    # Load image, fit onto a transparent/white API canvas of target size so
    # aspect ratio is preserved and the mask can align 1:1.
    src = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    src_w, src_h = src.size
    scale = min(target[0] / src_w, target[1] / src_h)
    new_w, new_h = max(1, int(round(src_w * scale))), max(1, int(round(src_h * scale)))
    resized = src.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", target, (255, 255, 255, 255))
    off_x = (target[0] - new_w) // 2
    off_y = (target[1] - new_h) // 2
    canvas.paste(resized, (off_x, off_y))

    img_buf = io.BytesIO()
    canvas.save(img_buf, format="PNG")
    image_out = img_buf.getvalue()

    mask_out: Optional[bytes] = None
    if mask_b64:
        raw = mask_b64.split(",", 1)[1] if mask_b64.startswith("data:") else mask_b64
        mask_img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("L")

        # Reproject the mask through the SAME transform applied to the image so
        # the white (edit) regions land on the correct pixels of the square.
        mask_resized = mask_img.resize((new_w, new_h), Image.NEAREST)
        mask_canvas = Image.new("L", target, 0)
        mask_canvas.paste(mask_resized, (off_x, off_y))

        # OpenAI expects an RGBA mask where transparent = edit area. Convert the
        # white=edit convention into alpha: white(255) -> alpha 0 (edit),
        # black(0) -> alpha 255 (keep).
        rgba_mask = Image.new("RGBA", target, (0, 0, 0, 255))
        alpha = mask_canvas.point(lambda v: 0 if v > 127 else 255)
        rgba_mask.putalpha(alpha)

        mask_buf = io.BytesIO()
        rgba_mask.save(mask_buf, format="PNG")
        mask_out = mask_buf.getvalue()

    return image_out, mask_out


# ── Core: Unified Edit ─────────────────────────────────────────────────


def edit_image(req: ImageEditRequest) -> ImageEditResponse:
    """Core edit: natural language instruction + optional mask."""
    try:
        client = _get_client()
        image_bytes = _load_image_bytes(req.image_url)
        prompt = _enhance_prompt(req.prompt, req.context)
        gpt_size = _resolve_gpt_size(req.output_preset)
        target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

        # Normalize image (and mask, if any) to identical square dimensions so
        # the OpenAI edit API never rejects a size mismatch. This is the single
        # source of truth for alignment — callers no longer need to guarantee it.
        prepared_image, prepared_mask = _prepare_image_and_mask(image_bytes, req.mask, gpt_size)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        mask_file = None
        mask_path = None
        if prepared_mask:
            mask_path = tmp_path + "_mask.png"
            with open(mask_path, "wb") as f:
                f.write(prepared_mask)
            mask_file = open(mask_path, "rb")

        try:
            with open(tmp_path, "rb") as img_file:
                kwargs = dict(model=OPENAI_IMAGE_MODEL, image=img_file, prompt=prompt, n=1, size=gpt_size)
                # Keep service calls aligned with the verified smoke test and
                # avoid proxy defaults that may return a temporary URL instead
                # of inline bytes.
                kwargs["quality"] = "high"
                kwargs["response_format"] = "b64_json"
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
        _wrap_processing_error("图片编辑", e)


# ── Multi-step Composite Edit Chain ────────────────────────────────────

IMAGE_QUALITY = 90


def _bbox_to_mask(image_bytes: bytes, bbox: dict) -> str:
    """Convert bbox {x1,y1,x2,y2} to a white-on-black base64 mask.

    Supports both normalized coordinates (0..1) and absolute pixel coordinates.
    The mask has the same dimensions as the source image; the bbox region is
    white (255), the rest is black (0). Returns a data-URI base64 PNG string.
    """
    from PIL import ImageDraw

    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size

    raw_x1 = float(bbox["x1"])
    raw_y1 = float(bbox["y1"])
    raw_x2 = float(bbox["x2"])
    raw_y2 = float(bbox["y2"])

    # Frontend rect selections are emitted in source-image pixel coordinates,
    # while older callers may still send normalized coordinates. Detect and
    # support both formats to avoid multiplying pixel values by image size.
    is_normalized = all(0 <= v <= 1 for v in (raw_x1, raw_y1, raw_x2, raw_y2))
    if is_normalized:
        raw_x1, raw_x2 = raw_x1 * w, raw_x2 * w
        raw_y1, raw_y2 = raw_y1 * h, raw_y2 * h

    # Sort first, then clamp to image bounds. This prevents draw.rectangle from
    # receiving inverted coordinates after clamping out-of-range boxes.
    x1, x2 = sorted((int(round(raw_x1)), int(round(raw_x2))))
    y1, y2 = sorted((int(round(raw_y1)), int(round(raw_y2))))
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)

    if x1 >= x2 or y1 >= y2:
        raise ValueError(f"Invalid bbox after normalization/clamp: {bbox} for image size {w}x{h}")

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
    base_size = Image.open(io.BytesIO(image_bytes)).size
    bg = Image.new("L", base_size, 0)
    for uri in mask_uris:
        b64_data = uri.split(",", 1)[1] if uri.startswith("data:") else uri
        mask_data = base64.b64decode(b64_data)
        mask_img = Image.open(io.BytesIO(mask_data)).convert("L")
        # Frontend brush masks and backend-generated bbox masks may have
        # different dimensions. Normalize every mask to the current image before
        # compositing, otherwise Image.composite/ImageChops will fail with
        # "images do not match" during mixed brush + rect chains.
        if mask_img.size != base_size:
            mask_img = mask_img.resize(base_size, Image.NEAREST)
        # OR composite: pixel = max(existing, this_mask)
        bg = ImageChops.lighter(bg, mask_img)
    buf = io.BytesIO()
    bg.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _chain_action_label(action: EditAction) -> str:
    """Human-friendly action label used in edit-chain error messages."""
    labels = {
        "prompt": "自然语言编辑",
        "remove_bg": "去背景",
        "brush": "涂鸦区域编辑",
        "rect": "框选区域编辑",
        "upscale": "高清修复",
        "expand": "AI扩图",
    }
    return labels.get(action.type, action.type)


def _raise_chain_step_error(step: int, total: int, action: EditAction, exc: Exception) -> None:
    """Raise a clear edit-chain error without losing the original exception."""
    status_code = getattr(exc, "status_code", 500)
    raise ImageEditServiceError(
        f"组合操作第 {step}/{total} 步（{_chain_action_label(action)}）失败: {exc}",
        status_code=status_code,
    ) from exc


def _merge_prompts(actions: list[EditAction]) -> str:
    """Merge prompts from multiple mask-based actions into one instruction."""
    prompts = [a.prompt.strip() for a in actions if a.prompt and a.prompt.strip()]
    unique = list(dict.fromkeys(prompts))  # preserve order, deduplicate
    if not unique:
        return "Edit the selected regions naturally, matching surrounding texture, lighting, perspective, and product-photography quality."
    if len(unique) == 1:
        return unique[0]
    # Multiple different prompts → combine into one readable instruction for one AI call.
    parts = [f"{idx}. {p.rstrip('.')}" for idx, p in enumerate(unique, start=1)]
    return "Apply these edits to the selected regions in one coherent result:\n" + "\n".join(parts)


def _action_instruction(action: EditAction) -> str:
    """Return the human-readable instruction represented by an action."""
    if action.prompt and action.prompt.strip():
        return action.prompt.strip()
    if action.type == "remove_bg":
        return "Remove the background and keep the product cleanly isolated."
    if action.type == "upscale":
        return f"Upscale/enhance image detail by {action.scale}x."
    if action.type == "expand":
        return f"Expand the image canvas toward {action.direction} by ratio {action.expand_ratio}."
    if action.type in ("brush", "rect"):
        return "Edit the selected region naturally, matching surrounding texture and lighting."
    return action.type


def _summarize_chain_prompt(actions: list[EditAction]) -> str:
    """Build a stable prompt summary for version history and debugging."""
    instructions = []
    for action in actions:
        instruction = _action_instruction(action)
        if instruction not in instructions:
            instructions.append(instruction)
    if not instructions:
        return "Edit chain"
    if len(instructions) == 1:
        return instructions[0]
    return "Edit chain:\n" + "\n".join(f"{idx}. {text}" for idx, text in enumerate(instructions, start=1))


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
        raise ImageEditServiceError("组合操作失败：至少需要一个操作步骤。", status_code=400)

    current_image_url = req.image_url
    target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

    # ── Step 1: Compile the execution plan ──────────────────────────────
    # Group consecutive mask-based actions into batches; keep other actions
    # as individual steps.
    execution_plan: list[dict] = []
    pending_prompt_actions: list[EditAction] = []
    i = 0
    actions = req.actions
    total = len(actions)
    while i < total:
        if actions[i].type == "prompt":
            # A prompt immediately before a mask selection is the user's instruction
            # for that selection. Hold it briefly so prompt+rect/brush becomes one
            # masked AI call instead of two separate calls.
            pending_prompt_actions.append(actions[i])
            i += 1
        elif _is_mask_action(actions[i].type):
            # Gather consecutive mask-based actions and attach any pending prompt
            # instructions to the first batch.
            batch = [*pending_prompt_actions]
            pending_prompt_actions = []
            while i < total and _is_mask_action(actions[i].type):
                batch.append(actions[i])
                i += 1
            execution_plan.append({"type": "mask_batch", "actions": batch})
        else:
            for pending in pending_prompt_actions:
                execution_plan.append({"type": "single", "action": pending})
            pending_prompt_actions = []
            execution_plan.append({"type": "single", "action": actions[i]})
            i += 1
    for pending in pending_prompt_actions:
        execution_plan.append({"type": "single", "action": pending})

    try:
        # ── Step 2: Execute the plan ────────────────────────────────────────
        step_counter = 0
        ai_calls = 0
        for plan_item in execution_plan:
            if plan_item["type"] == "mask_batch":
                batch = plan_item["actions"]
                step_counter += len(batch)
                step_start = step_counter - len(batch) + 1
                logger.info(
                    "EditChain mask-batch %d/%d: %d actions (types=%s)",
                    step_start, total,
                    len(batch), [a.type for a in batch],
                )

                try:
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
                        ai_calls += 1
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
                        ai_calls += 1
                except Exception as e:
                    failing_action = next((a for a in batch if _is_mask_action(a.type)), batch[0])
                    _raise_chain_step_error(step_start, total, failing_action, e)

            elif plan_item["type"] == "single":
                action = plan_item["action"]
                step_counter += 1
                logger.info("EditChain step %d/%d: type=%s prompt=%s", step_counter, total, action.type, action.prompt or "")

                try:
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
                        ai_calls += 1

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
                        ai_calls += 1

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
                        ai_calls += 1

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
                        ai_calls += 1

                    else:
                        logger.warning("EditChain unknown action type: %s — skipping", action.type)
                except Exception as e:
                    _raise_chain_step_error(step_counter, total, action, e)

        # ── Save final result as a version ──────────────────────────────────
        final_bytes = _load_image_bytes(current_image_url)
        img = Image.open(io.BytesIO(final_bytes))
        img = _crop_to_size(img, target_w, target_h)
        final_bytes = _compress_image(img, quality=req.quality)
        result_url = _save_image(final_bytes, prefix="chain")

        from app.services.image_version_service import create_version

        final_prompt = _summarize_chain_prompt(req.actions)
        version_id = create_version(
            description=f"编辑链 ({len(req.actions)}步)",
            image_bytes=final_bytes,
            prompt=final_prompt,
            output_size=f"{target_w}x{target_h}",
        )

        return EditChainResponse(
            original_url=req.image_url,
            result_url=result_url,
            version_id=version_id,
            output_size=f"{target_w}x{target_h}",
            file_size_kb=len(final_bytes) // 1024,
            steps=len(req.actions),
            final_prompt=final_prompt,
            ai_calls=ai_calls,
        )
    except Exception as e:
        logger.error("Image edit chain failed: %s", e)
        _wrap_processing_error("组合操作", e)


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
    try:
        client = _get_client()
        image_bytes = _load_image_bytes(req.image_url)
        target_w, target_h = _resolve_target_size(req.output_preset, req.custom_width, req.custom_height)

        # Calculate expansion sizes
        img = Image.open(io.BytesIO(image_bytes))
        orig_w, orig_h = img.size
        gpt_size = _resolve_gpt_size(req.output_preset)

        expand_prompt = req.prompt or "Extend this image by filling the new area naturally. Match the existing style, lighting, colors, and context. Seamless continuation of the original photo."
        expand_prompt = _enhance_prompt(expand_prompt)

        prepared_image, _ = _prepare_image_and_mask(image_bytes, None, gpt_size)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=expand_prompt,
                    n=1,
                    size=gpt_size,
                    quality="high",
                    response_format="b64_json",
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
        _wrap_processing_error("AI扩图", e)


# ── High-Res Upscale ──────────────────────────────────────────────────


def upscale_image(req: ImageUpscaleRequest) -> ImageUpscaleResponse:
    try:
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

        prepared_image, _ = _prepare_image_and_mask(image_bytes, None, gpt_size)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = client.images.edit(
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=upscale_prompt,
                    n=1,
                    size=gpt_size,
                    quality="high",
                    response_format="b64_json",
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
        _wrap_processing_error("高清修复", e)

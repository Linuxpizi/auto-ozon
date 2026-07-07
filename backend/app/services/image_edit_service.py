"""Unified image editing service — wraps GPT Image Edit API for edit/remove-bg/expand/upscale."""
import base64
import contextvars
from dataclasses import dataclass
import hashlib
import io
import json
import logging
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional, Tuple

import httpx
from PIL import Image, ImageChops
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    OpenAI,
    OpenAIError,
    PermissionDeniedError,
    RateLimitError,
)

from app.core.config import (
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_IMAGE_MAX_CONCURRENCY,
    OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_TIMEOUT_SECONDS,
)
from app.schemas.image_edit import (
    EditAction,
    EditChainRequest,
    EditChainResponse,
    GPT_SIZE_MAP,
    OUTPUT_PRESETS,
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

_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("image_edit_request_id", default="-")
_openai_semaphore = threading.BoundedSemaphore(max(1, OPENAI_IMAGE_MAX_CONCURRENCY))
_OPENAI_SEMAPHORE_WAIT_SECONDS = 5


def set_request_id(request_id: str) -> contextvars.Token[str]:
    """Attach an API request id to all service logs emitted in this call chain."""
    return _request_id_var.set(request_id)


def reset_request_id(token: contextvars.Token[str]) -> None:
    """Reset the request id context after the API request finishes."""
    _request_id_var.reset(token)


def _rid() -> str:
    return _request_id_var.get()


def _json_default(value: Any) -> str:
    return str(value)


def _log_event(level: int, event: str, **fields: Any) -> None:
    """Emit one structured JSON log line with the current image-edit request id."""
    payload = {"rid": _rid(), "event": event, **fields}
    logger.log(level, "[image_edit] %s", json.dumps(payload, ensure_ascii=False, default=_json_default))


def _log_exception(event: str, exc: Exception, **fields: Any) -> None:
    payload = {
        "rid": _rid(),
        "event": event,
        "exc_type": exc.__class__.__name__,
        "exc": str(exc),
        **fields,
    }
    logger.exception("[image_edit] %s", json.dumps(payload, ensure_ascii=False, default=_json_default))


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def _sha12(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def _redact_url(url: Optional[str], max_len: int = 180) -> Optional[str]:
    if not url:
        return url
    if url.startswith("data:"):
        head = url.split(",", 1)[0]
        return f"{head},<base64:{len(url)} chars>"
    return url if len(url) <= max_len else f"{url[:max_len]}...<truncated:{len(url)} chars>"


def _image_info(data: bytes) -> dict[str, Any]:
    info: dict[str, Any] = {"bytes": len(data), "sha256_12": _sha12(data)}
    try:
        with Image.open(io.BytesIO(data)) as img:
            info.update({"size": f"{img.width}x{img.height}", "mode": img.mode, "format": img.format})
    except Exception as exc:
        info.update({"decode_error": f"{exc.__class__.__name__}: {exc}"})
    return info


def _image_suffix_from_bytes(data: bytes) -> str:
    """Choose a temp-file suffix without changing image bytes."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").lower()
    except Exception:
        return ".png"
    return {
        "jpeg": ".jpg",
        "jpg": ".jpg",
        "png": ".png",
        "webp": ".webp",
        "gif": ".gif",
    }.get(fmt, f".{fmt}" if fmt else ".png")


def _mask_b64_info(mask_b64: Optional[str]) -> Optional[dict[str, Any]]:
    if not mask_b64:
        return None
    try:
        raw = mask_b64.split(",", 1)[1] if mask_b64.startswith("data:") else mask_b64
        data = base64.b64decode(raw)
        info = _image_info(data)
        with Image.open(io.BytesIO(data)) as img:
            gray = img.convert("L")
            bbox = gray.point(lambda v: 255 if v > 0 else 0).getbbox()
            extrema = gray.getextrema()
            info.update({"nonzero_bbox": bbox, "luma_extrema": extrema})
        return info
    except Exception as exc:
        return {"decode_error": f"{exc.__class__.__name__}: {exc}", "chars": len(mask_b64)}


def _openai_error_debug(exc: Exception) -> dict[str, Any]:
    """Return detailed but secret-safe OpenAI exception data for logs."""
    debug: dict[str, Any] = {
        "exc_type": exc.__class__.__name__,
        "message": str(exc),
        "status_code": getattr(exc, "status_code", None),
        "body": getattr(exc, "body", None),
        "code": getattr(exc, "code", None),
        "type": getattr(exc, "type", None),
    }
    response = getattr(exc, "response", None)
    if response is not None:
        headers = getattr(response, "headers", {}) or {}
        debug["response_headers"] = {
            key: value
            for key, value in dict(headers).items()
            if key.lower() in {"content-type", "x-request-id", "openai-request-id", "cf-ray", "retry-after"}
        }
        try:
            debug["response_json"] = response.json()
        except Exception:
            try:
                debug["response_text"] = response.text[:2000]
            except Exception:
                pass
    return debug


def _action_debug(action: EditAction) -> dict[str, Any]:
    """Secret-safe action summary for edit-chain logs."""
    return {
        "type": action.type,
        "prompt_chars": len(action.prompt or ""),
        "prompt_preview": (action.prompt or "")[:160],
        "has_mask_data": bool(action.mask_data),
        "mask_info": _mask_b64_info(action.mask_data),
        "bbox": action.bbox,
        "scale": action.scale,
        "direction": action.direction,
        "expand_ratio": action.expand_ratio,
    }


def _openai_call_fields(kwargs: dict[str, Any]) -> dict[str, Any]:
    prompt = kwargs.get("prompt") or ""
    image_file = kwargs.get("image")
    mask_file = kwargs.get("mask")
    image_files = image_file if isinstance(image_file, (list, tuple)) else ([image_file] if image_file else [])
    return {
        "model": kwargs.get("model"),
        "size": kwargs.get("size"),
        "n": kwargs.get("n"),
        "quality": kwargs.get("quality"),
        "response_format": kwargs.get("response_format"),
        "timeout": kwargs.get("timeout"),
        "has_mask": bool(mask_file),
        "image_count": len(image_files),
        "prompt_chars": len(prompt),
        "prompt_preview": prompt[:240],
        "image_file": [getattr(item, "name", None) for item in image_files],
        "mask_file": getattr(mask_file, "name", None),
    }


def _call_openai_image_edit(client: OpenAI, operation: str, **kwargs: Any):
    """Call OpenAI image edit with verbose logs, hard timeout and concurrency guard."""
    # Be explicit per request. Some OpenAI SDK/resource paths can otherwise fall
    # back to a short default (~20s) even when the client was constructed with a
    # longer timeout. Image edits commonly take 30-120s on proxy gateways.
    kwargs.setdefault("timeout", float(OPENAI_IMAGE_TIMEOUT_SECONDS))
    fields = _openai_call_fields(kwargs)
    debug_files = _persist_openai_request_files(operation, kwargs)
    _log_event(logging.INFO, "openai.images.edit.start", operation=operation, debug_files=debug_files, **fields)
    started_at = time.perf_counter()
    acquired = _openai_semaphore.acquire(timeout=_OPENAI_SEMAPHORE_WAIT_SECONDS)
    if not acquired:
        _log_event(
            logging.WARNING,
            "openai.images.edit.busy",
            operation=operation,
            wait_seconds=_OPENAI_SEMAPHORE_WAIT_SECONDS,
            max_concurrency=OPENAI_IMAGE_MAX_CONCURRENCY,
        )
        raise ImageEditServiceError(
            "图片 AI 服务繁忙，请稍后再试。",
            status_code=429,
        )
    try:
        result = client.images.edit(**kwargs)
        data = getattr(result, "data", None) or []
        first = data[0] if data else None
        _log_event(
            logging.INFO,
            "openai.images.edit.success",
            operation=operation,
            elapsed_ms=_elapsed_ms(started_at),
            data_count=len(data),
            first_has_b64=bool(getattr(first, "b64_json", None)) if first else False,
            first_has_url=bool(getattr(first, "url", None)) if first else False,
            first_revised_prompt=getattr(first, "revised_prompt", None) if first else None,
        )
        return result
    except OpenAIError as exc:
        _log_exception(
            "openai.images.edit.failed",
            exc,
            operation=operation,
            elapsed_ms=_elapsed_ms(started_at),
            request=fields,
            openai_error=_openai_error_debug(exc),
        )
        raise
    finally:
        _openai_semaphore.release()


class ImageEditServiceError(RuntimeError):
    """User-facing image-editing error with an HTTP-friendly status code."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code

# ── Directories ─────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
IMAGES_DIR = STATIC_DIR / "images"
VERSIONS_DIR = STATIC_DIR / "image_versions"
DEBUG_DIR = STATIC_DIR / "image_edit_debug"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
DEBUG_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ─────────────────────────────────────────────────────────────


def _safe_debug_part(value: str) -> str:
    """Return a filesystem-safe short label for debug artifact names."""
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in value.strip().lower())
    return cleaned.strip("_")[:40] or "unknown"


def _copy_upload_file_for_debug(file_obj: Any, operation: str, kind: str) -> Optional[dict[str, Any]]:
    """Persist an upload file object without changing its current read position."""
    if not file_obj:
        return None

    source_name = getattr(file_obj, "name", None)
    suffix = Path(source_name).suffix if source_name else ".png"
    if not suffix:
        suffix = ".png"

    try:
        pos = file_obj.tell()
    except Exception:
        pos = None

    try:
        try:
            file_obj.seek(0)
        except Exception:
            pass
        data = file_obj.read()
        if isinstance(data, str):
            data = data.encode()
    finally:
        if pos is not None:
            try:
                file_obj.seek(pos)
            except Exception:
                pass

    filename = (
        f"{int(time.time())}_{_rid()}_{_safe_debug_part(operation)}_"
        f"{kind}_{_sha12(data)}{suffix}"
    )
    filepath = DEBUG_DIR / filename
    filepath.write_bytes(data)
    return {
        "kind": kind,
        "source_name": source_name,
        "filepath": str(filepath),
        "url": f"/static/image_edit_debug/{filename}",
        "image": _image_info(data),
    }


def _persist_openai_request_files(operation: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Save the exact image/mask files sent to OpenAI for local debugging."""
    try:
        image_arg = kwargs.get("image")
        image_files = image_arg if isinstance(image_arg, (list, tuple)) else [image_arg]
        saved = {
            "image": [
                _copy_upload_file_for_debug(file_obj, operation, f"image{idx + 1}")
                for idx, file_obj in enumerate(image_files)
                if file_obj
            ],
            "mask": _copy_upload_file_for_debug(kwargs.get("mask"), operation, "mask"),
        }
        _log_event(logging.INFO, "openai.images.edit.debug_files_saved", operation=operation, files=saved)
        return saved
    except Exception as exc:
        _log_exception("openai.images.edit.debug_files_save_failed", exc, operation=operation)
        return {"error": f"{exc.__class__.__name__}: {exc}"}


def _get_client() -> OpenAI:
    """Create an OpenAI client and fail fast when image config is incomplete."""
    _log_event(
        logging.INFO,
        "openai.client.create",
        base_url=OPENAI_BASE_URL,
        model=OPENAI_IMAGE_MODEL,
        has_api_key=bool(OPENAI_API_KEY),
        timeout_seconds=OPENAI_IMAGE_TIMEOUT_SECONDS,
        max_concurrency=OPENAI_IMAGE_MAX_CONCURRENCY,
    )
    if not OPENAI_API_KEY:
        _log_event(logging.ERROR, "openai.client.missing_api_key", base_url=OPENAI_BASE_URL, model=OPENAI_IMAGE_MODEL)
        raise ImageEditServiceError(
            "OpenAI 图片服务未配置 OPENAI_API_KEY，请先检查 backend/.env。",
            status_code=503,
        )
    if not OPENAI_IMAGE_MODEL:
        _log_event(logging.ERROR, "openai.client.missing_model", base_url=OPENAI_BASE_URL)
        raise ImageEditServiceError(
            "OpenAI 图片服务未配置 OPENAI_IMAGE_MODEL，请先检查 backend/.env。",
            status_code=503,
        )
    timeout = httpx.Timeout(
        timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
        connect=min(15, OPENAI_IMAGE_TIMEOUT_SECONDS),
        read=OPENAI_IMAGE_TIMEOUT_SECONDS,
        write=min(30, OPENAI_IMAGE_TIMEOUT_SECONDS),
        pool=min(15, OPENAI_IMAGE_TIMEOUT_SECONDS),
    )
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL, timeout=timeout, max_retries=0)


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
    if isinstance(exc, APIStatusError):
        upstream_status = getattr(exc, "status_code", None)
        if upstream_status and 400 <= upstream_status < 500:
            return upstream_status
        return 502
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
        hint = (
            f"图片服务处理超时，当前后端等待 {OPENAI_IMAGE_TIMEOUT_SECONDS}s。"
            "图片编辑/局部重绘可能需要更久；如果上游最终能出图，请调大 backend/.env 的 "
            "OPENAI_IMAGE_TIMEOUT_SECONDS（例如 180 或 300）后重启后端。"
        )
    else:
        hint = "图片服务返回异常，请检查中转站日志、模型配置和请求参数。"

    upstream = f"上游状态码: {upstream_status}; " if upstream_status else ""
    raise ImageEditServiceError(
        f"{operation}失败：{hint} {upstream}原始错误: {raw}",
        status_code=status,
    ) from exc


def _wrap_processing_error(operation: str, exc: Exception) -> None:
    """Normalize local processing and OpenAI errors for API responses."""
    _log_event(
        logging.ERROR,
        "processing_error.wrap",
        operation=operation,
        exc_type=exc.__class__.__name__,
        exc=str(exc),
        status_code=getattr(exc, "status_code", None),
        openai_error=_openai_error_debug(exc) if isinstance(exc, OpenAIError) else None,
    )
    if isinstance(exc, ImageEditServiceError):
        raise exc
    if isinstance(exc, OpenAIError):
        _raise_openai_error(operation, exc)
    if isinstance(exc, (ValueError, FileNotFoundError)):
        raise ImageEditServiceError(f"{operation}失败：{exc}", status_code=400) from exc
    raise ImageEditServiceError(f"{operation}失败：{exc}", status_code=500) from exc


def _save_image(data: bytes, prefix: str = "edit") -> str:
    """Save image bytes and return relative URL."""
    started_at = time.perf_counter()
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    filepath = IMAGES_DIR / filename
    filepath.write_bytes(data)
    url = f"/static/images/{filename}"
    _log_event(
        logging.INFO,
        "image.save",
        prefix=prefix,
        filepath=str(filepath),
        url=url,
        image=_image_info(data),
        elapsed_ms=_elapsed_ms(started_at),
    )
    return url


def _load_image_bytes(image_url: str) -> bytes:
    """Load image from URL / base64 / file path and return bytes."""
    started_at = time.perf_counter()
    safe_url = _redact_url(image_url)
    _log_event(logging.INFO, "image.load.start", image_url=safe_url)
    try:
        source = "raw_base64"
        resolved_path: Optional[Path] = None
        if image_url.startswith("data:"):
            source = "data_uri"
            b64_str = image_url.split(",", 1)[1]
            data = base64.b64decode(b64_str)
        elif image_url.startswith("http"):
            from urllib.parse import urlparse, unquote

            parsed = urlparse(image_url)
            if parsed.hostname in {"127.0.0.1", "localhost", "0.0.0.0"} and parsed.path.startswith("/static/"):
                source = "local_static_http"
                rel = unquote(parsed.path).removeprefix("/static/")
                filepath = STATIC_DIR / rel
                resolved_path = filepath
                if filepath.is_file():
                    data = filepath.read_bytes()
                else:
                    raise FileNotFoundError(f"Cannot resolve local static URL: {image_url} (tried {filepath})")
            else:
                import httpx

                source = "remote_http"
                resp = httpx.get(image_url, timeout=30)
                resp.raise_for_status()
                data = resp.content
        elif image_url.startswith("/static/"):
            source = "local_static_path"
            rel = image_url.removeprefix("/static/")
            filepath = STATIC_DIR / rel
            resolved_path = filepath
            if filepath.is_file():
                data = filepath.read_bytes()
            else:
                filename = os.path.basename(image_url)
                fallback = IMAGES_DIR / filename
                resolved_path = fallback
                if fallback.is_file():
                    data = fallback.read_bytes()
                else:
                    raise FileNotFoundError(f"Cannot resolve static path: {image_url} (tried {STATIC_DIR / rel}, {fallback})")
        elif os.path.isfile(image_url):
            source = "filesystem"
            resolved_path = Path(image_url)
            with open(image_url, "rb") as f:
                data = f.read()
        else:
            data = base64.b64decode(image_url)
        _log_event(
            logging.INFO,
            "image.load.success",
            image_url=safe_url,
            source=source,
            resolved_path=str(resolved_path) if resolved_path else None,
            image=_image_info(data),
            elapsed_ms=_elapsed_ms(started_at),
        )
        return data
    except Exception as exc:
        _log_exception("image.load.failed", exc, image_url=safe_url, elapsed_ms=_elapsed_ms(started_at))
        raise


OPENAI_IMAGE_EDIT_SIZES: tuple[tuple[int, int], ...] = (
    (1024, 1024),
    (1024, 1536),
    (1536, 1024),
)

RESOLUTION_PRESETS = {"1k": 1000, "2k": 2000, "4k": 4000}


@dataclass(frozen=True)
class ResolvedOutputSize:
    """Backend-owned output-size decision.

    ``target_width``/``target_height`` are the business dimensions requested by
    the UI (resolution + ratio or legacy preset). ``openai_size`` is the nearest
    canvas size that the OpenAI image edit API accepts. The frontend must submit
    raw selections only; all parsing, defaults and OpenAI adaptation live here.
    """

    target_width: int
    target_height: int
    openai_size: str


def _closest_openai_size(width: int, height: int) -> str:
    """Map arbitrary requested pixels to an OpenAI-supported canvas size."""
    if width <= 0 or height <= 0:
        return GPT_SIZE_MAP["ozon_main"]
    requested_ratio = width / height
    best_w, best_h = min(
        OPENAI_IMAGE_EDIT_SIZES,
        key=lambda item: abs((item[0] / item[1]) - requested_ratio),
    )
    return f"{best_w}x{best_h}"


def _parse_resolution_px(resolution: Optional[str]) -> Optional[int]:
    """Parse raw frontend resolution strings such as 1k/2k/4k/1024."""
    if not resolution:
        return None
    raw = str(resolution).strip().lower()
    if raw in RESOLUTION_PRESETS:
        return RESOLUTION_PRESETS[raw]
    if raw.endswith("k"):
        return max(1, int(float(raw[:-1]) * 1000))
    return max(1, int(float(raw)))


def _parse_ratio_pair(size_ratio: Optional[str]) -> Optional[tuple[int, int]]:
    """Parse raw frontend ratio strings such as 3:4 / 16:9."""
    if not size_ratio:
        return None
    left, right = str(size_ratio).strip().split(":", 1)
    ratio_w = int(float(left))
    ratio_h = int(float(right))
    if ratio_w <= 0 or ratio_h <= 0:
        raise ValueError(f"Invalid size_ratio: {size_ratio}")
    return ratio_w, ratio_h


def _resolve_gpt_size(
    preset: str,
    custom_w: Optional[int] = None,
    custom_h: Optional[int] = None,
) -> str:
    """Return the exact OpenAI-supported size sent to the image API."""
    if custom_w and custom_h:
        return _closest_openai_size(custom_w, custom_h)
    return GPT_SIZE_MAP.get(preset, GPT_SIZE_MAP["ozon_main"])


def _resolve_output_size(
    preset: str,
    custom_w: Optional[int] = None,
    custom_h: Optional[int] = None,
    resolution: Optional[str] = None,
    size_ratio: Optional[str] = None,
) -> ResolvedOutputSize:
    """Resolve raw frontend size fields and adapt them to OpenAI.

    Contract:
    - Frontend sends ``resolution`` and ``size_ratio`` exactly as selected.
    - Backend owns all parsing, fallback and compatibility behavior.
    - OpenAI receives only one of its supported edit canvas sizes.
    """
    target_w, target_h = _resolve_target_size(preset, custom_w, custom_h, resolution, size_ratio)
    gpt_size = _resolve_gpt_size(preset, target_w, target_h)
    return ResolvedOutputSize(target_width=target_w, target_height=target_h, openai_size=gpt_size)


def _resolve_target_size(
    preset: str,
    custom_w: Optional[int] = None,
    custom_h: Optional[int] = None,
    resolution: Optional[str] = None,
    size_ratio: Optional[str] = None,
) -> Tuple[int, int]:
    """Resolve frontend raw resolution/ratio on the backend.

    Frontend passes selections as-is. This function owns all business logic:
    legacy custom pixels first, then raw resolution+ratio, then old preset.
    """
    if custom_w and custom_h:
        return custom_w, custom_h
    p = OUTPUT_PRESETS.get(preset, OUTPUT_PRESETS["ozon_main"])
    parsed_resolution = _parse_resolution_px(resolution)
    parsed_ratio = _parse_ratio_pair(size_ratio) if size_ratio else None
    if parsed_resolution or parsed_ratio:
        base = parsed_resolution or max(p["width"], p["height"])
        ratio_w, ratio_h = parsed_ratio or _parse_ratio_pair(p["ratio"]) or (p["width"], p["height"])
        if ratio_w >= ratio_h:
            return base, max(1, round(base * ratio_h / ratio_w))
        return max(1, round(base * ratio_w / ratio_h)), base
    return p["width"], p["height"]


def _result_to_bytes(result) -> bytes:
    """Extract image bytes from OpenAI API result."""
    started_at = time.perf_counter()
    img_data = result.data[0]
    if hasattr(img_data, "b64_json") and img_data.b64_json:
        data = base64.b64decode(img_data.b64_json)
        _log_event(logging.INFO, "openai.result.bytes", source="b64_json", image=_image_info(data), elapsed_ms=_elapsed_ms(started_at))
        return data
    elif hasattr(img_data, "url") and img_data.url:
        import httpx

        _log_event(logging.INFO, "openai.result.download.start", url=_redact_url(img_data.url))
        resp = httpx.get(img_data.url, timeout=30)
        resp.raise_for_status()
        data = resp.content
        _log_event(logging.INFO, "openai.result.bytes", source="url", image=_image_info(data), elapsed_ms=_elapsed_ms(started_at))
        return data
    _log_event(logging.ERROR, "openai.result.empty", result_type=type(result).__name__)
    raise ValueError("API returned no image data")


def _require_prompt(prompt: Optional[str], operation: str) -> str:
    """Return the exact caller-provided prompt, or fail if it is missing.

    The backend must not invent, append, or rewrite prompts. Any endpoint/action
    that needs an AI instruction must receive it from the caller explicitly.
    """
    if not prompt or not prompt.strip():
        raise ImageEditServiceError(
            f"{operation}失败：缺少 prompt，后端不会自动补充编辑指令。",
            status_code=400,
        )
    return prompt


def _require_action_prompt(action: EditAction) -> str:
    """Return the exact prompt attached to an edit-chain action, or fail."""
    if action.prompt and action.prompt.strip():
        return action.prompt
    raise ImageEditServiceError(
        f"{_chain_action_label(action)}缺少 prompt，后端不会自动补充编辑指令。",
        status_code=400,
    )


def _prepare_image_and_mask(
    image_bytes: bytes,
    mask_b64: Optional[str],
    gpt_size: str,
) -> Tuple[bytes, Optional[bytes]]:
    """Return original image bytes and an optional OpenAI-compatible mask.

    IMPORTANT: the user-provided input image must be passed to OpenAI exactly as
    received. Do not resize, crop, pad, re-encode, color-convert, normalize, or
    otherwise mutate ``image_bytes`` here. ``gpt_size`` controls only the OpenAI
    requested output canvas size; it must not be applied to the input image.

    Mask bytes are generated/auxiliary data, so they may be converted to the
    alpha semantics expected by OpenAI. If needed, only the mask is aligned to
    the original image dimensions; the input image remains byte-for-byte intact.
    """
    image_out = image_bytes

    mask_out: Optional[bytes] = None
    if mask_b64:
        raw = mask_b64.split(",", 1)[1] if mask_b64.startswith("data:") else mask_b64
        mask_img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("L")

        with Image.open(io.BytesIO(image_bytes)) as src:
            original_size = src.size

        # Align only the mask to the original image dimensions. Never resize or
        # re-encode the image itself.
        mask_canvas = mask_img
        if mask_canvas.size != original_size:
            mask_canvas = mask_canvas.resize(original_size, Image.NEAREST)

        # OpenAI expects an RGBA mask where transparent = edit area. Convert the
        # white=edit convention into alpha: white(255) -> alpha 0 (edit),
        # black(0) -> alpha 255 (keep).
        # Keep RGB as the user's conventional white=edit / black=keep mask,
        # and set alpha for OpenAI semantics: transparent=edit, opaque=keep.
        # This works with gateways that inspect either alpha or RGB channels.
        rgba_mask = Image.new("RGBA", original_size, (0, 0, 0, 255))
        rgb_mask = Image.merge("RGB", (mask_canvas, mask_canvas, mask_canvas))
        rgba_mask.paste(rgb_mask, (0, 0))
        alpha = mask_canvas.point(lambda v: 0 if v > 127 else 255)
        rgba_mask.putalpha(alpha)

        mask_buf = io.BytesIO()
        rgba_mask.save(mask_buf, format="PNG")
        mask_out = mask_buf.getvalue()

    return image_out, mask_out


def _prepare_image_for_openai(image_bytes: bytes, gpt_size: str) -> bytes:
    """Return a reference/input image byte-for-byte unchanged for OpenAI."""
    return image_bytes


def _build_edit_prompt(prompt: str, has_reference_image: bool, has_mask: bool) -> str:
    """Centralize backend-only prompt logic; frontend submits user text as-is."""
    if not has_reference_image:
        return prompt
    target_scope = "用户用遮罩标记的区域" if has_mask else "当前宣传图中的主要产品主体"
    return (
        f"{prompt}\n\n"
        "附加产品替换要求：本次请求包含两张输入图片。第一张是当前商品宣传图，第二张是用户添加的产品参考图。"
        f"请以第二张图片中的产品主体为准，把它自然替换到第一张图片的{target_scope}；"
        "尽量保留第一张图片的背景、构图、光影、平台宣传图质感和文字版式。"
        "不要把第二张图片的背景一起搬过去，重点迁移产品外观、颜色、材质和关键细节。"
    )


# ── Core: Unified Edit ─────────────────────────────────────────────────


def edit_image(req: ImageEditRequest) -> ImageEditResponse:
    """Core edit: natural language instruction + optional mask."""
    try:
        client = _get_client()
        image_bytes = _load_image_bytes(req.image_url)
        prompt = _require_prompt(req.prompt, "图片编辑")
        reference_bytes = _load_image_bytes(req.reference_image) if req.reference_image else None
        output_size = _resolve_output_size(req.output_preset, req.custom_width, req.custom_height, req.resolution, req.size_ratio)
        target_w, target_h = output_size.target_width, output_size.target_height
        gpt_size = output_size.openai_size
        final_prompt = _build_edit_prompt(prompt, bool(reference_bytes), bool(req.mask))

        # Do not alter the input image. Only output size selection is adapted to
        # OpenAI; the image bytes sent below stay exactly as loaded.
        prepared_image, prepared_mask = _prepare_image_and_mask(image_bytes, req.mask, gpt_size)
        prepared_reference = _prepare_image_for_openai(reference_bytes, gpt_size) if reference_bytes else None

        with tempfile.NamedTemporaryFile(suffix=_image_suffix_from_bytes(prepared_image), delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        reference_path = None
        reference_file = None
        if prepared_reference:
            reference_path = tmp_path + f"_reference{_image_suffix_from_bytes(prepared_reference)}"
            with open(reference_path, "wb") as f:
                f.write(prepared_reference)
            reference_file = open(reference_path, "rb")

        mask_file = None
        mask_path = None
        if prepared_mask:
            mask_path = tmp_path + "_mask.png"
            with open(mask_path, "wb") as f:
                f.write(prepared_mask)
            mask_file = open(mask_path, "rb")

        try:
            with open(tmp_path, "rb") as img_file:
                image_arg = [img_file, reference_file] if reference_file else img_file
                kwargs = dict(model=OPENAI_IMAGE_MODEL, image=image_arg, prompt=final_prompt, n=1, size=gpt_size)
                # Keep service calls aligned with the verified smoke test and
                # avoid proxy defaults that may return a temporary URL instead
                # of inline bytes.
                kwargs["quality"] = "high"
                kwargs["response_format"] = "b64_json"
                if mask_file:
                    kwargs["mask"] = mask_file
                result = _call_openai_image_edit(client, "图片编辑", **kwargs)


            final_bytes = _result_to_bytes(result)
            result_url = _save_image(final_bytes, prefix="edit")

            from app.services.image_version_service import create_version

            version_id = create_version(
                description=req.prompt[:40] + ("..." if len(req.prompt) > 40 else ""),
                image_bytes=final_bytes,
                prompt=final_prompt,
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
            if reference_file:
                reference_file.close()
            if reference_path and os.path.exists(reference_path):
                os.unlink(reference_path)

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
        raise ImageEditServiceError(
            "组合操作失败：缺少 prompt，后端不会自动补充编辑指令。",
            status_code=400,
        )
    if len(unique) == 1:
        return unique[0]
    # Multiple caller-provided prompts are joined without adding backend text.
    return "\n".join(unique)


def _action_instruction(action: EditAction) -> str:
    """Return the human-readable instruction represented by an action."""
    if action.type in ("prompt", "remove_bg", "upscale", "expand", "brush", "rect"):
        return _require_action_prompt(action)
    return action.type


def _summarize_chain_prompt(actions: list[EditAction]) -> str:
    """Build a stable prompt summary for version history and debugging."""
    instructions = []
    for action in actions:
        instruction = _action_instruction(action)
        if instruction not in instructions:
            instructions.append(instruction)
    if not instructions:
        return ""
    if len(instructions) == 1:
        return instructions[0]
    # Join only caller-provided prompt text; do not add backend wording.
    return "\n".join(instructions)


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

    chain_started_at = time.perf_counter()
    _log_event(
        logging.INFO,
        "edit_chain.start",
        actions_count=len(req.actions),
        action_types=[action.type for action in req.actions],
        output_preset=req.output_preset,
        resolution=req.resolution,
        size_ratio=req.size_ratio,
        custom_width=req.custom_width,
        custom_height=req.custom_height,
    )

    current_image_url = req.image_url
    output_size = _resolve_output_size(req.output_preset, req.custom_width, req.custom_height, req.resolution, req.size_ratio)
    target_w, target_h = output_size.target_width, output_size.target_height

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

    _log_event(
        logging.INFO,
        "edit_chain.plan",
        plan=[
            {
                "type": item["type"],
                "action_type": item.get("action").type if item.get("action") else None,
                "batch_action_types": [a.type for a in item.get("actions", [])],
            }
            for item in execution_plan
        ],
    )

    try:
        # ── Step 2: Execute the plan ────────────────────────────────────────
        step_counter = 0
        ai_calls = 0
        for plan_item in execution_plan:
            if plan_item["type"] == "mask_batch":
                batch = plan_item["actions"]
                step_counter += len(batch)
                step_start = step_counter - len(batch) + 1
                step_started_at = time.perf_counter()
                _log_event(
                    logging.INFO,
                    "edit_chain.step.start",
                    plan_type="mask_batch",
                    step_start=step_start,
                    step_end=step_counter,
                    total=total,
                    actions=[_action_debug(a) for a in batch],
                )
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
                            resolution=req.resolution,
                            size_ratio=req.size_ratio,
                            custom_width=req.custom_width,
                            custom_height=req.custom_height,
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
                            resolution=req.resolution,
                            size_ratio=req.size_ratio,
                            custom_width=req.custom_width,
                            custom_height=req.custom_height,
                            mask=composite_mask,
                        )
                        try:
                            edit_resp = edit_image(edit_req)
                        except Exception as mask_exc:
                            _log_exception(
                                "edit_chain.mask_edit.failed_retry_without_mask",
                                mask_exc,
                                step_start=step_start,
                                step_end=step_counter,
                                mask_regions=len(mask_uris),
                                fallback="prompt_only",
                            )
                            fallback_req = ImageEditRequest(
                                image_url=current_image_url,
                                prompt=merged_prompt,
                                output_preset=req.output_preset,
                                resolution=req.resolution,
                                size_ratio=req.size_ratio,
                                custom_width=req.custom_width,
                                custom_height=req.custom_height,
                            )
                            edit_resp = edit_image(fallback_req)
                            _log_event(
                                logging.WARNING,
                                "edit_chain.mask_edit.fallback_success",
                                step_start=step_start,
                                step_end=step_counter,
                                mask_regions=len(mask_uris),
                                result_url=edit_resp.result_url,
                            )
                        current_image_url = edit_resp.result_url
                        ai_calls += 1
                    _log_event(
                        logging.INFO,
                        "edit_chain.step.success",
                        plan_type="mask_batch",
                        step_start=step_start,
                        step_end=step_counter,
                        elapsed_ms=_elapsed_ms(step_started_at),
                        current_image_url=current_image_url,
                        ai_calls=ai_calls,
                    )
                except Exception as e:
                    _log_exception(
                        "edit_chain.step.failed",
                        e,
                        plan_type="mask_batch",
                        step_start=step_start,
                        step_end=step_counter,
                        elapsed_ms=_elapsed_ms(step_started_at),
                    )
                    failing_action = next((a for a in batch if _is_mask_action(a.type)), batch[0])
                    _raise_chain_step_error(step_start, total, failing_action, e)

            elif plan_item["type"] == "single":
                action = plan_item["action"]
                step_counter += 1
                step_started_at = time.perf_counter()
                _log_event(
                    logging.INFO,
                    "edit_chain.step.start",
                    plan_type="single",
                    step=step_counter,
                    total=total,
                    action=_action_debug(action),
                )
                logger.info("EditChain step %d/%d: type=%s prompt=%s", step_counter, total, action.type, action.prompt or "")

                try:
                    if action.type in ("prompt", "remove_bg", "expand", "upscale"):
                        # Keep every non-mask chain step on the same known-good
                        # path as natural language editing. Quick actions are
                        # only prompt presets here; do not dispatch to the
                        # separate remove_background / expand_image /
                        # upscale_image helpers inside edit-chain.
                        edit_req = ImageEditRequest(
                            image_url=current_image_url,
                            prompt=_action_instruction(action),
                            output_preset=req.output_preset,
                            resolution=req.resolution,
                            size_ratio=req.size_ratio,
                            custom_width=req.custom_width,
                            custom_height=req.custom_height,
                            mask=action.mask_data,
                        )
                        edit_resp = edit_image(edit_req)
                        current_image_url = edit_resp.result_url
                        ai_calls += 1

                    else:
                        logger.warning("EditChain unknown action type: %s — skipping", action.type)
                    _log_event(
                        logging.INFO,
                        "edit_chain.step.success",
                        plan_type="single",
                        step=step_counter,
                        total=total,
                        action_type=action.type,
                        elapsed_ms=_elapsed_ms(step_started_at),
                        current_image_url=current_image_url,
                        ai_calls=ai_calls,
                    )
                except Exception as e:
                    _log_exception(
                        "edit_chain.step.failed",
                        e,
                        plan_type="single",
                        step=step_counter,
                        total=total,
                        action_type=action.type,
                        elapsed_ms=_elapsed_ms(step_started_at),
                    )
                    _raise_chain_step_error(step_counter, total, action, e)

        # ── Save final result as a version ──────────────────────────────────
        final_bytes = _load_image_bytes(current_image_url)
        result_url = _save_image(final_bytes, prefix="chain")

        from app.services.image_version_service import create_version

        final_prompt = _summarize_chain_prompt(req.actions)
        version_id = create_version(
            description=f"编辑链 ({len(req.actions)}步)",
            image_bytes=final_bytes,
            prompt=final_prompt,
            output_size=f"{target_w}x{target_h}",
        )

        response = EditChainResponse(
            original_url=req.image_url,
            result_url=result_url,
            version_id=version_id,
            output_size=f"{target_w}x{target_h}",
            file_size_kb=len(final_bytes) // 1024,
            steps=len(req.actions),
            final_prompt=final_prompt,
            ai_calls=ai_calls,
        )
        _log_event(
            logging.INFO,
            "edit_chain.success",
            elapsed_ms=_elapsed_ms(chain_started_at),
            result_url=result_url,
            version_id=version_id,
            output_size=f"{target_w}x{target_h}",
            file_size_kb=len(final_bytes) // 1024,
            steps=len(req.actions),
            ai_calls=ai_calls,
        )
        return response
    except Exception as e:
        logger.error("Image edit chain failed: %s", e)
        _log_exception("edit_chain.failed", e, elapsed_ms=_elapsed_ms(chain_started_at))
        _wrap_processing_error("组合操作", e)


# ── Remove Background ──────────────────────────────────────────────────


def remove_background(req: ImageRemoveBgRequest) -> ImageRemoveBgResponse:
    prompt = _require_prompt(req.prompt, "去背景")

    edit_req = ImageEditRequest(
        image_url=req.image_url,
        prompt=prompt,
        output_preset=req.output_preset,
        resolution=req.resolution,
        size_ratio=req.size_ratio,
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
        output_size = _resolve_output_size(req.output_preset, req.custom_width, req.custom_height, req.resolution, req.size_ratio)
        target_w, target_h = output_size.target_width, output_size.target_height

        # Calculate expansion sizes
        img = Image.open(io.BytesIO(image_bytes))
        orig_w, orig_h = img.size
        gpt_size = output_size.openai_size

        expand_prompt = _require_prompt(req.prompt, "AI扩图")

        prepared_image, _ = _prepare_image_and_mask(image_bytes, None, gpt_size)

        with tempfile.NamedTemporaryFile(suffix=_image_suffix_from_bytes(prepared_image), delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = _call_openai_image_edit(
                    client,
                    "AI扩图",
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=expand_prompt,
                    n=1,
                    size=gpt_size,
                    quality="high",
                    response_format="b64_json",
                )

            final_bytes = _result_to_bytes(result)
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

        upscale_prompt = _require_prompt(req.prompt, "高清修复")

        output_size = _resolve_output_size(req.output_preset or "ozon_detail_sq", req.custom_width, req.custom_height, req.resolution, req.size_ratio)
        target_w, target_h = output_size.target_width, output_size.target_height
        gpt_size = output_size.openai_size

        prepared_image, _ = _prepare_image_and_mask(image_bytes, None, gpt_size)

        with tempfile.NamedTemporaryFile(suffix=_image_suffix_from_bytes(prepared_image), delete=False) as tmp:
            tmp.write(prepared_image)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as img_file:
                result = _call_openai_image_edit(
                    client,
                    "高清修复",
                    model=OPENAI_IMAGE_MODEL,
                    image=img_file,
                    prompt=upscale_prompt,
                    n=1,
                    size=gpt_size,
                    quality="high",
                    response_format="b64_json",
                )

            final_bytes = _result_to_bytes(result)
            result_url = _save_image(final_bytes, prefix="upscale")
            final_w, final_h = target_w, target_h

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

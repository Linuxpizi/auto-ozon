"""Image edit router — unified editing, remove-bg, expand, upscale, chain endpoints."""
import json
import logging
import time
import uuid
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request
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
logger = logging.getLogger(__name__)


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def _redact_image_url(image_url: str | None) -> str | None:
    if not image_url:
        return image_url
    if image_url.startswith("data:"):
        head = image_url.split(",", 1)[0]
        return f"{head},<base64:{len(image_url)} chars>"
    return image_url if len(image_url) <= 180 else f"{image_url[:180]}...<truncated:{len(image_url)} chars>"


def _request_payload_summary(req: Any) -> dict[str, Any]:
    """Small, safe payload summary for chain logs. Never prints full base64 images/masks."""
    data = req.model_dump() if hasattr(req, "model_dump") else {}
    summary: dict[str, Any] = {
        "image_url": _redact_image_url(data.get("image_url")),
        "output_preset": data.get("output_preset"),
        "resolution": data.get("resolution"),
        "size_ratio": data.get("size_ratio"),
        "custom_width": data.get("custom_width"),
        "custom_height": data.get("custom_height"),
    }
    if "prompt" in data:
        prompt = data.get("prompt") or ""
        summary.update({"prompt_chars": len(prompt), "prompt_preview": prompt[:160]})
    if "mask" in data or "mask_data" in data:
        mask = data.get("mask") or data.get("mask_data")
        summary["has_mask"] = bool(mask)
        summary["mask_chars"] = len(mask) if mask else 0
    if "reference_image" in data:
        reference_image = data.get("reference_image")
        summary["has_reference_image"] = bool(reference_image)
        summary["reference_image_chars"] = len(reference_image) if reference_image else 0
    if "actions" in data:
        actions = data.get("actions") or []
        summary["actions_count"] = len(actions)
        summary["actions"] = [
            {
                "idx": idx + 1,
                "type": action.get("type"),
                "prompt_chars": len(action.get("prompt") or ""),
                "has_mask_data": bool(action.get("mask_data")),
                "has_bbox": bool(action.get("bbox")),
                "scale": action.get("scale"),
                "direction": action.get("direction"),
                "expand_ratio": action.get("expand_ratio"),
            }
            for idx, action in enumerate(actions)
        ]
    return {key: value for key, value in summary.items() if value is not None}


def _response_summary(resp: Any) -> dict[str, Any]:
    data = resp.model_dump() if hasattr(resp, "model_dump") else {}
    return {
        key: data.get(key)
        for key in ("result_url", "version_id", "output_size", "file_size_kb", "steps", "ai_calls")
        if key in data
    }


def _log_chain(level: int, event: str, **fields: Any) -> None:
    logger.log(level, "[image_edit_chain] %s", json.dumps({"event": event, **fields}, ensure_ascii=False, default=str))


def _request_payload_full(req: Any) -> dict[str, Any]:
    """Return the complete request body for debugging edit-chain inputs.

    Unlike _request_payload_summary, this intentionally does not redact
    image_url / mask_data / base64 fields because edit-chain debugging needs
    the exact frontend payload.
    """
    if hasattr(req, "model_dump"):
        return req.model_dump()
    if hasattr(req, "dict"):
        return req.dict()
    return {}


async def _run_with_chain_logs(
    request: Request,
    endpoint: str,
    req: Any,
    service_func: Callable[[Any], Any],
    *,
    log_full_payload: bool = False,
) -> Any:
    """Run service call with request id, start/end/error logs and elapsed time."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    token = image_edit_service.set_request_id(rid)
    if log_full_payload:
        full_payload = _request_payload_full(req)
        # Keep a plain print as well as structured logger output so the full
        # edit-chain parameters are visible even when logging config filters
        # module loggers in the development terminal.
        payload_json = json.dumps(full_payload, ensure_ascii=False, default=str)
        print(f"[image_edit_chain] edit-chain full params rid={rid}: {payload_json}")
        _log_chain(
            logging.INFO,
            "api.request.full_params",
            rid=rid,
            endpoint=endpoint,
            payload=full_payload,
        )
    _log_chain(
        logging.INFO,
        "api.request.start",
        rid=rid,
        endpoint=endpoint,
        method=request.method,
        path=str(request.url.path),
        client=request.client.host if request.client else None,
        payload=_request_payload_summary(req),
    )
    try:
        resp = await run_in_threadpool(service_func, req)
        _log_chain(
            logging.INFO,
            "api.request.success",
            rid=rid,
            endpoint=endpoint,
            elapsed_ms=_elapsed_ms(started_at),
            response=_response_summary(resp),
        )
        return resp
    except Exception as exc:
        _log_chain(
            logging.ERROR,
            "api.request.failed",
            rid=rid,
            endpoint=endpoint,
            elapsed_ms=_elapsed_ms(started_at),
            exc_type=exc.__class__.__name__,
            exc=str(exc),
            status_code=getattr(exc, "status_code", None),
        )
        raise
    finally:
        image_edit_service.reset_request_id(token)


def _raise_image_edit_http_error(exc: Exception) -> None:
    """Preserve service-provided status codes and return actionable messages."""
    status_code = exc.status_code if isinstance(exc, ImageEditServiceError) else 500
    raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.post("/edit", response_model=ImageEditResponse)
async def api_edit_image(req: ImageEditRequest, request: Request):
    """Unified image editing — natural language instructions with optional mask."""
    try:
        return await _run_with_chain_logs(request, "edit", req, image_edit_service.edit_image)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/edit-chain", response_model=EditChainResponse)
async def api_edit_chain(req: EditChainRequest, request: Request):
    """Multi-step composite editing — execute a sequence of actions in one request.

    Each action uses the previous action's output as its input,
    dramatically reducing token waste compared to N separate round-trips.
    """
    try:
        return await _run_with_chain_logs(
            request,
            "edit-chain",
            req,
            image_edit_service.edit_chain,
            log_full_payload=True,
        )
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/remove-bg", response_model=ImageRemoveBgResponse)
async def api_remove_background(req: ImageRemoveBgRequest, request: Request):
    """Remove image background (white/transparent)."""
    try:
        return await _run_with_chain_logs(request, "remove-bg", req, image_edit_service.remove_background)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/expand", response_model=ImageExpandResponse)
async def api_expand_image(req: ImageExpandRequest, request: Request):
    """AI expand image edges (outpainting)."""
    try:
        return await _run_with_chain_logs(request, "expand", req, image_edit_service.expand_image)
    except Exception as e:
        _raise_image_edit_http_error(e)


@router.post("/upscale", response_model=ImageUpscaleResponse)
async def api_upscale_image(req: ImageUpscaleRequest, request: Request):
    """High-resolution upscale."""
    try:
        return await _run_with_chain_logs(request, "upscale", req, image_edit_service.upscale_image)
    except Exception as e:
        _raise_image_edit_http_error(e)

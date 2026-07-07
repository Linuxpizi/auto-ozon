"""Backend-owned image output size resolution tests."""

import base64
import io

import pytest
from PIL import Image

from app.services.image_edit_service import _prepare_image_and_mask, _resolve_output_size


@pytest.mark.parametrize(
    ("resolution", "size_ratio", "expected_target", "expected_openai_size"),
    [
        ("1k", "1:1", (1000, 1000), "1024x1024"),
        ("2k", "3:4", (1500, 2000), "1024x1536"),
        ("4k", "4:3", (4000, 3000), "1536x1024"),
        ("1024", "16:9", (1024, 576), "1536x1024"),
        ("1.5k", "9:16", (844, 1500), "1024x1536"),
    ],
)
def test_resolve_output_size_from_raw_resolution_and_ratio(
    resolution: str,
    size_ratio: str,
    expected_target: tuple[int, int],
    expected_openai_size: str,
) -> None:
    """Frontend sends raw resolution/ratio; backend resolves business/OpenAI sizes."""
    resolved = _resolve_output_size("ozon_main", resolution=resolution, size_ratio=size_ratio)

    assert (resolved.target_width, resolved.target_height) == expected_target
    assert resolved.openai_size == expected_openai_size


def test_legacy_custom_pixels_still_take_precedence() -> None:
    """Existing custom_width/custom_height callers remain backward compatible."""
    resolved = _resolve_output_size(
        "ozon_main",
        custom_w=1200,
        custom_h=1600,
        resolution="4k",
        size_ratio="1:1",
    )

    assert (resolved.target_width, resolved.target_height) == (1200, 1600)
    assert resolved.openai_size == "1024x1536"


def test_preset_fallback_without_raw_resolution_ratio() -> None:
    """Old output_preset-only requests still resolve on the backend."""
    resolved = _resolve_output_size("ozon_banner")

    assert (resolved.target_width, resolved.target_height) == (1200, 675)
    assert resolved.openai_size == "1536x1024"


def test_prepare_image_and_mask_keeps_input_image_bytes_exactly() -> None:
    """Input image sent to AI must never be resized/re-encoded/normalized."""
    image_buf = io.BytesIO()
    Image.new("RGB", (321, 123), (12, 34, 56)).save(image_buf, format="WEBP")
    original_bytes = image_buf.getvalue()

    mask_buf = io.BytesIO()
    Image.new("L", (10, 10), 255).save(mask_buf, format="PNG")
    mask_b64 = "data:image/png;base64," + base64.b64encode(mask_buf.getvalue()).decode()

    prepared_image, prepared_mask = _prepare_image_and_mask(original_bytes, mask_b64, "1024x1536")

    assert prepared_image == original_bytes
    assert prepared_mask is not None
    with Image.open(io.BytesIO(prepared_mask)) as mask_img:
        assert mask_img.size == (321, 123)

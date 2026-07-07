"""Backend-owned image output size resolution tests."""

import base64
import io

import pytest
from PIL import Image

from app.services.image_edit_service import (
    _composite_masks,
    _prepare_image_and_mask,
    _resize_image_bytes_to_target,
    _resolve_output_size,
)


@pytest.mark.parametrize(
    ("resolution", "size_ratio", "expected_target", "expected_openai_size"),
    [
        ("1k", "1:1", (1000, 1000), "1024x1024"),
        ("1k", "3:4", (750, 1000), "1024x1536"),
        ("1k", "4:3", (1000, 750), "1536x1024"),
        ("1k", "16:9", (1000, 562), "1536x1024"),
        ("1k", "9:16", (562, 1000), "1024x1536"),
        ("2k", "1:1", (2000, 2000), "1024x1024"),
        ("2k", "3:4", (1500, 2000), "1024x1536"),
        ("2k", "4:3", (2000, 1500), "1536x1024"),
        ("2k", "16:9", (2000, 1125), "1536x1024"),
        ("2k", "9:16", (1125, 2000), "1024x1536"),
        ("4k", "1:1", (4000, 4000), "1024x1024"),
        ("4k", "3:4", (3000, 4000), "1024x1536"),
        ("4k", "4:3", (4000, 3000), "1536x1024"),
        ("4k", "16:9", (4000, 2250), "1536x1024"),
        ("4k", "9:16", (2250, 4000), "1024x1536"),
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


def test_prepare_image_and_mask_converts_ui_mask_to_openai_alpha_semantics() -> None:
    """OpenAI mask format: fully transparent pixels are the edit area."""
    image_buf = io.BytesIO()
    Image.new("RGB", (4, 3), (12, 34, 56)).save(image_buf, format="PNG")

    # Project/UI convention before upload: opaque black = keep, opaque white = edit.
    ui_mask = Image.new("RGBA", (4, 3), (0, 0, 0, 255))
    ui_mask.putpixel((1, 1), (255, 255, 255, 255))
    ui_mask.putpixel((2, 1), (255, 255, 255, 255))
    mask_buf = io.BytesIO()
    ui_mask.save(mask_buf, format="PNG")
    mask_b64 = "data:image/png;base64," + base64.b64encode(mask_buf.getvalue()).decode()

    _, prepared_mask = _prepare_image_and_mask(image_buf.getvalue(), mask_b64, "1024x1024")

    assert prepared_mask is not None
    with Image.open(io.BytesIO(prepared_mask)) as mask_img:
        assert mask_img.format == "PNG"
        assert mask_img.mode == "RGBA"
        assert mask_img.size == (4, 3)
        alpha = mask_img.getchannel("A")
        assert alpha.getpixel((1, 1)) == 0
        assert alpha.getpixel((2, 1)) == 0
        assert alpha.getpixel((0, 0)) == 255
        assert alpha.getpixel((3, 2)) == 255
        # RGB is deliberately not used as a secondary black/white mask signal.
        assert mask_img.convert("RGB").getextrema() == ((0, 0), (0, 0), (0, 0))


def test_prepare_image_and_mask_preserves_official_alpha_mask_semantics() -> None:
    """If caller already sends an OpenAI-style alpha mask, alpha defines edit area."""
    image_buf = io.BytesIO()
    Image.new("RGB", (3, 2), (12, 34, 56)).save(image_buf, format="PNG")

    # Official OpenAI convention: alpha 0 = edit. RGB must not matter.
    official_mask = Image.new("RGBA", (3, 2), (255, 255, 255, 255))
    official_mask.putpixel((0, 0), (0, 0, 0, 0))
    official_mask.putpixel((1, 0), (255, 255, 255, 128))
    mask_buf = io.BytesIO()
    official_mask.save(mask_buf, format="PNG")
    mask_b64 = "data:image/png;base64," + base64.b64encode(mask_buf.getvalue()).decode()

    _, prepared_mask = _prepare_image_and_mask(image_buf.getvalue(), mask_b64, "1024x1024")

    assert prepared_mask is not None
    with Image.open(io.BytesIO(prepared_mask)) as mask_img:
        alpha = mask_img.getchannel("A")
        assert alpha.getpixel((0, 0)) == 0
        # OpenAI says fully transparent areas indicate edits; partial alpha is not
        # treated as an edit pixel by the backend.
        assert alpha.getpixel((1, 0)) == 255
        assert alpha.getpixel((2, 1)) == 255


def test_composite_masks_returns_openai_alpha_mask_for_mixed_conventions() -> None:
    """Mask batching must keep official alpha semantics after OR-compositing."""
    image_buf = io.BytesIO()
    Image.new("RGB", (4, 3), (12, 34, 56)).save(image_buf, format="PNG")

    official_mask = Image.new("RGBA", (4, 3), (0, 0, 0, 255))
    official_mask.putpixel((1, 1), (0, 0, 0, 0))
    official_buf = io.BytesIO()
    official_mask.save(official_buf, format="PNG")
    official_b64 = "data:image/png;base64," + base64.b64encode(
        official_buf.getvalue()
    ).decode()

    legacy_mask = Image.new("RGBA", (4, 3), (0, 0, 0, 255))
    legacy_mask.putpixel((2, 1), (255, 255, 255, 255))
    legacy_buf = io.BytesIO()
    legacy_mask.save(legacy_buf, format="PNG")
    legacy_b64 = "data:image/png;base64," + base64.b64encode(
        legacy_buf.getvalue()
    ).decode()

    composite_b64 = _composite_masks([official_b64, legacy_b64], image_buf.getvalue())
    composite_raw = composite_b64.split(",", 1)[1]

    with Image.open(io.BytesIO(base64.b64decode(composite_raw))) as mask_img:
        assert mask_img.mode == "RGBA"
        assert mask_img.size == (4, 3)
        alpha = mask_img.getchannel("A")
        assert alpha.getpixel((1, 1)) == 0
        assert alpha.getpixel((2, 1)) == 0
        assert alpha.getpixel((0, 0)) == 255
        assert alpha.getpixel((3, 2)) == 255


@pytest.mark.parametrize(
    ("source_size", "target_size"),
    [
        ((1086, 1448), (750, 1000)),
        ((1024, 1536), (750, 1000)),
        ((1536, 1024), (1000, 750)),
        ((1024, 1024), (2000, 2000)),
        ((1536, 1024), (4000, 2250)),
        ((1024, 1536), (2250, 4000)),
    ],
)
def test_ai_result_is_normalized_to_business_target_size(
    source_size: tuple[int, int], target_size: tuple[int, int]
) -> None:
    """Saved AI result pixels must exactly match selected 1k/2k/4k+ratio."""
    image_buf = io.BytesIO()
    Image.new("RGB", source_size, (12, 34, 56)).save(image_buf, format="PNG")

    normalized = _resize_image_bytes_to_target(image_buf.getvalue(), *target_size)

    with Image.open(io.BytesIO(normalized)) as img:
        assert img.size == target_size
        assert img.format == "PNG"

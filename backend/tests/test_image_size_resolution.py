"""Backend-owned resolution/ratio handling for OpenAI image edits."""

from app.services.image_edit_service import _resolve_gpt_size, _resolve_target_size


def test_resolution_and_ratio_are_resolved_on_backend() -> None:
    assert _resolve_target_size("ozon_main", resolution="1k", size_ratio="3:4") == (750, 1000)
    assert _resolve_target_size("ozon_main", resolution="2k", size_ratio="16:9") == (2000, 1125)


def test_openai_size_is_adapted_to_supported_canvas() -> None:
    assert _resolve_gpt_size("ozon_main", 750, 1000) == "1024x1536"
    assert _resolve_gpt_size("ozon_detail_h", 2000, 1125) == "1536x1024"
    assert _resolve_gpt_size("ozon_detail_sq", 1000, 1000) == "1024x1024"


def test_legacy_preset_still_resolves_without_frontend_logic() -> None:
    assert _resolve_target_size("ozon_main") == (900, 1200)
    assert _resolve_gpt_size("ozon_main") == "1024x1536"

"""Ozon API test fixtures.

Provides:
- ozon_client  — OzonClient with dummy credentials
- ozon_seller_info_response — a realistic sample response body
- httpx_mock   — pytest-httpx integration for mocking HTTP calls
"""

from typing import Any, Dict

import pytest

from app.services.ozon_client import OzonClient, clear_cache


@pytest.fixture(autouse=True)
def isolate_ozon_client_cache():
    """Keep the process-wide API cache from leaking responses between tests."""
    clear_cache()
    try:
        yield
    finally:
        clear_cache()


@pytest.fixture
def ozon_client() -> OzonClient:
    """Return an OzonClient pre-configured with dummy credentials."""
    return OzonClient(
        client_id="test-client-id-12345",
        api_key="test-api-key-abcde",
    )


@pytest.fixture
def ozon_seller_info_response() -> Dict[str, Any]:
    """Realistic sample response from POST /v1/seller/info.

    Mirrors the structure described in the official Ozon documentation.
    """
    return {
        "result": {
            "id": 123456789,
            "name": "ООО «Тестовая компания»",
            "email": "test@example.com",
            "phone": "+7 495 123-45-67",
            "state": "active",
            "country": "RU",
            "is_legal_entity": True,
            "legal_address": "101000, г. Москва, ул. Тестовая, д. 1",
            "rating": 4.7,
            "registered_at": "2023-01-15T10:30:00Z",
            "created_at": "2023-01-15T10:30:00Z",
            "is_self_employed": False,
            "site": "https://test-company.example.com",
        }
    }

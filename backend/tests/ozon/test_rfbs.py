from typing import Any, Dict

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ozon_client import (
    OzonAuthError,
    OzonClient,
    OzonSellerInfo,
    OzonAPIError,
)


class TestGetSellerInfoSuccess:
    """Tests for the primary success scenario."""

    def test_full_response(
        self,
        ozon_client: OzonClient,
        ozon_seller_info_response: Dict[str, Any],
        httpx_mock: HTTPXMock,
    ):
        """All fields returned by the API are correctly parsed."""
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=ozon_seller_info_response,
            status_code=200,
        )

        info = ozon_client.get_seller_info()

        assert isinstance(info, OzonSellerInfo)
        assert info.id == 123456789
        assert info.name == "ООО «Тестовая компания»"
        assert info.email == "test@example.com"
        assert info.phone == "+7 495 123-45-67"
        assert info.state == "active"
        assert info.country == "RU"
        assert info.is_legal_entity is True
        assert info.legal_address == "101000, г. Москва, ул. Тестовая, д. 1"
        assert info.rating == 4.7
        assert info.registered_at == "2023-01-15T10:30:00Z"
        assert info.created_at == "2023-01-15T10:30:00Z"
        assert info.is_self_employed is False
        assert info.site == "https://test-company.example.com"

    def test_minimal_response(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """API returns only a subset of fields — defaults fill the rest."""
        minimal = {
            "result": {
                "id": 98765,
                "name": "Минимальная компания",
                "email": "minimal@example.com",
                "state": "frozen",
            }
        }
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=minimal,
            status_code=200,
        )

        info = ozon_client.get_seller_info()

        assert info.id == 98765
        assert info.name == "Минимальная компания"
        assert info.email == "minimal@example.com"
        # defaults for missing fields
        assert info.phone == ""
        assert info.state == "frozen"
        assert info.country == ""
        assert info.is_legal_entity is False
        assert info.legal_address is None
        assert info.rating is None
        assert info.is_self_employed is False
        assert info.site == ""

    def test_response_in_wrapper_only(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """Response may have extra wrapping — client reads 'result' or raw."""
        wrapper = {
            "result": {
                "id": 1,
                "name": "Top Level",
                "email": "a@b.com",
                "state": "active",
            }
        }
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=wrapper,
            status_code=200,
        )
        info = ozon_client.get_seller_info()
        assert info.id == 1
        assert info.name == "Top Level"

    def test_auth_headers_sent(
        self,
        ozon_client: OzonClient,
        ozon_seller_info_response: Dict[str, Any],
        httpx_mock: HTTPXMock,
    ):
        """Client-Id and Api-Key headers are included in the request."""
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=ozon_seller_info_response,
            status_code=200,
        )

        ozon_client.get_seller_info()

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers.get("Client-Id") == "test-client-id-12345"
        assert request.headers.get("Api-Key") == "test-api-key-abcde"
        assert request.headers.get("Content-Type") == "application/json"

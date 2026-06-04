"""Tests for Ozon Seller Info API.

Covers:
- Successful retrieval with full / partial response fields
- Authentication errors (401, 403)
- Server errors (500, 503)
- Network / timeout failures
- Edge cases (null fields, unknown extra fields)
"""

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


# ======================================================================
# Happy path — successful responses
# ======================================================================


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
        wrapper = {"result": {"id": 1, "name": "Top Level", "email": "a@b.com", "state": "active"}}
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


# ======================================================================
# Error handling
# ======================================================================


class TestGetSellerInfoErrors:
    """Tests for error states from the Ozon API."""

    @pytest.mark.parametrize(
        ("status_code", "error_cls"),
        [
            (401, OzonAuthError),
            (403, OzonAuthError),
        ],
    )
    def test_auth_errors(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
        status_code: int,
        error_cls: type,
    ):
        """Invalid or missing credentials raise OzonAuthError."""
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json={"error": "Unauthorized", "code": status_code},
            status_code=status_code,
        )

        with pytest.raises(error_cls) as exc:
            ozon_client.get_seller_info()

        assert exc.value.status_code == status_code

    @pytest.mark.parametrize("status_code", [500, 502, 503])
    def test_server_errors(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
        status_code: int,
    ):
        """Server-side errors raise generic OzonAPIError."""
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json={"error": "Internal Server Error"},
            status_code=status_code,
        )

        with pytest.raises(OzonAPIError) as exc:
            ozon_client.get_seller_info()

        assert exc.value.status_code == status_code
        assert isinstance(exc.value, OzonAPIError)
        assert not isinstance(exc.value, OzonAuthError)

    def test_network_timeout(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """Network-level errors propagate as httpx.TimeoutException."""
        httpx_mock.add_exception(
            httpx.TimeoutException("Connection timed out"),
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
        )

        with pytest.raises(httpx.TimeoutException):
            ozon_client.get_seller_info()

    def test_connection_error(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """DNS / connection failures raise httpx.ConnectError."""
        httpx_mock.add_exception(
            httpx.ConnectError("Name or service not known"),
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
        )

        with pytest.raises(httpx.ConnectError):
            ozon_client.get_seller_info()

    def test_empty_response_body(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """Non-JSON or empty body is still captured."""
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            content=b"<html>Bad Gateway</html>",
            status_code=502,
        )

        with pytest.raises(OzonAPIError) as exc:
            ozon_client.get_seller_info()

        assert exc.value.status_code == 502
        assert "<html>Bad Gateway</html>" in str(exc.value)


# ======================================================================
# Edge cases
# ======================================================================


class TestGetSellerInfoEdgeCases:
    """Tests for unusual but valid API responses."""

    def test_null_rating(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """rating can be null (new sellers with no reviews)."""
        payload = {
            "result": {
                "id": 1,
                "name": "New Seller",
                "email": "new@example.com",
                "state": "active",
                "rating": None,
            }
        }
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=payload,
            status_code=200,
        )

        info = ozon_client.get_seller_info()
        assert info.rating is None

    def test_registered_at_uses_created_at_fallback(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """When registered_at is absent, created_at is used as fallback."""
        payload = {
            "result": {
                "id": 1,
                "name": "No Registered",
                "email": "nr@example.com",
                "state": "active",
                "created_at": "2024-06-01T00:00:00Z",
            }
        }
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=payload,
            status_code=200,
        )

        info = ozon_client.get_seller_info()
        assert info.registered_at == "2024-06-01T00:00:00Z"

    def test_extra_fields_in_response_ignored(
        self,
        ozon_client: OzonClient,
        httpx_mock: HTTPXMock,
    ):
        """Extra unknown fields from API don't break parsing."""
        payload = {
            "result": {
                "id": 42,
                "name": "Extra Fields Co",
                "email": "extra@example.com",
                "state": "active",
                "extra_field_1": "ignored",
                "nested": {"foo": "bar"},
            }
        }
        httpx_mock.add_response(
            url=f"{OzonClient.API_BASE}/v1/seller/info",
            method="POST",
            json=payload,
            status_code=200,
        )

        info = ozon_client.get_seller_info()
        assert info.id == 42
        assert info.name == "Extra Fields Co"

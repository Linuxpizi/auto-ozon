"""Ozon Seller API client — handles auth, request signing, and data models.

See https://docs.ozon.ru/api/seller/zh/ for the official API reference.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx


class OzonAPIError(Exception):
    """Raised when the Ozon API returns a non-2xx response."""

    def __init__(self, status_code: int, body: Any, request_id: Optional[str] = None):
        self.status_code = status_code
        self.body = body
        self.request_id = request_id
        super().__init__(f"Ozon API error {status_code}: {body}")


class OzonAuthError(OzonAPIError):
    """Raised on 401 / 403 — invalid or missing credentials."""


def _classify_error(status_code: int, body: Any) -> OzonAPIError:
    if status_code in (401, 403):
        return OzonAuthError(status_code, body)
    return OzonAPIError(status_code, body)


@dataclass
class OzonSellerInfo:
    """Parsed response from POST /v1/seller/info."""
    id: int
    name: str
    email: str
    phone: str
    state: str
    country: str
    is_legal_entity: bool
    legal_address: Optional[str]
    rating: Optional[float]
    registered_at: Optional[str]
    created_at: Optional[str]
    is_self_employed: bool
    site: str


class OzonClient:
    """Thin async+sync wrapper around the Ozon Seller API.

    Usage:
        client = OzonClient(client_id="...", api_key="...")
        info = client.get_seller_info()
    """

    API_BASE = "https://api-seller.ozon.ru"

    def __init__(
        self,
        client_id: str,
        api_key: str,
        timeout: float = 30.0,
    ):
        self._client_id = client_id
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self) -> Dict[str, str]:
        return {
            "Client-Id": self._client_id,
            "Api-Key": self._api_key,
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    def _request(self, method: str, path: str, json_body: Any = None) -> Any:
        url = f"{self.API_BASE}{path}"
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.request(method, url, headers=self._headers(), json=json_body)
        if not resp.is_success:
            raise _classify_error(resp.status_code, resp.text)
        return resp.json()

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def get_seller_info(self) -> OzonSellerInfo:
        """Get seller account information.

        POST /v1/seller/info
        https://docs.ozon.ru/api/seller/zh/#operation/SellerAPI_SellerInfo
        """
        data = self._request("POST", "/v1/seller/info", json_body={})
        result = data.get("result", data)
        return OzonSellerInfo(
            id=result.get("id", 0),
            name=result.get("name", ""),
            email=result.get("email", ""),
            phone=result.get("phone", ""),
            state=result.get("state", ""),
            country=result.get("country", ""),
            is_legal_entity=result.get("is_legal_entity", False),
            legal_address=result.get("legal_address"),
            rating=result.get("rating"),
            registered_at=result.get("registered_at") or result.get("created_at"),
            created_at=result.get("created_at"),
            is_self_employed=result.get("is_self_employed", False),
            site=result.get("site", ""),
        )

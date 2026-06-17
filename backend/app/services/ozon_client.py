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


@dataclass
class OzonWarehouse:
    """Parsed warehouse from POST /v2/warehouse/list."""
    warehouse_id: int
    name: str
    is_rfbs: bool
    status: str


@dataclass
class OzonPostingFBS:
    """An FBS posting from POST /v2/posting/fbs/list."""
    posting_number: str
    order_number: str
    status: str
    sku: str
    product_name: str
    price: float
    quantity: int
    in_process_at: Optional[str]
    created_at: str


@dataclass
class OzonFinanceStatement:
    """Finance statement entry."""
    amount: float
    type: str
    description: str
    posted_at: str


class OzonClient:
    """Thin sync+async wrapper around the Ozon Seller API.

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

    def get_warehouses(self) -> list[OzonWarehouse]:
        """Get warehouse list.

        POST /v2/warehouse/list
        https://docs.ozon.ru/api/seller/zh/#tag/WarehouseAPI
        """
        data = self._request("POST", "/v2/warehouse/list", json_body={})
        result = data.get("result", [])
        warehouses = []
        for item in result:
            warehouses.append(OzonWarehouse(
                warehouse_id=item.get("warehouse_id", 0),
                name=item.get("name", ""),
                is_rfbs=item.get("is_rfbs", False),
                status=item.get("status", ""),
            ))
        return warehouses

    def get_fbs_postings(self, since: Optional[str] = None, limit: int = 100) -> list[OzonPostingFBS]:
        """Get FBS postings.

        POST /v2/posting/fbs/list
        https://docs.ozon.ru/api/seller/zh/#tag/FBS
        """
        payload: dict[str, Any] = {
            "dir": "asc",
            "limit": limit,
            "filter": {"status": ""},
        }
        if since:
            payload["filter"]["since"] = since
        data = self._request("POST", "/v2/posting/fbs/list", json_body=payload)
        result = data.get("result", [])
        postings = []
        for item in result:
            products = item.get("products", [{}])
            product = products[0] if products else {}
            postings.append(OzonPostingFBS(
                posting_number=item.get("posting_number", ""),
                order_number=item.get("order_number", ""),
                status=item.get("status", ""),
                sku=str(product.get("sku", "")),
                product_name=product.get("name", ""),
                price=float(product.get("price", "0") or 0),
                quantity=int(product.get("quantity", 1)),
                in_process_at=item.get("in_process_at"),
                created_at=item.get("created_at", ""),
            ))
        return postings

    def get_finance_statement(self, date_from: str, date_to: str) -> list[OzonFinanceStatement]:
        """Get finance statement.

        POST /v1/finance/statement/list
        https://docs.ozon.ru/api/seller/zh/#tag/FinanceAPI
        """
        payload = {
            "filter": {
                "date_from": date_from,
                "date_to": date_to,
            }
        }
        data = self._request("POST", "/v1/finance/statement/list", json_body=payload)
        result = data.get("result", [])
        statements = []
        for item in result:
            statements.append(OzonFinanceStatement(
                amount=float(item.get("amount", 0)),
                type=item.get("type", ""),
                description=item.get("description", ""),
                posted_at=item.get("posted_at", ""),
            ))
        return statements

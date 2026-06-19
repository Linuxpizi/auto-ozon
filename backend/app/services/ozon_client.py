"""Ozon Seller API client — handles auth, request signing, and data models.

See https://docs.ozon.ru/api/seller/zh/ for the official API reference.
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable, Dict, Optional

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache
# ---------------------------------------------------------------------------

_CACHE: Dict[str, tuple[float, Any]] = {}
CACHE_TTL = 300  # 5 minutes default


def _cache_key(method_name: str, args: tuple, kwargs: dict) -> str:
    raw = f"{method_name}:{args}:{json.dumps(kwargs, sort_keys=True)}"
    return hashlib.md5(raw.encode()).hexdigest()


def _cached(ttl: int = CACHE_TTL) -> Callable:
    """Decorator: cache return value keyed by (class method name + args)."""

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(self, *args, **kwargs):
            key = _cache_key(fn.__name__, args, kwargs)
            now = time.time()
            entry = _CACHE.get(key)
            if entry and (now - entry[0]) < ttl:
                return entry[1]
            result = fn(self, *args, **kwargs)
            _CACHE[key] = (now, result)
            return result

        return wrapper

    return decorator


def clear_cache() -> None:
    """Clear all cached Ozon API responses."""
    _CACHE.clear()


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
    """An FBS posting from POST /v4/posting/fbs/unfulfilled/list."""

    posting_number: str
    order_number: str
    status: str
    substatus: str
    sku: str
    product_name: str
    price: float
    quantity: int
    in_process_at: Optional[str]
    shipment_date: Optional[str]
    tracking_number: str
    is_express: bool


@dataclass
class OzonFinanceStatement:
    """Cash-flow statement entry from POST /v1/finance/cash-flow-statement/list."""

    commission_amount: float
    orders_amount: float
    returns_amount: float
    services_amount: float
    delivery_and_return_amount: float
    currency_code: str
    period_id: int
    period_begin: str
    period_end: str


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

    @_cached(ttl=600)
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

    @_cached(ttl=600)
    def get_warehouses(self) -> list[OzonWarehouse]:
        """Get warehouse list.

        POST /v2/warehouse/list
        https://docs.ozon.ru/api/seller/zh/#tag/WarehouseAPI
        """
        data = self._request("POST", "/v2/warehouse/list", json_body={})
        result = data.get("result", [])
        warehouses = []
        for item in result:
            warehouses.append(
                OzonWarehouse(
                    warehouse_id=item.get("warehouse_id", 0),
                    name=item.get("name", ""),
                    is_rfbs=item.get("is_rfbs", False),
                    status=item.get("status", ""),
                )
            )
        return warehouses

    def get_fbs_postings(
        self,
        cutoff_from: Optional[str] = None,
        cutoff_to: Optional[str] = None,
        statuses: Optional[list[str]] = None,
        limit: int = 100,
        cursor: str = "",
    ) -> tuple[list[OzonPostingFBS], str, bool]:
        """Get unfulfilled FBS postings.

        POST /v4/posting/fbs/unfulfilled/list
        https://docs.ozon.ru/api/seller/zh/#tag/FBS

        Returns (postings, next_cursor, has_next).
        """
        payload: dict[str, Any] = {
            "sort_dir": "asc",
            "limit": limit,
            "cursor": cursor,
            "filter": {},
            "with": {
                "barcodes": True,
                "analytics_data": True,
                "financial_data": True,
                "legal_info": True,
            },
        }
        if cutoff_from:
            payload["filter"]["cutoff_from"] = cutoff_from
        if cutoff_to:
            payload["filter"]["cutoff_to"] = cutoff_to
        if statuses:
            payload["filter"]["statuses"] = statuses
        data = self._request(
            "POST", "/v4/posting/fbs/unfulfilled/list", json_body=payload
        )
        raw_postings = data.get("postings", [])
        next_cursor = data.get("cursor", "")
        has_next = data.get("has_next", False)
        postings = []
        for item in raw_postings:
            products = item.get("products", [{}])
            product = products[0] if products else {}
            price_obj = product.get("price", {})
            price = float(price_obj.get("amount", 0)) if isinstance(price_obj, dict) else float(price_obj or 0)
            postings.append(
                OzonPostingFBS(
                    posting_number=item.get("posting_number", ""),
                    order_number=item.get("order_number", ""),
                    status=item.get("status", ""),
                    substatus=item.get("substatus", ""),
                    sku=str(product.get("sku", "")),
                    product_name=product.get("name", ""),
                    price=price,
                    quantity=int(product.get("quantity", 1)),
                    in_process_at=item.get("in_process_at"),
                    shipment_date=item.get("shipment_date"),
                    tracking_number=item.get("tracking_number", ""),
                    is_express=item.get("is_express", False),
                )
            )
        return postings, next_cursor, has_next

    def get_finance_statement(
        self, date_from: str, date_to: str, page: int = 1, page_size: int = 100
    ) -> tuple[list[OzonFinanceStatement], int]:
        """Get cash-flow statement list (财务报告).

        POST /v1/finance/cash-flow-statement/list
        https://docs.ozon.ru/api/seller/zh/#tag/FinanceAPI

        Returns (statements, page_count).
        """
        payload = {
            "date": {
                "from": date_from,
                "to": date_to,
            },
            "with_details": False,
            "page": page,
            "page_size": page_size,
        }
        data = self._request(
            "POST", "/v1/finance/cash-flow-statement/list", json_body=payload
        )
        result = data.get("result", {})
        page_count = data.get("page_count", 1)
        cash_flows = result.get("cash_flows", [])
        statements = []
        for item in cash_flows:
            period = item.get("period", {})
            statements.append(
                OzonFinanceStatement(
                    commission_amount=float(item.get("commission_amount", 0)),
                    orders_amount=float(item.get("orders_amount", 0)),
                    returns_amount=float(item.get("returns_amount", 0)),
                    services_amount=float(item.get("services_amount", 0)),
                    delivery_and_return_amount=float(
                        item.get("item_delivery_and_return_amount", 0)
                    ),
                    currency_code=item.get("currency_code", ""),
                    period_id=period.get("id", 0),
                    period_begin=period.get("begin", ""),
                    period_end=period.get("end", ""),
                )
            )
        return statements, page_count

    def get_balance_report(self, date_from: str, date_to: str) -> dict:
        """Get balance report (余额报告).

        POST /v1/finance/balance
        https://docs.ozon.ru/api/seller/zh/#tag/FinanceAPI
        """
        payload = {
            "date_from": date_from,
            "date_to": date_to,
        }
        data = self._request("POST", "/v1/finance/balance", json_body=payload)
        total = data.get("total", {})
        cashflows = data.get("cashflows", {})

        # Parse sales & returns from cashflows
        sales = cashflows.get("sales", {})
        returns = cashflows.get("returns", {})
        services = cashflows.get("services", [])

        sales_amount = sales.get("amount", {}).get("value", 0)
        returns_amount = returns.get("amount", {}).get("value", 0)
        services_cost = sum(
            s.get("amount", {}).get("value", 0) for s in services
        )

        opening = total.get("opening_balance", {}).get("value", 0)
        closing = total.get("closing_balance", {}).get("value", 0)
        accrued = total.get("accrued", {}).get("value", 0)
        payments = total.get("payments", [])
        paid = sum(p.get("value", 0) for p in payments)

        return {
            "opening_balance": float(opening),
            "closing_balance": float(closing),
            "accrued": float(accrued),
            "paid": float(paid),
            "sales_amount": float(sales_amount),
            "sales_fee": float(sales.get("fee", {}).get("value", 0)),
            "returns_amount": float(returns_amount),
            "returns_fee": float(returns.get("fee", {}).get("value", 0)),
            "services_cost": float(services_cost),
        }

    def get_product_stocks(self) -> list[dict]:
        """Get product stock info for all products.

        POST /v3/product/info/stocks
        https://docs.ozon.ru/api/seller/zh/#operation/ProductAPI_GetProductInfoStocks

        Returns a list of dicts with keys: sku, product_name, present, reserved.
        """
        result = []
        page = 1
        page_size = 100
        while True:
            payload = {
                "filter": {"visibility": "ALL"},
                "limit": page_size,
                "offset": (page - 1) * page_size,
            }
            data = self._request("POST", "/v3/product/info/stocks", json_body=payload)
            items = data.get("result", {}).get("items", [])
            if not items:
                break
            for item in items:
                stocks = item.get("stocks", [])
                present = sum(s.get("present", 0) for s in stocks)
                reserved = sum(s.get("reserved", 0) for s in stocks)
                result.append(
                    {
                        "sku": str(item.get("sku", "")),
                        "product_name": item.get("name", ""),
                        "present": present,
                        "reserved": reserved,
                    }
                )
            if len(items) < page_size:
                break
            page += 1
        return result

"""Ozon Seller API client — handles auth, request signing, and data models.

See https://docs.ozon.ru/api/seller/zh/ for the official API reference.
"""

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

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
    offer_id: str = ""
    product_id: int = 0
    payout: float = 0.0
    customer_price: float = 0.0
    commission_amount: float = 0.0
    discount_value: float = 0.0
    products_json: str = "[]"
    available_actions: str = "[]"


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


@dataclass
class OzonSellerRating:
    """Parsed seller ratings from POST /v1/seller/info."""

    company_name: str
    currency: str
    ratings: list  # list of {name, rating, current_value, past_value, value_type, status}


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
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.request(method, url, headers=self._headers(), json=json_body)
            if not resp.is_success:
                logger.error(
                    "Ozon API %s %s -> %d: %s",
                    method, path, resp.status_code, resp.text[:500],
                )
                raise _classify_error(resp.status_code, resp.text)
            logger.debug("Ozon API %s %s -> 200", method, path)
            return resp.json()
        except httpx.TimeoutException:
            logger.error("Ozon API %s %s -> TIMEOUT (>%ds)", method, path, self._timeout)
            raise
        except httpx.RequestError as exc:
            logger.error("Ozon API %s %s -> NETWORK ERROR: %s", method, path, exc)
            raise

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
        result = data.get("warehouses", data.get("result", []))
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
            products = item.get("products", [])
            product = products[0] if products else {}
            price_obj = product.get("price", {})
            price = float(price_obj.get("amount", 0)) if isinstance(price_obj, dict) else float(price_obj or 0)

            # Financial data for the first product
            fin_products = (item.get("financial_data") or {}).get("products", [{}])
            fin = fin_products[0] if fin_products else {}
            payout = float(fin.get("payout", 0))
            cust_price_obj = fin.get("customer_price", {})
            if isinstance(cust_price_obj, dict):
                customer_price = float(cust_price_obj.get("amount", 0))
            else:
                customer_price = float(cust_price_obj or 0)
            comm_obj = fin.get("commission", {})
            commission = float(comm_obj.get("amount", 0)) if isinstance(comm_obj, dict) else float(comm_obj or 0)
            discount = float(fin.get("total_discount_value", 0))

            available_actions = json.dumps(item.get("available_actions", []), ensure_ascii=False)
            _products_json = json.dumps([
                {
                    "product_id": int(p.get("product_id", 0)),
                    "quantity": int(p.get("quantity", 1)),
                }
                for p in products
            ], ensure_ascii=False)

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
                    offer_id=product.get("offer_id", ""),
                    product_id=int(product.get("product_id", 0)),
                    payout=payout,
                    customer_price=customer_price,
                    commission_amount=commission,
                    discount_value=discount,
                    products_json=_products_json,
                    available_actions=available_actions,
                )
            )
        return postings, next_cursor, has_next

    def get_finance_statement(
        self, date_from: str, date_to: str, page: int = 1, page_size: int = 100,
        with_details: bool = False,
    ) -> tuple[list[OzonFinanceStatement], int]:
        """Get cash-flow statement list (财务报告).

        POST /v1/finance/cash-flow-statement/list
        https://docs.ozon.ru/api/seller/zh/#tag/FinanceAPI

        Returns (statements, page_count).
        """
        # Ozon cash-flow API requires full ISO timestamps, not plain YYYY-MM-DD
        if "T" not in date_from:
            date_from = f"{date_from}T00:00:00.000Z"
        if "T" not in date_to:
            date_to = f"{date_to}T23:59:59.999Z"
        payload = {
            "date": {
                "from": date_from,
                "to": date_to,
            },
            "with_details": with_details,
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
        services_detail = [
            {"name": s.get("name", ""), "amount": float(s.get("amount", {}).get("value", 0))}
            for s in services
            if s.get("amount", {}).get("value", 0)
        ]

        sales_details = sales.get("amount_details", {})
        returns_details = returns.get("amount_details", {})
        sales_revenue = float(sales_details.get("revenue", {}).get("value", 0))
        sales_partner = float(sales_details.get("partner_programs", {}).get("value", 0))
        returns_revenue = float(returns_details.get("revenue", {}).get("value", 0))
        returns_partner = float(returns_details.get("partner_programs", {}).get("value", 0))

        opening = total.get("opening_balance", {}).get("value", 0)
        closing = total.get("closing_balance", {}).get("value", 0)
        accrued = total.get("accrued", {}).get("value", 0)
        payments = total.get("payments", [])
        paid = sum(p.get("value", 0) for p in payments)

        sales_fee = float(sales.get("fee", {}).get("value", 0))
        returns_fee = float(returns.get("fee", {}).get("value", 0))

        currency_code = (
            total.get("closing_balance", {}).get("currency_code", "")
            or sales.get("amount", {}).get("currency_code", "")
            or "RUB"
        )

        return {
            "opening_balance": float(opening),
            "closing_balance": float(closing),
            "accrued": float(accrued),
            "paid": float(paid),
            "sales_amount": float(sales_amount),
            "sales_fee": sales_fee,
            "sales_revenue": sales_revenue,
            "sales_partner": sales_partner,
            "returns_amount": float(returns_amount),
            "returns_fee": returns_fee,
            "returns_revenue": returns_revenue,
            "returns_partner": returns_partner,
            "services_cost": float(services_cost),
            "services_detail": services_detail,
            "currency_code": currency_code,
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

    @_cached(ttl=3600)
    def get_seller_rating(self) -> OzonSellerRating:
        """Get seller ratings from POST /v1/seller/info."""
        data = self._request("POST", "/v1/seller/info", json_body={})
        company = data.get("company", {})
        ratings = data.get("ratings", [])
        return OzonSellerRating(
            company_name=company.get("name", ""),
            currency=company.get("currency", ""),
            ratings=ratings,
        )

    # ------------------------------------------------------------------
    # Product
    # ------------------------------------------------------------------

    def get_product_list(self, visibility: str = "ALL") -> list:
        """Get all products via POST /v3/product/list with cursor pagination.

        Returns list of raw product dicts.
        """
        result = []
        last_id = ""
        while True:
            body = {
                "filter": {"visibility": visibility},
                "last_id": last_id,
                "limit": 1000,
            }
            data = self._request("POST", "/v3/product/list", json_body=body)
            items = data.get("result", {}).get("items", [])
            for item in items:
                result.append({
                    "product_id": str(item.get("product_id", "")),
                    "offer_id": item.get("offer_id", ""),
                    "has_fbo_stocks": item.get("has_fbo_stocks", False),
                    "has_fbs_stocks": item.get("has_fbs_stocks", False),
                    "archived": item.get("archived", False),
                    "is_discounted": item.get("is_discounted", False),
                })
            if not items:
                break
            new_last_id = str(data.get("result", {}).get("last_id", ""))
            if new_last_id == last_id:
                break
            last_id = new_last_id
        return result

    def archive_product(self, product_ids: list[int]) -> bool:
        """Archive products. POST /v1/product/archive.

        Args:
            product_ids: list of product_id integers.
        """
        data = self._request("POST", "/v1/product/archive", json_body={"product_id": product_ids})
        return bool(data.get("result", False))

    def get_product_info_list(self, product_ids: list[str]) -> list[dict]:
        """Get detailed product info via POST /v3/product/info/list.

        API allows max 1000 product_ids per request. This method handles
        batching automatically.

        Returns list of dicts with keys: sku, name, primary_image, price,
        old_price, vat, etc. (raw API response items).
        """
        result = []
        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i:i + 1000]
            data = self._request(
                "POST", "/v3/product/info/list",
                json_body={"product_id": batch},
            )
            result.extend(data.get("items", []))
        return result

    def get_images_by_offer_ids(self, offer_ids: list[str]) -> dict[str, str]:
        """Look up primary_image for a batch of offer_ids via /v3/product/info.

        Returns {offer_id: image_url}.
        """
        result: dict[str, str] = {}
        for i in range(0, len(offer_ids), 1000):
            batch = offer_ids[i:i + 1000]
            data = self._request(
                "POST", "/v3/product/info",
                json_body={"offer_id": batch},
            )
            for item in data.get("result", {}).get("items", []):
                oid = item.get("offer_id", "")
                img = item.get("primary_image", "")
                if oid and img:
                    result[oid] = img
        return result

    def get_images_by_product_ids(self, product_ids: list[int]) -> dict[int, str]:
        """Look up primary_image for a batch of product_ids via /v3/product/info/list.

        Returns {product_id: image_url}.
        """
        result: dict[int, str] = {}
        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i:i + 1000]
            data = self._request(
                "POST", "/v3/product/info/list",
                json_body={"product_id": batch},
            )
            for item in data.get("result", {}).get("items", []):
                pid = item.get("id", 0)
                img = item.get("primary_image", "")
                if pid and img:
                    result[pid] = img
        return result

    def import_products_by_sku(self, items: list[dict]) -> dict:
        """Create or update products via POST /v3/product/import.

        Args:
            items: list of dicts with complete product info.
        """
        data = self._request("POST", "/v3/product/import", json_body={"items": items})
        return data

    def update_stocks(self, stock_items: list[dict]) -> dict:
        """Update product stock quantities.

        POST /v2/products/stocks
        https://docs.ozon.ru/api/seller/zh/#operation/ProductAPI_ProductsStocksV2

        Args:
            stock_items: list of dicts with keys: product_id, stock, warehouse_id.
        """
        data = self._request("POST", "/v2/products/stocks", json_body={"stocks": stock_items})
        return data

    # ------------------------------------------------------------------
    # FBS Ship
    # ------------------------------------------------------------------

    def ship_fbs_posting(
        self,
        posting_number: str,
        packages: list[dict],
    ) -> dict:
        """Ship (prepare) an FBS posting.

        POST /v4/posting/fbs/ship
        https://docs.ozon.ru/api/seller/zh/#operation/PostingAPI_ShipFbsPostingV4

        Note: HTTP 200 does NOT guarantee success.
        Check via /v3/posting/fbs/get — if substatus == 'ship_failed', retry.
        """
        payload = {
            "posting_number": posting_number,
            "packages": packages,
            "with": {"additional_data": True},
        }
        return self._request("POST", "/v4/posting/fbs/ship", json_body=payload)

    # ------------------------------------------------------------------
    # FBS Cancel
    # ------------------------------------------------------------------

    def cancel_fbs_posting(self, posting_number: str) -> dict:
        """Cancel an FBS posting.

        POST /v3/posting/fbs/cancel
        https://docs.ozon.ru/api/seller/zh/#operation/PostingAPI_CancelPostingV3
        """
        payload = {"posting_number": posting_number}
        return self._request("POST", "/v3/posting/fbs/cancel", json_body=payload)

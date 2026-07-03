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


def _cache_key(method_name: str, args: tuple, kwargs: dict, client_id: str = "") -> str:
    raw = f"{method_name}:{client_id}:{args}:{json.dumps(kwargs, sort_keys=True)}"
    return hashlib.md5(raw.encode()).hexdigest()


def _cached(ttl: int = CACHE_TTL) -> Callable:
    """Decorator: cache return value keyed by (client_id + method name + args)."""

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(self, *args, **kwargs):
            client_id = getattr(self, "_client_id", "") or ""
            key = _cache_key(fn.__name__, args, kwargs, client_id=client_id)
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
    """An FBS posting from POST /v4/posting/fbs/list."""

    posting_number: str
    order_number: str
    status: str
    substatus: str
    sku: str
    product_name: str
    price: float
    unit_price: float
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
    currency_code: str = ""
    products_json: str = "[]"
    available_actions: str = "[]"
    cancellation_initiator: str = ""
    cancellation_reason: str = ""
    cancellation_reason_message: str = ""
    cancelled_at: str = ""


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
class OzonFbsErrorIndex:
    """Parsed response from POST /v1/rating/index/fbs/info."""

    index: float
    currency_code: str
    period_from: str
    period_to: str
    processing_costs_sum: float
    defects: list  # list of {date, index_by_date, processing_costs_sum_by_date}


@dataclass
class OzonSellerRating:
    """Parsed seller ratings from POST /v1/seller/info."""

    company_name: str
    currency: str
    ratings: (
        list  # list of {name, rating, current_value, past_value, value_type, status}
    )


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
                resp = client.request(
                    method, url, headers=self._headers(), json=json_body
                )
            if not resp.is_success:
                logger.error(
                    "Ozon API %s %s -> %d: %s",
                    method,
                    path,
                    resp.status_code,
                    resp.text[:500],
                )
                raise _classify_error(resp.status_code, resp.text)
            logger.debug("Ozon API %s %s -> 200", method, path)
            return resp.json()
        except httpx.TimeoutException:
            logger.error(
                "Ozon API %s %s -> TIMEOUT (>%ds)", method, path, self._timeout
            )
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
        since: Optional[str] = None,
        to: Optional[str] = None,
        statuses: Optional[list[str]] = None,
        limit: int = 100,
        cursor: str = "",
    ) -> tuple[list[OzonPostingFBS], str, bool]:
        """Get all FBS postings.

        POST /v4/posting/fbs/list
        https://docs.ozon.ru/api/seller/zh/#tag/FBS

        Unlike the deprecated /v4/posting/fbs/unfulfilled/list,
        this endpoint returns orders in ALL statuses including
        cancelled ones.

        ``since`` and ``to`` are required by this endpoint.
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
        if since:
            payload["filter"]["since"] = since
        if to:
            payload["filter"]["to"] = to
        if statuses:
            payload["filter"]["statuses"] = statuses
        data = self._request("POST", "/v4/posting/fbs/list", json_body=payload)
        raw_postings = data.get("postings", [])
        next_cursor = data.get("cursor", "")
        has_next = data.get("has_next", False)
        postings = []
        for item in raw_postings:
            products = item.get("products", [])

            # --- aggregate across ALL products in this posting -------------------
            total_price = 0.0  # sum of (unit_price × quantity) for all products
            total_quantity = 0
            total_payout = 0.0
            total_customer_price = 0.0
            total_commission = 0.0
            total_discount = 0.0

            # Currency code from the price object
            currency_code = ""

            # Use the first product for single-product display fields
            # NOTE: product_id, sku, offer_id are three DISTINCT Ozon identifiers.
            # product_id (int) = Ozon internal product ID (used by Ship API)
            # sku (int) = Ozon SKU number (NOT the same as product_id)
            # offer_id (str) = seller's own SKU code
            first_product = products[0] if products else {}
            first_product_id = int(first_product.get("product_id", 0))

            fin_products = (item.get("financial_data") or {}).get("products", [])
            # Build a lookup by product_id for financial data
            fin_by_pid: dict[int, dict] = {}
            for fp in fin_products:
                fin_by_pid[int(fp.get("product_id", 0))] = fp

            _products_json_items: list[dict] = []
            first_unit_price = 0.0
            first_customer_price = 0.0
            for p in products:
                # Per-unit price from the products[].price.amount field
                p_price_obj = p.get("price", {})
                if isinstance(p_price_obj, dict):
                    unit_price = float(p_price_obj.get("amount", 0))
                    if not currency_code:
                        currency_code = str(p_price_obj.get("currency", ""))
                else:
                    unit_price = float(p_price_obj or 0)
                qty = int(p.get("quantity", 1))
                total_price += unit_price * qty
                total_quantity += qty

                # Accumulate financial data for this product.
                # fin_by_pid is keyed by financial_data.product_id — must match on product_id only.
                pid = int(p.get("product_id", 0))
                fin = fin_by_pid.get(pid, {})
                total_payout += float(fin.get("payout", 0))
                cp_obj = fin.get("customer_price", {})
                if isinstance(cp_obj, dict):
                    cp_val = float(cp_obj.get("amount", 0))
                else:
                    cp_val = float(cp_obj or 0)
                total_customer_price += cp_val
                if not first_unit_price and unit_price > 0:
                    first_unit_price = unit_price
                if not first_customer_price and cp_val > 0:
                    first_customer_price = cp_val
                co_obj = fin.get("commission", {})
                if isinstance(co_obj, dict):
                    total_commission += float(co_obj.get("amount", 0))
                else:
                    total_commission += float(co_obj or 0)
                total_discount += float(fin.get("total_discount_value", 0))

                _products_json_items.append(
                    {
                        "product_id": pid,
                        "sku": str(p.get("sku", "")),
                        "offer_id": p.get("offer_id", ""),
                        "name": p.get("name", ""),
                        "quantity": qty,
                        "unit_price": unit_price,
                    }
                )

            # If no products array, fall back to first product (legacy compat)
            if not products:
                total_price = 0.0
                total_quantity = 0

            available_actions = json.dumps(
                item.get("available_actions", []), ensure_ascii=False
            )
            _products_json = json.dumps(_products_json_items, ensure_ascii=False)

            # Extract cancellation data if present
            cancellation = item.get("cancellation", {})
            if isinstance(cancellation, dict):
                cancel_initiator = cancellation.get("cancellation_initiator", "")
                cancel_reason = cancellation.get("cancellation_reason", "")
                cancel_reason_msg = cancellation.get("cancellation_reason_message", "")
                cancel_at = cancellation.get("cancelled_at", "")
            else:
                cancel_initiator = ""
                cancel_reason = ""
                cancel_reason_msg = ""
                cancel_at = ""

            postings.append(
                OzonPostingFBS(
                    posting_number=item.get("posting_number", ""),
                    order_number=item.get("order_number", ""),
                    status=item.get("status", ""),
                    substatus=item.get("substatus", ""),
                    sku=str(first_product.get("sku", "")),
                    product_name=first_product.get("name", ""),
                    price=total_price,
                    unit_price=first_unit_price,
                    quantity=total_quantity,
                    in_process_at=item.get("in_process_at"),
                    shipment_date=item.get("shipment_date"),
                    tracking_number=item.get("tracking_number", ""),
                    is_express=item.get("is_express", False),
                    offer_id=first_product.get("offer_id", ""),
                    product_id=first_product_id,
                    payout=total_payout,
                    customer_price=total_customer_price,
                    commission_amount=total_commission,
                    discount_value=total_discount,
                    currency_code=currency_code,
                    products_json=_products_json,
                    available_actions=available_actions,
                    cancellation_initiator=cancel_initiator,
                    cancellation_reason=cancel_reason,
                    cancellation_reason_message=cancel_reason_msg,
                    cancelled_at=cancel_at,
                )
            )
        return postings, next_cursor, has_next

    def get_finance_statement(
        self,
        date_from: str,
        date_to: str,
        page: int = 1,
        page_size: int = 100,
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
        services_cost = sum(s.get("amount", {}).get("value", 0) for s in services)
        services_detail = [
            {
                "name": s.get("name", ""),
                "amount": float(s.get("amount", {}).get("value", 0)),
            }
            for s in services
            if s.get("amount", {}).get("value", 0)
        ]

        sales_details = sales.get("amount_details", {})
        returns_details = returns.get("amount_details", {})
        sales_revenue = float(sales_details.get("revenue", {}).get("value", 0))
        sales_partner = float(sales_details.get("partner_programs", {}).get("value", 0))
        returns_revenue = float(returns_details.get("revenue", {}).get("value", 0))
        returns_partner = float(
            returns_details.get("partner_programs", {}).get("value", 0)
        )

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
        result = data.get("result", data)
        company = result.get("company", {})
        ratings = result.get("ratings", [])
        return OzonSellerRating(
            company_name=company.get("name", ""),
            currency=company.get("currency", ""),
            ratings=ratings,
        )

    # ------------------------------------------------------------------
    # Product
    # ------------------------------------------------------------------

    def get_product_list(
        self, visibility: str = "ALL", start_last_id: str = ""
    ) -> tuple[list, str]:
        """Get all products via POST /v3/product/list with cursor pagination.

        Args:
            visibility: ALL or ARCHIVED.
            start_last_id: Resume from a previously-persisted cursor to skip
                already-fetched pages.

        Returns (list_of_raw_product_dicts, final_last_id).
        The final_last_id can be persisted so the next sync resumes here.
        """
        result = []
        last_id = start_last_id
        while True:
            body = {
                "filter": {"visibility": visibility},
                "last_id": last_id,
                "limit": 1000,
            }
            data = self._request("POST", "/v3/product/list", json_body=body)
            items = data.get("result", {}).get("items", [])
            for item in items:
                result.append(
                    {
                        "product_id": str(item.get("product_id", "")),
                        "offer_id": item.get("offer_id", ""),
                        "has_fbo_stocks": item.get("has_fbo_stocks", False),
                        "has_fbs_stocks": item.get("has_fbs_stocks", False),
                        "archived": item.get("archived", False),
                        "is_discounted": item.get("is_discounted", False),
                    }
                )
            if not items:
                break
            new_last_id = str(data.get("result", {}).get("last_id", ""))
            if new_last_id == last_id:
                break
            last_id = new_last_id
        return result, last_id

    def archive_product(self, product_ids: list[int]) -> bool:
        """Archive products. POST /v1/product/archive.

        Args:
            product_ids: list of product_id integers.
        """
        data = self._request(
            "POST", "/v1/product/archive", json_body={"product_id": product_ids}
        )
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
            batch = product_ids[i : i + 1000]
            data = self._request(
                "POST",
                "/v3/product/info/list",
                json_body={"product_id": batch},
            )
            result.extend(data.get("items", []))
        return result

    def get_images_by_offer_ids(self, offer_ids: list[str]) -> dict[str, str]:
        """Look up primary_image for a batch of offer_ids via /v3/product/info/list.

        Returns {offer_id: image_url}.
        """
        result: dict[str, str] = {}
        for i in range(0, len(offer_ids), 1000):
            batch = offer_ids[i : i + 1000]
            data = self._request(
                "POST",
                "/v3/product/info/list",
                json_body={"offer_id": batch},
            )
            for item in data.get("result", {}).get("items", []):
                oid = item.get("offer_id", "")
                img = item.get("primary_image", "")
                if oid and img:
                    result[oid] = img
        return result

    # ------------------------------------------------------------------
    # Returns (退货)
    # ------------------------------------------------------------------

    def get_return_orders(
        self,
        last_id: int = 0,
        limit: int = 500,
        filter: dict | None = None,
    ) -> tuple[list[dict], int, bool]:
        """Get return orders (rFBS).

        POST /v2/returns/rfbs/list
        https://docs.ozon.ru/api/seller/zh/?__rr=1#operation/RFBSReturnsAPI_ReturnsRfbsListV2

        Args:
            last_id: Identifier of the last return_id from previous page.
                     Leave 0 for the first request.
            limit: Number of values per page (max 500).
            filter: Optional filter dict. Supported keys per Ozon docs:
                    - offer_id (str)
                    - posting_number (str)
                    - group_state (list[str])
                    - created_at (dict): {"from": "ISO-datetime", "to": "ISO-datetime"}

        Returns (returns_list, next_last_id, has_next).
        """
        payload: dict[str, Any] = {
            "filter": filter or {},
            "last_id": last_id,
            "limit": limit,
        }

        data = self._request("POST", "/v2/returns/rfbs/list", json_body=payload)
        returns_list = data.get("returns", [])
        next_last_id = returns_list[-1]["return_id"] if returns_list else last_id
        has_next = data.get("has_next", False)
        return returns_list, next_last_id, has_next

    def get_images_by_product_ids(self, product_ids: list[int]) -> dict[int, str]:
        """Look up primary_image for a batch of product_ids via /v3/product/info/list.

        Returns {product_id: image_url}.
        """
        result: dict[int, str] = {}
        for i in range(0, len(product_ids), 1000):
            batch = product_ids[i : i + 1000]
            data = self._request(
                "POST",
                "/v3/product/info/list",
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
        data = self._request(
            "POST", "/v2/products/stocks", json_body={"stocks": stock_items}
        )
        return data

    # ------------------------------------------------------------------
    # FBS Ship
    # ------------------------------------------------------------------

    def get_fbs_posting_detail(
        self,
        posting_number: str,
    ) -> Optional[dict]:
        """Get a single FBS posting detail.

        POST /v3/posting/fbs/get
        https://docs.ozon.ru/api/seller/zh/#operation/PostingAPI_GetPostingFBS

        Returns the full posting dict including cancellation data,
        or None on error.
        """
        payload = {
            "posting_number": posting_number,
            "with": {
                "financial_data": True,
                "analytics_data": True,
            },
        }
        try:
            data = self._request("POST", "/v3/posting/fbs/get", json_body=payload)
            return data.get("result", {})
        except Exception as exc:
            logger.warning(
                "get_fbs_posting_detail failed for %s: %s", posting_number, exc
            )
            return None

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

    # ------------------------------------------------------------------
    # Rating / Error Index
    # ------------------------------------------------------------------

    @_cached(ttl=3600)
    def get_fbs_error_index(self) -> OzonFbsErrorIndex:
        """Get FBS error index.

        POST /v1/rating/index/fbs/info
        https://docs.ozon.ru/api/seller/zh/#tag/Rating
        """
        data = self._request("POST", "/v1/rating/index/fbs/info", json_body={})
        result = data.get("result", data)
        return OzonFbsErrorIndex(
            index=result.get("index", 0),
            currency_code=result.get("currency_code", ""),
            period_from=result.get("period_from", ""),
            period_to=result.get("period_to", ""),
            processing_costs_sum=result.get("processing_costs_sum", 0),
            defects=result.get("defects", []),
        )

    # ------------------------------------------------------------------
    # Intelligence: Pricing Strategy
    # ------------------------------------------------------------------

    def get_pricing_strategies(self, page: int = 1, limit: int = 40) -> dict:
        """Get all pricing strategies.

        POST /v1/pricing-strategy/list
        Ozon returns {"strategies": [...], "total": N} directly.
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/list",
            json_body={"page": page, "limit": limit},
        )
        return data

    def get_pricing_strategy_info(self, strategy_id: str) -> dict:
        """Get pricing strategy details including competitors.

        POST /v1/pricing-strategy/info
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/info",
            json_body={"strategy_id": strategy_id},
        )
        return data.get("result", data)

    def create_pricing_strategy(
        self, strategy_name: str, competitors: list[dict] | None = None
    ) -> dict:
        """Create a new pricing strategy.

        POST /v1/pricing-strategy/create
        """
        payload: dict[str, Any] = {"strategy_name": strategy_name}
        if competitors:
            payload["competitors"] = competitors
        data = self._request("POST", "/v1/pricing-strategy/create", json_body=payload)
        return data.get("result", data)

    def update_pricing_strategy(
        self,
        strategy_id: str,
        name: str | None = None,
        competitors: list[dict] | None = None,
    ) -> dict:
        """Update pricing strategy name and competitors.

        POST /v1/pricing-strategy/update
        """
        payload: dict[str, Any] = {"strategy_id": strategy_id}
        if name is not None:
            payload["strategy_name"] = name
        if competitors is not None:
            payload["competitors"] = competitors
        data = self._request("POST", "/v1/pricing-strategy/update", json_body=payload)
        return data.get("result", data)

    def delete_pricing_strategy(self, strategy_id: str) -> dict:
        """Delete a pricing strategy.

        POST /v1/pricing-strategy/delete
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/delete",
            json_body={"strategy_id": strategy_id},
        )
        return data

    def set_pricing_strategy_status(self, strategy_id: str, is_active: bool) -> dict:
        """Enable or disable a pricing strategy.

        POST /v1/pricing-strategy/status
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/status",
            json_body={"strategy_id": strategy_id, "is_active": is_active},
        )
        return data

    def get_pricing_competitors(self, page: int = 1, limit: int = 30) -> dict:
        """Get available competitors list.

        POST /v1/pricing-strategy/competitors/list
        Ozon returns {"competitor": [...], "total": N} directly.
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/competitors/list",
            json_body={"page": page, "limit": limit},
        )
        return data

    def get_pricing_strategy_products(self, strategy_id: str) -> list[dict]:
        """Get products bound to a pricing strategy.

        POST /v1/pricing-strategy/products/list
        Ozon returns {"product_id": [...]} directly.
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/products/list",
            json_body={"strategy_id": strategy_id},
        )
        # Ozon returns product IDs as a flat list, not product objects
        product_ids = data.get(
            "product_id", data.get("result", {}).get("product_id", [])
        )
        if isinstance(product_ids, list):
            # Convert to list of dicts with product_id for frontend consistency
            return [{"product_id": pid} for pid in product_ids]
        return []

    def add_products_to_pricing_strategy(
        self, strategy_id: str, product_ids: list[str]
    ) -> dict:
        """Bind products to a pricing strategy.

        POST /v1/pricing-strategy/products/add
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/products/add",
            json_body={"strategy_id": strategy_id, "product_id": product_ids},
        )
        return data

    def delete_products_from_pricing_strategy(
        self, strategy_id: str, product_ids: list[str]
    ) -> dict:
        """Remove products from a pricing strategy.

        POST /v1/pricing-strategy/products/delete
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/products/delete",
            json_body={"strategy_id": strategy_id, "product_id": product_ids},
        )
        return data

    def get_competitor_product_price(self, product_id: int) -> dict:
        """Get competitor price for a specific product.

        POST /v1/pricing-strategy/product/info
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/product/info",
            json_body={"product_id": product_id},
        )
        return data.get("result", data)

    def get_strategy_ids_by_product_ids(self, product_ids: list[str]) -> dict:
        """Check which strategies are bound to given products.

        POST /v1/pricing-strategy/strategy-ids-by-product-ids
        """
        data = self._request(
            "POST",
            "/v1/pricing-strategy/strategy-ids-by-product-ids",
            json_body={"product_id": product_ids},
        )
        return data.get("result", data)

    # ------------------------------------------------------------------
    # Intelligence: Platform Promotions (Promos)
    # ------------------------------------------------------------------

    def get_platform_actions(self) -> list[dict]:
        """Get available Ozon platform promotions.

        GET /v1/actions
        """
        data = self._request("GET", "/v1/actions")
        return data.get("result", [])

    def get_platform_action_products(
        self,
        action_id: int,
        limit: int = 100,
        last_id: str = "",
    ) -> dict:
        """Get products in a platform promotion.

        POST /v1/actions/products
        """
        payload: dict[str, Any] = {
            "action_id": action_id,
            "limit": limit,
            "offset": 0,
        }
        if last_id:
            payload["last_id"] = last_id
            del payload["offset"]
        data = self._request("POST", "/v1/actions/products", json_body=payload)
        return data.get("result", data)

    def activate_products_in_action(
        self,
        action_id: int,
        products: list[dict],
    ) -> dict:
        """Add products to a platform promotion.

        POST /v1/actions/products/activate

        Args:
            products: list of dicts with keys: product_id, action_price, stock.
        """
        data = self._request(
            "POST",
            "/v1/actions/products/activate",
            json_body={"action_id": action_id, "products": products},
        )
        return data

    def deactivate_products_in_action(
        self,
        action_id: int,
        product_ids: list[int],
    ) -> dict:
        """Remove products from a platform promotion.

        POST /v1/actions/products/deactivate
        """
        data = self._request(
            "POST",
            "/v1/actions/products/deactivate",
            json_body={"action_id": action_id, "product_ids": product_ids},
        )
        return data

    # ------------------------------------------------------------------
    # Intelligence: Seller Actions (Seller Promotions)
    # ------------------------------------------------------------------

    def get_seller_actions(self) -> dict:
        """Get seller-created promotions.

        POST /v1/seller-actions/list
        Ozon returns {"actions": [...], "total": N} directly.
        """
        data = self._request(
            "POST",
            "/v1/seller-actions/list",
            json_body={"limit": 100, "offset": 0},
        )
        return data

    def create_seller_action(self, action_params: dict) -> dict:
        """Create a seller promotion.

        POST /v1/seller-actions/create

        Args:
            action_params: dict with keys like title, date_start, date_end,
                discount_type, discount_value, budget, etc.
        """
        data = self._request(
            "POST",
            "/v1/seller-actions/create",
            json_body={"action_parameters": action_params},
        )
        return data

    def update_seller_action(self, action_id: int, action_params: dict) -> dict:
        """Update a seller promotion.

        PUT /v1/seller-actions/{action_id}
        """
        data = self._request(
            "PUT",
            f"/v1/seller-actions/{action_id}",
            json_body={"action_parameters": action_params},
        )
        return data

    def delete_seller_action(self, action_id: int) -> dict:
        """Delete a seller promotion.

        DELETE /v1/seller-actions/{action_id}
        """
        data = self._request("DELETE", f"/v1/seller-actions/{action_id}")
        return data

    def get_seller_action_products(self, action_id: int) -> dict:
        """Get products in a seller promotion.

        POST /v1/seller-actions/products/list
        """
        data = self._request(
            "POST",
            "/v1/seller-actions/products/list",
            json_body={"action_id": action_id},
        )
        return data.get("result", data)

    def add_products_to_seller_action(
        self, action_id: int, products: list[dict]
    ) -> dict:
        """Add products to a seller promotion.

        POST /v1/seller-actions/products/add

        Args:
            products: list of dicts with keys: product_id, action_price, stock.
        """
        data = self._request(
            "POST",
            "/v1/seller-actions/products/add",
            json_body={"action_id": action_id, "products": products},
        )
        return data

    def delete_products_from_seller_action(
        self, action_id: int, product_ids: list[int]
    ) -> dict:
        """Remove products from a seller promotion.

        POST /v1/seller-actions/products/delete
        """
        data = self._request(
            "POST",
            "/v1/seller-actions/products/delete",
            json_body={"action_id": action_id, "product_ids": product_ids},
        )
        return data

    # ------------------------------------------------------------------
    # Product API — Category Tree & Attributes
    # ------------------------------------------------------------------

    def get_category_tree(
        self,
        category_id: int = 0,
        language: str = "ZH_HANS",
    ) -> list[dict]:
        """Get Ozon description category tree.

        POST /v1/description-category/tree
        https://docs.ozon.ru/api/seller/zh/#tag/ProductAPI/operation/DescriptionCategoryTree

        Args:
            category_id: Parent category ID (0 for root).
            language: Language code. 'ZH' for Chinese.

        Returns:
            List of category dicts with keys: category_id, category_name, children, etc.
        """
        payload: dict[str, Any] = {
            "language": language,
            "category_id": category_id,
        }
        data = self._request(
            "POST",
            "/v1/description-category/tree",
            json_body=payload,
        )
        return data.get("result", [])

    def get_category_attributes(
        self,
        description_category_id: int,
        type_id: int = 0,
        language: str = "ZH_HANS",
    ) -> list[dict]:
        """Get required/optional attributes for a description category.

        POST /v1/description-category/attribute
        https://docs.ozon.ru/api/seller/zh/#tag/ProductAPI/operation/DescriptionCategoryAttribute

        Args:
            description_category_id: The description_category_id from the tree.
            type_id: The type_id within the category (0 for all types).
            language: Language code.

        Returns:
            List of attribute dicts with keys: id, name, description_attribute_id,
            type, is_collection, is_required, dictionary_id, etc.
        """
        payload: dict[str, Any] = {
            "description_category_id": description_category_id,
            "language": language,
        }
        if type_id:
            payload["type_id"] = type_id
        data = self._request(
            "POST",
            "/v1/description-category/attribute",
            json_body=payload,
        )
        return data.get("result", [])

    def get_category_attribute_values(
        self,
        description_category_id: int,
        attribute_id: int,
        type_id: int = 0,
        language: str = "ZH",
        last_value_id: int = 0,
        limit: int = 100,
    ) -> list[dict]:
        """Get dictionary values for a specific category attribute.

        POST /v1/description-category/attribute/values

        Useful when an attribute has type="Dictionary" — you need the
        dictionary_value_id to submit in the product import payload.

        Args:
            description_category_id: The description_category_id.
            attribute_id: The attribute ID to look up values for.
            type_id: Optional type_id filter.
            language: Language code.
            last_value_id: Pagination cursor.
            limit: Max values to return.

        Returns:
            List of value dicts with keys: value_id, value, etc.
        """
        payload: dict[str, Any] = {
            "description_category_id": description_category_id,
            "attribute_id": attribute_id,
            "language": language,
            "last_value_id": last_value_id,
            "limit": limit,
        }
        if type_id:
            payload["type_id"] = type_id
        data = self._request(
            "POST",
            "/v1/description-category/attribute/values",
            json_body=payload,
        )
        return data.get("result", [])

    # ------------------------------------------------------------------
    # Product API — Import & Status
    # ------------------------------------------------------------------

    def import_products(self, items: list[dict]) -> dict:
        """Create or update products via POST /v3/product/import.

        This is the main product upload endpoint. Each item should contain:
            - offer_id: Your unique SKU identifier
            - name: Product title
            - description_category_id: Ozon category ID
            - type_id: Ozon type ID within the category
            - attributes: List of attribute dicts [{complex_id, id, values}]
            - price: Price in kopecks (amount × 100)
            - images: List of image URLs
            - weight, height, depth, width: Dimensions
            - status: 'processed' to auto-publish

        Returns:
            Dict with 'result' containing task_ids for async processing.
        """
        data = self._request(
            "POST",
            "/v3/product/import",
            json_body={"items": items},
        )
        return data

    def get_import_tasks_status(
        self,
        task_ids: list[int],
    ) -> list[dict]:
        """Check status of product import tasks.

        POST /v1/product/import/info

        Args:
            task_ids: List of task IDs returned by import_products.

        Returns:
            List of task status dicts with keys: task_id, status, last_updated, etc.
        """
        data = self._request(
            "POST",
            "/v1/product/import/info",
            json_body={"task_id": task_ids},
        )
        return data.get("result", [])

    def get_product_list_by_task_id(
        self,
        task_id: int,
        last_id: int = 0,
        limit: int = 100,
    ) -> list[dict]:
        """Get product info from an import task.

        POST /v1/product/import/info/list

        Args:
            task_id: Task ID from import_products response.
            last_id: Pagination cursor (last product_id).
            limit: Max results.

        Returns:
            List of product info dicts.
        """
        data = self._request(
            "POST",
            "/v1/product/import/info/list",
            json_body={
                "task_id": task_id,
                "last_id": last_id,
                "limit": limit,
            },
        )
        return data.get("result", {}).get("items", [])

    def archive_product(self, product_ids: list[int]) -> dict:
        """Archive products.

        POST /v1/product/archive
        """
        data = self._request(
            "POST",
            "/v1/product/archive",
            json_body={"product_id": product_ids},
        )
        return data

    def unarchive_product(self, product_ids: list[int]) -> dict:
        """Unarchive products.

        POST /v1/product/unarchive
        """
        data = self._request(
            "POST",
            "/v1/product/unarchive",
            json_body={"product_id": product_ids},
        )
        return data

    def get_product_attributes(
        self,
        product_id: int = 0,
        offer_id: str = "",
        limit: int = 100,
        last_attribute_id: int = 0,
    ) -> list[dict]:
        """Get attributes for a specific product.

        POST /v3/products/info/attributes

        Args:
            product_id: Ozon product ID (use either this or offer_id).
            offer_id: Your SKU identifier (use either this or product_id).
            limit: Max attributes to return.
            last_attribute_id: Pagination cursor.

        Returns:
            List of attribute dicts.
        """
        payload: dict[str, Any] = {
            "limit": limit,
            "last_attribute_id": last_attribute_id,
        }
        if product_id:
            payload["filter"] = {"product_id": [product_id]}
        elif offer_id:
            payload["filter"] = {"offer_id": [offer_id]}
        data = self._request(
            "POST",
            "/v3/products/info/attributes",
            json_body=payload,
        )
        return data.get("result", {}).get("items", [])

    def delete_product(self, product_ids: list[int]) -> dict:
        """Delete products (FBS only).

        POST /v1/product/delete
        """
        data = self._request(
            "POST",
            "/v1/product/delete",
            json_body={"product_id": product_ids},
        )
        return data

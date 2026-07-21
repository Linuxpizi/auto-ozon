import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.db import get_db
from app.crud.upload_draft import get_ozonbox_package_attributes, upsert_ozonbox_product_record
from app.models.listing import Listing
from app.models.store import Store
from app.schemas.ozonbox import (
    CategoryResult,
    OzonboxEnvelope,
    PackageFactsQuery,
    PackageShopFacts,
    ProductIdList,
    ProductIdValue,
    ProductRecord,
    ProductRecordSaved,
    SafeStore,
)
from app.services.ozon_client import OzonAPIError, OzonClient

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_user)])


def _category_result(category_id: int, type_id: int | None = None) -> CategoryResult:
    return CategoryResult(
        categoryId=category_id,
        descriptionCategoryId=category_id,
        typeId=type_id if type_id and type_id > 0 else None,
    )


@router.get("/store/list", response_model=OzonboxEnvelope[list[SafeStore]])
def list_ozonbox_stores(db: Session = Depends(get_db)):
    stores = db.query(Store).order_by(Store.id.asc()).all()
    result = [
        SafeStore(
            id=store.id,
            name=store.name,
            storeName=store.name,
            clientId=store.client_id,
            status=store.status,
            usable=store.status == "active" and bool(store.client_id and store.api_key),
        )
        for store in stores
    ]
    return OzonboxEnvelope(data=result)


@router.post("/online-product/info", response_model=OzonboxEnvelope[CategoryResult])
def category_from_online_product(
    query: ProductIdList,
    store_id: int = Query(alias="storeId", gt=0),
    db: Session = Depends(get_db),
):
    if len(query.product_id) != 1:
        raise HTTPException(422, "online-product/info 一次只接受一个 product_id")
    if not db.query(Store.id).filter(Store.id == store_id).first():
        raise HTTPException(404, "店铺不存在")
    product_id = str(query.product_id[0])
    listing = (
        db.query(Listing)
        .filter(Listing.store_id == store_id, Listing.sku == product_id)
        .order_by(Listing.id.desc())
        .first()
    )
    if not listing:
        listing = (
            db.query(Listing)
            .filter(Listing.store_id == store_id, Listing.product_id == product_id)
            .order_by(Listing.id.desc())
            .first()
        )
    if not listing or not listing.category_id or listing.category_id <= 0:
        raise HTTPException(404, "本地没有该商品的真实类目信息")
    return OzonboxEnvelope(data=_category_result(listing.category_id, listing.type_id))


def _category_from_product_info(item: dict) -> CategoryResult | None:
    try:
        category_id = int(item.get("description_category_id") or 0)
        type_id = int(item.get("type_id") or 0)
    except (TypeError, ValueError):
        return None
    if category_id > 0:
        return _category_result(category_id, type_id if type_id > 0 else None)
    return None


def _matching_item(
    items: list[dict], identifier: str, identifier_keys: tuple[str, ...]
) -> dict | None:
    for item in items:
        if not isinstance(item, dict):
            continue
        if any(str(item.get(key) or "") == identifier for key in identifier_keys):
            return item
    return None


_ATTRIBUTES_COMPATIBILITY_STATUSES = {400, 405, 410, 422, 501}
_ATTRIBUTES_ENDPOINT_NOT_FOUND_MESSAGES = {
    "endpoint not found",
    "method not found",
    "page not found",
}


def _ozon_error_message(exc: OzonAPIError) -> str:
    if isinstance(exc.body, dict):
        message = exc.body.get("message")
    else:
        message = exc.body
    return str(message or "").strip().lower()


def _is_attributes_item_not_found(exc: OzonAPIError) -> bool:
    return exc.status_code == 404 and _ozon_error_message(exc) == "item not found"


def _is_attributes_compatibility_error(exc: OzonAPIError) -> bool:
    if exc.status_code in _ATTRIBUTES_COMPATIBILITY_STATUSES:
        return True
    return (
        exc.status_code == 404
        and _ozon_error_message(exc) in _ATTRIBUTES_ENDPOINT_NOT_FOUND_MESSAGES
    )


def _get_compatible_product_attributes(
    client: OzonClient, identifier_type: str, identifier: str
) -> list[dict]:
    """Use v4 when available without hiding auth, outage, or network errors."""
    try:
        return client.get_product_attributes(**{identifier_type: [identifier]})
    except OzonAPIError as exc:
        if _is_attributes_item_not_found(exc):
            logger.info(
                "Ozon attributes returned no item for exact %s lookup "
                "(identifier=%s, request_id=%s)",
                identifier_type,
                identifier,
                exc.request_id or "-",
            )
            return []
        if not _is_attributes_compatibility_error(exc):
            raise
        logger.warning(
            "Ozon attributes endpoint is incompatible with %s lookup "
            "(status=%d, message=%s, request_id=%s); using v3 result",
            identifier_type,
            exc.status_code,
            _ozon_error_message(exc) or "-",
            exc.request_id or "-",
        )
        return []


@router.post("/ozon/products/info", response_model=OzonboxEnvelope[CategoryResult])
def category_from_ozon_api(
    query: ProductIdValue,
    client_id: str = Query(alias="clientId", min_length=1),
    db: Session = Depends(get_db),
):
    store = db.query(Store).filter(Store.client_id == client_id).first()
    if not store:
        raise HTTPException(404, "clientId 对应的店铺不存在")
    if not store.api_key:
        raise HTTPException(422, "店铺缺少 Ozon API key")
    identifier = str(query.product_id)
    client = OzonClient(store.client_id, store.api_key)
    exact_item_found = False
    try:
        # Ozon PDP URLs expose the public SKU, not Seller API product_id.
        # Prefer v3 because it supports SKU lookup, returns the authoritative
        # category fields, and is available to stores where v4 attributes is
        # rejected or no longer enabled.
        sku_items = client.get_product_info_list(skus=[identifier])
        sku_item = _matching_item(sku_items, identifier, ("sku",))
        if sku_item is not None:
            exact_item_found = True
            result = _category_from_product_info(sku_item)
            if result:
                return OzonboxEnvelope(data=result)

            # Only ask v4 for this namespace when v3 proved that the exact
            # product exists but omitted its authoritative category fields.
            sku_attributes = _get_compatible_product_attributes(
                client, "skus", identifier
            )
            sku_attribute = _matching_item(sku_attributes, identifier, ("sku",))
            if sku_attribute is not None:
                result = _category_from_product_info(sku_attribute)
                if result:
                    return OzonboxEnvelope(data=result)

        # Retain compatibility with older callers that supplied Seller API
        # product_id instead of the public SKU.
        product_items = client.get_product_info_list([identifier])
        product_item = _matching_item(
            product_items, identifier, ("id", "product_id")
        )
        if product_item is not None:
            exact_item_found = True
            result = _category_from_product_info(product_item)
            if result:
                return OzonboxEnvelope(data=result)

            product_attributes = _get_compatible_product_attributes(
                client, "product_ids", identifier
            )
            product_attribute = _matching_item(
                product_attributes, identifier, ("id", "product_id")
            )
            if product_attribute is not None:
                result = _category_from_product_info(product_attribute)
                if result:
                    return OzonboxEnvelope(data=result)
    except (OzonAPIError, httpx.RequestError) as exc:
        logger.warning("Ozon category lookup failed for %s: %s", query.product_id, exc)
        raise HTTPException(502, "Ozon 商品类目查询失败") from exc

    if not exact_item_found:
        raise HTTPException(
            404,
            "所选店铺的 Ozon Seller API 中没有该商品；公开商品可能不属于该店铺",
        )
    raise HTTPException(404, "Ozon 返回中没有明确的真实类目信息")


@router.post("/product-record/save", response_model=OzonboxEnvelope[ProductRecordSaved])
def save_product_record(record: ProductRecord, db: Session = Depends(get_db)):
    store = db.query(Store).filter(Store.id == record.store_id).first()
    if not store:
        raise HTTPException(404, "店铺不存在")
    product_id = record.product_id
    data = {
        "store_id": record.store_id,
        "source_product_key": product_id,
        "ozonbox_record_name": record.record_name,
        "ozonbox_product_id": product_id,
        "ozonbox_source_url": str(record.source_url),
        "ozonbox_sku": record.sku,
        "ozonbox_title": record.title,
        "ozonbox_title_ru": record.title_ru,
        "ozonbox_description": record.description,
        "ozonbox_description_ru": record.description_ru,
        "ozonbox_tags": record.tags,
        "ozonbox_images": [str(value) for value in record.images],
        "ozonbox_price": record.price,
        "ozonbox_specs": record.specs,
        "ozonbox_variants": [
            variant.model_dump(mode="json", by_alias=False) for variant in record.variants
        ],
        "ozonbox_variant_attr_ids": record.variant_attr_ids,
        "ozonbox_category_path": record.category_path,
        "ozonbox_category_id": record.category_id,
        "ozonbox_type_id": record.type_id,
        "ozonbox_description_category_id": record.description_category_id,
        # Keep legacy columns explicit and fact-free for this source.
        "source_product_id": None,
        "source_sku": None,
        "source_name": None,
        "source_url": None,
        "source_images": None,
        "description_category_id": None,
        "type_id": None,
        "offer_id": None,
        "name": None,
        "description": None,
        "price_cny": None,
        "price_rub": None,
        "old_price_rub": None,
        "vat": None,
        "weight": None,
        "height": None,
        "depth": None,
        "width": None,
        "primary_image": None,
        "images": None,
    }
    saved = upsert_ozonbox_product_record(db, data)
    result = ProductRecordSaved(
        id=saved.id,
        storeId=saved.store_id,
        productId=product_id,
        status="draft",
    )
    return OzonboxEnvelope(data=result)


@router.post(
    "/system/sku/shops",
    response_model=OzonboxEnvelope[list[PackageShopFacts]],
)
def get_package_facts(query: PackageFactsQuery, db: Session = Depends(get_db)):
    attributes = get_ozonbox_package_attributes(db, query.sku)
    return OzonboxEnvelope(
        data=[PackageShopFacts(attributes=attributes, categories=[])] if attributes else []
    )
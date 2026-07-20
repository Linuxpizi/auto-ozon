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
        .filter(Listing.store_id == store_id, Listing.product_id == product_id)
        .order_by(Listing.id.desc())
        .first()
    )
    if not listing or not listing.category_id or listing.category_id <= 0:
        raise HTTPException(404, "本地没有该商品的真实类目信息")
    return OzonboxEnvelope(data=_category_result(listing.category_id, listing.type_id))


def _category_from_product_info(item: dict) -> CategoryResult | None:
    category_id = item.get("description_category_id")
    type_id = item.get("type_id")
    if isinstance(category_id, int) and category_id > 0:
        return _category_result(category_id, type_id if isinstance(type_id, int) else None)
    return None


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
    try:
        items = OzonClient(store.client_id, store.api_key).get_product_info_list([str(query.product_id)])
    except (OzonAPIError, httpx.RequestError) as exc:
        logger.warning("Ozon category lookup failed for %s: %s", query.product_id, exc)
        raise HTTPException(502, "Ozon 商品类目查询失败") from exc
    for item in items:
        if str(item.get("id") or item.get("product_id") or "") == str(query.product_id):
            result = _category_from_product_info(item)
            if result:
                return OzonboxEnvelope(data=result)
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
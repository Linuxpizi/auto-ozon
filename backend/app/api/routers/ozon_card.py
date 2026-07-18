"""Compatibility API for the complete Ozon list/detail information cards."""

from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import scraped_product as scraped_product_crud
from app.models.scraped_product import ScrapedProductRecord


router = APIRouter(prefix="/system/sku")


class SkuRequest(BaseModel):
    sku: str


def _first_value(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "" and value != [] and value != {}:
            return value
    return None


def _iso_datetime(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _card_data(record: ScrapedProductRecord | None, sku: str) -> Dict[str, Any]:
    if record is None:
        return {"article": sku}

    metrics = record.ozon_metrics if isinstance(record.ozon_metrics, dict) else {}
    data: Dict[str, Any] = dict(metrics)
    mapped = {
        "article": _first_value(metrics.get("article"), metrics.get("articleNumber"), sku),
        "brand": _first_value(record.brand, metrics.get("brand")),
        "catname": _first_value(record.category, metrics.get("category")),
        "monthsales": _first_value(metrics.get("monthsales"), metrics.get("monthlySales")),
        "gmvSum": _first_value(metrics.get("gmvSum"), metrics.get("monthlyRevenue")),
        "salesDynamics": _first_value(metrics.get("salesDynamics"), metrics.get("turnoverDynamics")),
        "gnumber": _first_value(metrics.get("gnumber"), metrics.get("followersCount")),
        "priceMin": _first_value(metrics.get("priceMin"), metrics.get("minPrice")),
        "priceMax": _first_value(metrics.get("priceMax"), metrics.get("maxPrice")),
        "views": metrics.get("views"),
        "convViewToOrder": _first_value(metrics.get("convViewToOrder"), metrics.get("conversionRate")),
        "avgprice": metrics.get("avgprice"),
        "createDate": _iso_datetime(
            _first_value(metrics.get("createDate"), metrics.get("listedAt"))
        ),
        "sources": _first_value(
            metrics.get("sources"), metrics.get("logisticsType"), metrics.get("deliveryMethod")
        ),
    }
    volume_cm3 = _first_value(metrics.get("volumeCm3"), metrics.get("volume_cm3"))
    if metrics.get("volume") is not None:
        mapped["volume"] = metrics["volume"]
    elif volume_cm3 is not None:
        try:
            mapped["volume"] = float(volume_cm3) / 1000
        except (TypeError, ValueError):
            pass

    # Do not replace meaningful values with null; the card renderer treats omitted
    # fields as unavailable and keeps the full card layout visible.
    data.update({key: value for key, value in mapped.items() if value is not None})
    return data


def _shops_data(record: ScrapedProductRecord | None) -> Dict[str, List[Dict[str, Any]]]:
    if record is None:
        return {"attributes": [], "categories": []}

    spec_list = record.spec_list if isinstance(record.spec_list, list) else []
    spec = spec_list[0] if spec_list and isinstance(spec_list[0], dict) else {}
    attribute_values = {
        "9454": _first_value(spec.get("package_depth_mm"), spec.get("package_length_mm"), spec.get("depth_mm")),
        "9455": _first_value(spec.get("package_width_mm"), spec.get("width_mm")),
        "9456": _first_value(spec.get("package_height_mm"), spec.get("height_mm")),
        "4497": _first_value(spec.get("package_weight_g"), spec.get("weight_g")),
        "23171": _first_value(spec.get("subject_tags"), spec.get("subjectTags")),
    }
    attributes = [
        {"key": key, "value": str(value)}
        for key, value in attribute_values.items()
        if value is not None
    ]

    category_path = str(record.category or "").strip()
    category_names = [part.strip() for part in category_path.split(">") if part.strip()]
    categories: List[Dict[str, Any]] = []
    for index, name in enumerate(category_names, start=1):
        category: Dict[str, Any] = {"level": index, "name": name}
        if index == len(category_names) and record.ozon_category_id:
            category["id"] = record.ozon_category_id
        categories.append(category)

    return {"attributes": attributes, "categories": categories}


@router.get("/skuss/new")
def get_sku_card(
    sku: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    normalized_sku = sku.strip()
    record = scraped_product_crud.get_ozon_product_by_sku(db, normalized_sku)
    return {"code": 200, "msg": "success", "data": _card_data(record, normalized_sku)}


@router.post("/shops")
def get_sku_shops(payload: SkuRequest, db: Session = Depends(get_db)):
    normalized_sku = payload.sku.strip()
    record = scraped_product_crud.get_ozon_product_by_sku(db, normalized_sku)
    return {"code": 200, "msg": "success", "data": [_shops_data(record)]}
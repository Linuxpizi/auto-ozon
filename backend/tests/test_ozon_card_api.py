from datetime import datetime

from app.models.scraped_product import ScrapedProductRecord


def _record(**overrides):
    values = {
        "platform": "ozon",
        "source_id": "123456789",
        "brand": "Test Brand",
        "category": "Electronics > Accessories",
        "price": 990.0,
        "old_price": 1290.0,
        "review_count": 77,
        "scraped_at": datetime(2026, 7, 17, 12, 0, 0),
        "sku_list": [{"sku": "SKU-ALIAS", "barcode": ""}],
        "spec_list": [{
            "package_depth_mm": 210,
            "package_width_mm": 120,
            "package_height_mm": 35,
            "package_weight_g": 450,
            "subject_tags": "summer",
        }],
        "ozon_category_id": 456,
        "ozon_metrics": {
            "articleNumber": "ARTICLE-1",
            "monthlySales": 32,
            "monthlyRevenue": 31680,
            "turnoverDynamics": "+12%",
            "followersCount": 8,
            "minPrice": 900,
            "maxPrice": 1300,
            "conversionRate": 4.5,
            "volumeCm3": 882,
            "logisticsType": "FBO",
        },
    }
    values.update(overrides)
    return ScrapedProductRecord(**values)


def test_sku_card_maps_collected_record(test_app, test_db):
    test_db.add(_record())
    test_db.commit()

    response = test_app.get("/api/system/sku/skuss/new", params={"sku": "123456789"})

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 200
    assert body["data"]["article"] == "ARTICLE-1"
    assert body["data"]["brand"] == "Test Brand"
    assert body["data"]["catname"] == "Electronics > Accessories"
    assert body["data"]["monthsales"] == 32
    assert body["data"]["gmvSum"] == 31680
    assert body["data"]["priceMin"] == 900
    assert body["data"]["priceMax"] == 1300
    assert body["data"]["volume"] == 0.882


def test_sku_card_finds_sku_list_alias(test_app, test_db):
    test_db.add(_record())
    test_db.commit()

    response = test_app.get("/api/system/sku/skuss/new", params={"sku": "SKU-ALIAS"})

    assert response.status_code == 200
    assert response.json()["data"]["brand"] == "Test Brand"


def test_sku_card_does_not_invent_business_metrics_from_unrelated_record_fields(test_app, test_db):
    test_db.add(_record(ozon_metrics={}))
    test_db.commit()

    response = test_app.get("/api/system/sku/skuss/new", params={"sku": "123456789"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert "views" not in data  # review_count is not impressions
    assert "createDate" not in data  # scraped_at is not listing date
    assert "avgprice" not in data  # current price is not historical average price
    assert "priceMin" not in data
    assert "priceMax" not in data


def test_missing_sku_keeps_card_contract_without_404(test_app):
    response = test_app.get("/api/system/sku/skuss/new", params={"sku": "UNKNOWN-SKU"})

    assert response.status_code == 200
    assert response.json() == {
        "code": 200,
        "msg": "success",
        "data": {"article": "UNKNOWN-SKU"},
    }


def test_sku_shops_maps_packaging_and_categories(test_app, test_db):
    test_db.add(_record())
    test_db.commit()

    response = test_app.post("/api/system/sku/shops", json={"sku": "SKU-ALIAS"})

    assert response.status_code == 200
    first = response.json()["data"][0]
    assert {item["key"]: item["value"] for item in first["attributes"]} == {
        "9454": "210",
        "9455": "120",
        "9456": "35",
        "4497": "450",
        "23171": "summer",
    }
    assert first["categories"] == [
        {"level": 1, "name": "Electronics"},
        {"level": 2, "name": "Accessories", "id": 456},
    ]


def test_missing_sku_shops_returns_empty_success_shape(test_app):
    response = test_app.post("/api/system/sku/shops", json={"sku": "UNKNOWN-SKU"})

    assert response.status_code == 200
    assert response.json() == {
        "code": 200,
        "msg": "success",
        "data": [{"attributes": [], "categories": []}],
    }
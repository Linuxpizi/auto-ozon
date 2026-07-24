"""Focused coverage for authenticated sparse Ozon list-card synchronization."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.crud.scraped_product import _parse_ozon_list_count, _parse_ozon_list_number
from app.models.scraped_product import ScrapedProductRecord


ROUTE = "/api/browser-sync/ozon-list-products"
SCRAPED_AT = "2026-07-24T01:00:00"


def _auth_headers(client: TestClient, email: str) -> dict[str, str]:
    registered = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "name": "Ozon list test"},
    )
    assert registered.status_code == 201
    return {"Authorization": f"Bearer {registered.json()['access_token']}"}


def _card(sku: str = "2957860286", **overrides) -> dict:
    payload = {
        "sku": sku,
        "title": "Factual list card",
        "imageUrl": "https://cdn.example/list-card.jpg",
        "productUrl": f"https://www.ozon.ru/product/factual-{sku}/",
        "price": "1 299,50 ₽",
        "originalPrice": "1.999 ₽",
        "discount": "-35%",
        "promoJoined": "参加",
        "promoName": "Hot Sale",
        "promoStock": "Осталось 7",
        "rating": "4,9",
        "reviewCount": "1,2 тыс. отзывов",
        "pointsReview": "500 баллов за отзыв",
        "brandCert": "Оригинальный товар",
        "scrapedAt": SCRAPED_AT,
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1 299 ₽", 1299.0),
        ("1\u00a0299,50 ₽", 1299.5),
        ("1.299 ₽", 1299.0),
        ("4,9", 4.9),
        ("нет цены", None),
    ],
)
def test_parse_ozon_list_number(value: str, expected: float | None) -> None:
    assert _parse_ozon_list_number(value) == expected


def test_parse_ozon_list_abbreviated_count() -> None:
    assert _parse_ozon_list_count("1,2 тыс. отзывов") == 1
    assert _parse_ozon_list_count("2,5k отзывов") == 2500
    assert _parse_ozon_list_count("3 млн оценок") == 3


def test_ozon_list_route_requires_authentication(test_app: TestClient) -> None:
    response = test_app.post(ROUTE, json={"products": [_card()]})
    assert response.status_code == 401


def test_sparse_create_maps_only_list_facts_and_deduplicates_request(
    test_app: TestClient,
    test_db: Session,
) -> None:
    headers = _auth_headers(test_app, "ozon-list-create@example.com")
    response = test_app.post(
        ROUTE,
        headers=headers,
        json={
            "products": [
                _card(title="First observed title", promoName=""),
                _card(title="Latest factual title", promoName="Hot Sale"),
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"created": 1, "updated": 0, "skipped": 1}
    record = test_db.query(ScrapedProductRecord).one()
    assert record.platform == "ozon"
    assert record.source_id == "2957860286"
    assert record.title == "Latest factual title"
    assert record.price == pytest.approx(1299.5)
    assert record.old_price == pytest.approx(1999.0)
    assert record.currency == "RUB"
    assert record.rating == pytest.approx(4.9)
    assert record.review_count == 1
    assert record.images == ["https://cdn.example/list-card.jpg"]
    assert record.scraped_at == datetime.fromisoformat(SCRAPED_AT)
    assert {fact["name"] for fact in record.facts} == {
        "促销参与状态",
        "促销名称",
        "促销库存文本",
        "积分评价",
        "品牌认证",
    }
    assert all(fact["sourcePath"] == "Ozon list card" for fact in record.facts)

    # List-card text is not permission to fabricate PDP-only catalog fields.
    assert record.sku_list == []
    assert record.variants == []
    assert record.stock == ""
    assert record.brand == ""
    assert record.category == ""

    identical = test_app.post(ROUTE, headers=headers, json={"products": [_card(title="Latest factual title")]})
    assert identical.status_code == 200
    assert identical.json() == {"created": 0, "updated": 0, "skipped": 1}


def test_sparse_update_preserves_rich_detail_data_and_merges_fact_provenance(
    test_app: TestClient,
    test_db: Session,
) -> None:
    headers = _auth_headers(test_app, "ozon-list-preserve@example.com")
    rich = ScrapedProductRecord(
        platform="ozon",
        source_id="2957860286",
        title="A much richer product detail title that must survive",
        price=1000.0,
        old_price=1500.0,
        currency="RUB",
        images=["https://cdn.example/pdp-1.jpg", "https://cdn.example/pdp-2.jpg"],
        rating=4.8,
        review_count=5000,
        brand="Protected PDP brand",
        category="Электроника > Аксессуары",
        stock="Осталось 5 штук",
        sku_list=[{"sku": "2957860286", "stock": 5}],
        variants=[{"sku": "2957860286", "values": [{"name": "Цвет", "value": "Черный"}]}],
        facts=[{"name": "Материал", "value": "Сталь", "sourcePath": "Ozon PDP characteristics"}],
        source_url="https://www.ozon.ru/product/factual-2957860286/",
        scraped_at=datetime.fromisoformat(SCRAPED_AT),
    )
    test_db.add(rich)
    test_db.commit()

    response = test_app.post(
        ROUTE,
        headers=headers,
        json={"products": [_card(price="1 399 ₽", reviewCount="10 отзывов", promoName="List promotion")]},
    )

    assert response.status_code == 200
    assert response.json() == {"created": 0, "updated": 1, "skipped": 0}
    test_db.refresh(rich)
    assert rich.title == "A much richer product detail title that must survive"
    assert rich.images == ["https://cdn.example/pdp-1.jpg", "https://cdn.example/pdp-2.jpg"]
    assert rich.price == pytest.approx(1399.0)
    assert rich.review_count == 5000
    assert rich.brand == "Protected PDP brand"
    assert rich.category == "Электроника > Аксессуары"
    assert rich.stock == "Осталось 5 штук"
    assert rich.sku_list == [{"sku": "2957860286", "stock": 5}]
    assert rich.variants == [{"sku": "2957860286", "values": [{"name": "Цвет", "value": "Черный"}]}]
    assert {fact["sourcePath"] for fact in rich.facts} == {"Ozon PDP characteristics", "Ozon list card"}


def test_legacy_duplicate_updates_oldest_matching_row_only(
    test_app: TestClient,
    test_db: Session,
) -> None:
    headers = _auth_headers(test_app, "ozon-list-legacy@example.com")
    oldest = ScrapedProductRecord(platform="ozon", source_id="12345", title="oldest", price=10.0)
    newer = ScrapedProductRecord(platform="ozon", source_id="12345", title="newer", price=20.0)
    test_db.add_all([oldest, newer])
    test_db.commit()

    response = test_app.post(
        ROUTE,
        headers=headers,
        json={"products": [_card("12345", title="", price="30 ₽", originalPrice="", scrapedAt=None)]},
    )

    assert response.status_code == 200
    assert response.json() == {"created": 0, "updated": 1, "skipped": 0}
    test_db.refresh(oldest)
    test_db.refresh(newer)
    assert oldest.price == 30.0
    assert newer.price == 20.0
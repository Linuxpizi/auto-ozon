"""Persistence coverage for Ozon facts, colors, and real SKU variants."""

from datetime import datetime

from app.crud.scraped_product import bulk_create_scraped_products
from app.models.scraped_product import ScrapedProductRecord
from app.schemas.scraped_product import ScrapedProductCreate


def test_schema_normalizes_extension_payload() -> None:
    product = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "123456",
            "title": "Test product",
            "brand": "Factual Brand",
            "category": "Электроника > Аксессуары",
            "colorList": ["Black", "Blue"],
            "skuList": '[{"sku":"SKU-1","barcode":"460000000001"}]',
            "facts": '[{"name":"Color","value":"Black","sourcePath":"BCS card"}]',
            "variants": '[{"sku":"SKU-1","values":[{"name":"Color","value":"Black"}]}]',
            "scrapedAt": "2026-07-18T12:00:00Z",
        }
    )

    assert product.source_id == "123456"
    assert product.brand == "Factual Brand"
    assert product.category == "Электроника > Аксессуары"
    assert product.color_list == ["Black", "Blue"]
    assert product.sku_list == [{"sku": "SKU-1", "barcode": "460000000001"}]
    assert product.facts == [
        {"name": "Color", "value": "Black", "sourcePath": "BCS card"}
    ]
    assert product.variants == [
        {"sku": "SKU-1", "values": [{"name": "Color", "value": "Black"}]}
    ]
    assert isinstance(product.scraped_at, datetime)
    assert product.scraped_at.isoformat() == "2026-07-18T12:00:00+00:00"


def test_bulk_upsert_persists_and_preserves_product_brand_and_source_category(test_db) -> None:
    initial = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "brand-category-1",
            "title": "Product with source facts",
            "brand": "Initial Brand",
            "category": "Электроника > Аксессуары",
        }
    )

    created = bulk_create_scraped_products(test_db, [initial])
    assert len(created) == 1
    record = created[0]
    assert record.brand == "Initial Brand"
    assert record.category == "Электроника > Аксессуары"

    omitted = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "brand-category-1",
            "brand": "",
            "category": "",
        }
    )
    assert bulk_create_scraped_products(test_db, [omitted]) == []
    test_db.refresh(record)
    assert record.brand == "Initial Brand"
    assert record.category == "Электроника > Аксессуары"

    enriched = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "brand-category-1",
            "brand": "Updated Factual Brand",
            "category": "Электроника > Аксессуары > Кабели",
        }
    )
    updated = bulk_create_scraped_products(test_db, [enriched])
    assert updated == [record]
    test_db.refresh(record)
    assert record.brand == "Updated Factual Brand"
    assert record.category == "Электроника > Аксессуары > Кабели"

    persisted = (
        test_db.query(ScrapedProductRecord)
        .filter(ScrapedProductRecord.source_id == "brand-category-1")
        .one()
    )
    assert persisted.brand == "Updated Factual Brand"
    assert persisted.category == "Электроника > Аксессуары > Кабели"


def test_bulk_upsert_preserves_and_enriches_collected_product_data(test_db) -> None:
    initial = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "123456",
            "title": "BCS list product",
            "facts": [
                {"name": "Color", "value": "Black", "sourcePath": "BCS card"},
                {"name": "Warehouse", "value": "Moscow", "sourcePath": "BCS card"},
            ],
            "colorList": ["Black"],
            "variants": [{"sku": "SKU-1", "values": []}],
        }
    )

    created = bulk_create_scraped_products(test_db, [initial])

    assert len(created) == 1
    record = created[0]
    assert record.facts == initial.facts
    assert record.color_list == ["Black"]
    assert record.variants == [{"sku": "SKU-1", "values": []}]

    detail = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "123456",
            "title": "Detailed product",
            "facts": [
                {"name": "color", "value": "black", "sourcePath": "detail DOM"},
                {"name": "About product", "value": "Water resistant", "sourcePath": "Ozon API"},
            ],
            "colorList": ["black", "Blue"],
            "variants": [
                {
                    "sku": "SKU-1",
                    "values": [
                        {"name": "Color", "value": "Black"},
                        {"name": "Size", "value": "M"},
                    ],
                }
            ],
        }
    )

    updated = bulk_create_scraped_products(test_db, [detail])

    assert len(updated) == 1
    test_db.refresh(record)
    assert record.title == "Detailed product"
    assert record.facts == [
        {"name": "Color", "value": "Black", "sourcePath": "BCS card"},
        {"name": "Warehouse", "value": "Moscow", "sourcePath": "BCS card"},
        {"name": "About product", "value": "Water resistant", "sourcePath": "Ozon API"},
    ]
    assert record.color_list == ["Black", "Blue"]
    assert record.variants == detail.variants

    empty_sync = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "123456",
            "facts": [],
            "colorList": [],
            "variants": [],
        }
    )
    assert bulk_create_scraped_products(test_db, [empty_sync]) == []

    persisted = (
        test_db.query(ScrapedProductRecord)
        .filter(ScrapedProductRecord.source_id == "123456")
        .one()
    )
    assert persisted.facts == record.facts
    assert persisted.color_list == ["Black", "Blue"]
    assert persisted.variants == detail.variants


def test_bulk_upsert_keeps_variant_commerce_and_values_isolated_by_sku(test_db) -> None:
    initial = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "3378209293",
            "title": "Multi-variant product",
            "variants": [
                {
                    "sku": "SKU-BLACK-M",
                    "values": [
                        {"name": "Color", "value": "Black"},
                        {"name": "Size", "value": "M"},
                    ],
                    "price": 1299,
                    "oldPrice": 1699,
                    "stock": 8,
                    "images": [
                        "https://cdn.example/black-m-1.jpg",
                        "https://cdn.example/black-m-2.jpg",
                    ],
                    "imageUrl": "https://cdn.example/black-m.jpg",
                    "videoUrls": ["https://cdn.example/black-m.mp4"],
                    "weight": 1250,
                    "depth": 300,
                    "width": 200,
                    "height": 100,
                    "sourceUrl": "https://www.ozon.ru/product/black-m-1001/",
                    "productId": "1001",
                    "offerId": "OFFER-BLACK-M",
                    "supplierAttrs": [
                        {"name": "Material", "value": "Steel"},
                    ],
                    "variantAttrs": {"Color": "Black", "Size": "M"},
                    "sourcePath": "Ozon PDP offer selector / structured data",
                },
                {
                    "sku": "SKU-BLUE-L",
                    "values": [
                        {"name": "Color", "value": "Blue"},
                        {"name": "Size", "value": "L"},
                    ],
                    "price": 1499,
                    "oldPrice": 1899,
                    "stock": 3,
                    "images": ["https://cdn.example/blue-l-1.jpg"],
                    "imageUrl": "https://cdn.example/blue-l.jpg",
                    "videoUrls": ["https://cdn.example/blue-l.mp4"],
                    "sourceUrl": "https://www.ozon.ru/product/blue-l-1002/",
                    "productId": "1002",
                    "offerId": "OFFER-BLUE-L",
                },
            ],
        }
    )

    created = bulk_create_scraped_products(test_db, [initial])
    assert len(created) == 1
    record = created[0]
    assert record.variants == initial.variants

    enrichment = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "3378209293",
            "variants": [
                {
                    "sku": "SKU-BLACK-M",
                    "barcode": "460000000001",
                    "values": [
                        {"name": "Size", "value": "M"},
                        {"name": "Material", "value": "Plastic"},
                    ],
                    "price": 1199,
                    "stock": 0,
                }
            ],
        }
    )

    updated = bulk_create_scraped_products(test_db, [enrichment])
    assert len(updated) == 1
    test_db.refresh(record)

    variants_by_sku = {variant["sku"]: variant for variant in record.variants}
    assert variants_by_sku == {
        "SKU-BLACK-M": {
            "sku": "SKU-BLACK-M",
            "values": [
                {"name": "Color", "value": "Black"},
                {"name": "Size", "value": "M"},
                {"name": "Material", "value": "Plastic"},
            ],
            "price": 1199,
            "oldPrice": 1699,
            "stock": 0,
            "images": [
                "https://cdn.example/black-m-1.jpg",
                "https://cdn.example/black-m-2.jpg",
            ],
            "imageUrl": "https://cdn.example/black-m.jpg",
            "videoUrls": ["https://cdn.example/black-m.mp4"],
            "weight": 1250,
            "depth": 300,
            "width": 200,
            "height": 100,
            "sourceUrl": "https://www.ozon.ru/product/black-m-1001/",
            "productId": "1001",
            "offerId": "OFFER-BLACK-M",
            "supplierAttrs": [
                {"name": "Material", "value": "Steel"},
            ],
            "variantAttrs": {"Color": "Black", "Size": "M"},
            "sourcePath": "Ozon PDP offer selector / structured data",
            "barcode": "460000000001",
        },
        "SKU-BLUE-L": {
            "sku": "SKU-BLUE-L",
            "values": [
                {"name": "Color", "value": "Blue"},
                {"name": "Size", "value": "L"},
            ],
            "price": 1499,
            "oldPrice": 1899,
            "stock": 3,
            "images": ["https://cdn.example/blue-l-1.jpg"],
            "imageUrl": "https://cdn.example/blue-l.jpg",
            "videoUrls": ["https://cdn.example/blue-l.mp4"],
            "sourceUrl": "https://www.ozon.ru/product/blue-l-1002/",
            "productId": "1002",
            "offerId": "OFFER-BLUE-L",
        },
    }
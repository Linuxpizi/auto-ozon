"""Persistence coverage for Ozon facts, colors, and real SKU variants."""

from datetime import datetime

from fastapi.testclient import TestClient

from app.api.routers.selection import ProductUpdate, update_product
from app.crud.scraped_product import bulk_create_scraped_products
from app.models.scraped_product import ScrapedProductRecord
from app.schemas.scraped_product import ScrapedProductCreate


def test_browser_sync_http_preserves_brand_and_tags_in_selection_products(test_app: TestClient) -> None:
    registered = test_app.post(
        "/api/auth/register",
        json={
            "email": "ozon-facts-http-complete@example.com",
            "password": "password123",
            "name": "Ozon facts HTTP test",
        },
    )
    assert registered.status_code == 201
    headers = {
        "Authorization": f"Bearer {registered.json()['access_token']}",
    }

    synced = test_app.post(
        "/api/browser-sync/sync-products",
        headers=headers,
        json={
            "products": [
                {
                    "platform": "ozon",
                    "sourceId": "2268446233-complete",
                    "title": "Runtime-boundary factual product",
                    "price": 1299.0,
                    "oldPrice": 1699.0,
                    "currency": "RUB",
                    "images": ["https://cdn.example/product.jpg"],
                    "rating": 4.8,
                    "reviewCount": 42,
                    "brand": "Exact analytics brand",
                    "category": "Электроника > Аксессуары",
                    "description": "Structured PDP description",
                    "descriptionRu": "Описание карточки на русском языке",
                    "recordName": "Runtime complete record",
                    "selectedSku": "2268446233-complete",
                    "titleRu": "Полная фактическая карточка",
                    "variantAttrIds": [101, 202],
                    "collectionStatus": "draft",
                    "categoryId": 12345,
                    "descriptionCategoryId": 67890,
                    "typeId": 24680,
                    "videoUrls": ["https://cdn.example/product.mp4"],
                    "colorList": ["Черный"],
                    "tags": ["Тематика: подарок", "Стиль: минимализм"],
                    "facts": [
                        {
                            "name": "Цвет",
                            "value": "Черный",
                            "sourcePath": "Ozon PDP characteristics",
                        },
                        {
                            "name": "Материал",
                            "value": "Сталь",
                            "sourcePath": "Ozon PDP characteristics",
                        },
                    ],
                    "packageFacts": {
                        "packageWeightG": 1250,
                        "packageDepthMm": 300,
                        "packageWidthMm": 200,
                        "packageHeightMm": 100,
                        "packagePhysicalProvenance": {
                            "packageWeightG": {
                                "source": "ozon_seller_analytics",
                                "sourcePath": "seller.analytics.exactSku",
                                "unknownEvidence": {"requestId": "req-1"},
                            }
                        },
                    },
                    "ozonAttributeFacts": [
                        {
                            "attributeId": 85,
                            "scope": "product",
                            "recognized": True,
                            "publishable": True,
                            "values": [{"dictionaryValueId": 1234, "value": "Черный"}],
                            "provenance": {
                                "source": "ozon_pdp_structured_data",
                                "sourcePath": "page.attributeMeta",
                            },
                        }
                    ],
                    "variants": [
                        {
                            "sku": "2268446233-complete",
                            "values": [{"name": "Цвет", "value": "Черный"}],
                            "images": ["https://cdn.example/variant.jpg"],
                            "videoUrls": ["https://cdn.example/variant.mp4"],
                            "packageWeightG": 1250,
                            "packageDepthMm": 300,
                            "packageWidthMm": 200,
                            "packageHeightMm": 100,
                            "unknownNestedFact": {"keep": True},
                        },
                    ],
                    "sourceUrl": "https://www.ozon.ru/product/runtime-2268446233/",
                    "skuList": [{"sku": "2268446233", "barcode": ""}],
                    "ozonMetrics": {
                        "sku": "2268446233-complete",
                        "articleNumber": "ARTICLE-1",
                        "brand": "Exact analytics brand",
                        "category": "Электроника > Аксессуары",
                        "promotions": ["Скидка продавца"],
                        "monthlySales": 120,
                    },
                    "warehouse": "Москва",
                    "warehouseId": "WH-1",
                    "logisticsType": "FBO",
                    "deliveryMethod": "Курьер",
                    "deliveryRegion": "Россия",
                    "deliveryDays": 3,
                    "discount": "-23%",
                    "stock": "Осталось 5 штук",
                    "priceRanges": [{"minQty": 1, "maxQty": 10, "price": 1299}],
                    "minOrderQty": 1,
                    "supplierUrl": "https://supplier.example/product-1",
                    "tradeQuantity": 77,
                }
            ]
        },
    )
    assert synced.status_code == 200
    assert synced.json() == {"success": True, "created": 1, "skipped": 0}

    selected = test_app.get(
        "/api/selection/products?platform=ozon",
        headers=headers,
    )
    assert selected.status_code == 200
    products = selected.json()
    product = next(item for item in products if item["source_id"] == "2268446233-complete")
    assert product["brand"] == "Exact analytics brand"
    assert product["tags"] == ["Тематика: подарок", "Стиль: минимализм"]
    assert product["title"] == "Runtime-boundary factual product"
    assert product["price"] == 1299.0
    assert product["old_price"] == 1699.0
    assert product["currency"] == "RUB"
    assert product["images"] == ["https://cdn.example/product.jpg"]
    assert product["rating"] == 4.8
    assert product["review_count"] == 42
    assert product["category"] == "Электроника > Аксессуары"
    assert product["description"] == "Structured PDP description"
    assert product["description_ru"] == "Описание карточки на русском языке"
    assert product["record_name"] == "Runtime complete record"
    assert product["selected_sku"] == "2268446233-complete"
    assert product["title_ru"] == "Полная фактическая карточка"
    assert product["variant_attr_ids"] == [101, 202]
    assert product["collection_status"] == "draft"
    assert product["ozon_category_path_id"] == 12345
    assert product["ozon_category_id"] == 67890
    assert product["ozon_type_id"] == 24680
    assert product["video_urls"] == ["https://cdn.example/product.mp4"]
    assert product["color_list"] == ["Черный"]
    assert product["facts"] == [
        {
            "name": "Цвет",
            "value": "Черный",
            "sourcePath": "Ozon PDP characteristics",
        },
        {
            "name": "Материал",
            "value": "Сталь",
            "sourcePath": "Ozon PDP characteristics",
        },
    ]
    assert product["package_facts"] == {
        "packageWeightG": 1250,
        "packageDepthMm": 300,
        "packageWidthMm": 200,
        "packageHeightMm": 100,
        "packagePhysicalProvenance": {
            "packageWeightG": {
                "source": "ozon_seller_analytics",
                "sourcePath": "seller.analytics.exactSku",
                "unknownEvidence": {"requestId": "req-1"},
            }
        },
    }
    assert product["ozon_attribute_facts"] == [
        {
            "attributeId": 85,
            "scope": "product",
            "recognized": True,
            "publishable": True,
            "values": [{"dictionaryValueId": 1234, "value": "Черный"}],
            "provenance": {
                "source": "ozon_pdp_structured_data",
                "sourcePath": "page.attributeMeta",
            },
        }
    ]
    # Text facts remain display facts and are never inferred into Ozon attribute IDs.
    assert {fact["attributeId"] for fact in product["ozon_attribute_facts"]} == {85}
    assert product["variants"] == [
        {
            "sku": "2268446233-complete",
            "values": [{"name": "Цвет", "value": "Черный"}],
            "images": ["https://cdn.example/variant.jpg"],
            "videoUrls": ["https://cdn.example/variant.mp4"],
            "packageWeightG": 1250,
            "packageDepthMm": 300,
            "packageWidthMm": 200,
            "packageHeightMm": 100,
            "unknownNestedFact": {"keep": True},
        },
    ]
    assert product["ozon_metrics"]["monthlySales"] == 120
    assert product["warehouse"] == "Москва"
    assert product["warehouse_id"] == "WH-1"
    assert product["logistics_type"] == "FBO"
    assert product["delivery_method"] == "Курьер"
    assert product["delivery_region"] == "Россия"
    assert product["delivery_days"] == 3
    assert product["discount"] == "-23%"
    assert product["stock"] == "Осталось 5 штук"
    assert product["price_ranges"] == [{"minQty": 1, "maxQty": 10, "price": 1299}]
    assert product["min_order_qty"] == 1
    assert product["supplier_url"] == "https://supplier.example/product-1"
    assert product["trade_quantity"] == 77


def test_schema_normalizes_extension_payload() -> None:
    product = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "123456",
            "title": "Test product",
            "brand": "Factual Brand",
            "category": "Электроника > Аксессуары",
            "colorList": ["Black", "Blue"],
            "tags": '[" Summer ", "Outdoor"]',
            "skuList": '[{"sku":"SKU-1","barcode":"460000000001"}]',
            "facts": '[{"name":"Color","value":"Black","sourcePath":"BCS card"}]',
            "variants": '[{"sku":"SKU-1","values":[{"name":"Color","value":"Black"}]}]',
            "packageFacts": '{"packageWeightG":1250,"packageDepthMm":300}',
            "ozonAttributeFacts": '[{"attributeId":85,"scope":"product","recognized":true,"publishable":true,"values":[{"value":"Black"}],"provenance":{"source":"ozon_pdp_structured_data"}}]',
            "scrapedAt": "2026-07-18T12:00:00Z",
        }
    )

    assert product.source_id == "123456"
    assert product.brand == "Factual Brand"
    assert product.category == "Электроника > Аксессуары"
    assert product.color_list == ["Black", "Blue"]
    assert product.tags == [" Summer ", "Outdoor"]
    assert product.sku_list == [{"sku": "SKU-1", "barcode": "460000000001"}]
    assert product.facts == [
        {"name": "Color", "value": "Black", "sourcePath": "BCS card"}
    ]
    assert product.variants == [
        {"sku": "SKU-1", "values": [{"name": "Color", "value": "Black"}]}
    ]
    assert product.package_facts == {"packageWeightG": 1250, "packageDepthMm": 300}
    assert product.ozon_attribute_facts[0]["attributeId"] == 85
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


def test_bulk_upsert_merges_tags_without_erasing_user_tags(test_db) -> None:
    initial = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "tags-123",
            "tags": [" Summer ", "Outdoor"],
        }
    )
    record = bulk_create_scraped_products(test_db, [initial])[0]
    assert record.tags == ["Summer", "Outdoor"]

    empty_resync = ScrapedProductCreate.model_validate(
        {"platform": "ozon", "sourceId": "tags-123", "tags": []}
    )
    assert bulk_create_scraped_products(test_db, [empty_resync]) == []
    test_db.refresh(record)
    assert record.tags == ["Summer", "Outdoor"]

    enrichment = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "tags-123",
            "tags": ["outdoor", "Travel", "  "],
        }
    )
    assert bulk_create_scraped_products(test_db, [enrichment]) == [record]
    test_db.refresh(record)
    assert record.tags == ["Summer", "Outdoor", "Travel"]


def test_selection_update_can_explicitly_clear_tags(test_db) -> None:
    record = ScrapedProductRecord(
        platform="ozon",
        source_id="editable-tags-1",
        tags=["Summer", "Outdoor"],
    )
    test_db.add(record)
    test_db.commit()
    test_db.refresh(record)

    update_product(record.id, ProductUpdate(tags=[]), test_db)

    test_db.refresh(record)
    assert record.tags == []


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


def test_bulk_upsert_losslessly_enriches_package_attribute_and_nested_sku_facts(test_db) -> None:
    initial = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "fidelity-1001",
            "selectedSku": "SKU-EXACT",
            "facts": [
                {
                    "name": "Материал",
                    "value": "Сталь",
                    "sourcePath": "PDP characteristics",
                    "provenance": {"source": "ozon_pdp_characteristic"},
                    "unknownEvidence": {"selector": "#material"},
                }
            ],
            "packageFacts": {
                "packageWeightG": 1250,
                "packageDepthMm": 300,
                "packagePhysicalProvenance": {
                    "packageWeightG": {
                        "source": "ozon_seller_analytics",
                        "sourcePath": "analytics.exactSku",
                        "raw": {"weight": "1.25 kg"},
                    }
                },
            },
            "ozonAttributeFacts": [
                {
                    "attributeId": 85,
                    "scope": "product",
                    "recognized": True,
                    "publishable": True,
                    "values": [
                        {"dictionaryValueId": 1234, "value": "Черный", "raw": {"id": "1234"}}
                    ],
                    "provenance": {"source": "ozon_pdp_structured_data"},
                },
                {
                    "attributeId": 900,
                    "scope": "sku",
                    "complexGroupId": "media-1",
                    "recognized": True,
                    "publishable": True,
                    "values": [{"value": "Первый"}],
                    "provenance": {"source": "ozon_pdp_structured_data"},
                },
            ],
            "variants": [
                {
                    "sku": "SKU-EXACT",
                    "values": [
                        {
                            "name": "Цвет",
                            "value": "Черный",
                            "sourcePath": "offer selector",
                            "unknownEvidence": {"nodeId": "color-black"},
                        }
                    ],
                    "images": ["https://cdn.example/exact-1.jpg"],
                    "videoUrls": ["https://cdn.example/exact-1.mp4"],
                    "packageWeightG": 1250,
                    "packageDepthMm": 300,
                    "unknownNestedFact": {"keep": True},
                }
            ],
        }
    )
    record = bulk_create_scraped_products(test_db, [initial])[0]

    enrichment = ScrapedProductCreate.model_validate(
        {
            "platform": "ozon",
            "sourceId": "fidelity-1001",
            "facts": [
                {
                    "name": "материал",
                    "value": "сталь",
                    "capturedAt": "2026-07-25T01:00:00Z",
                },
                {
                    "name": "Маркетинговое имя без Ozon ID",
                    "value": "Не превращать в attributeId",
                    "sourcePath": "PDP text",
                },
            ],
            "packageFacts": {
                "packageWidthMm": 200,
                "packageHeightMm": 100,
                "packagePhysicalProvenance": {
                    "packageWeightG": {"capturedAt": "2026-07-25T01:00:00Z"},
                    "packageWidthMm": {
                        "source": "ozon_seller_variant_package",
                        "sourcePath": "variant.width",
                    },
                    "packageHeightMm": {
                        "source": "ozon_seller_variant_package",
                        "sourcePath": "variant.height",
                    },
                },
            },
            "ozonAttributeFacts": [
                {
                    "attributeId": 85,
                    "scope": "product",
                    "recognized": True,
                    "publishable": True,
                    "values": [
                        {"dictionaryValueId": 1234, "value": "Черный", "confidence": 1.0},
                        {"dictionaryValueId": 5678, "value": "Графит"},
                    ],
                    "provenance": {
                        "source": "ozon_pdp_structured_data",
                        "capturedAt": "2026-07-25T01:00:00Z",
                    },
                }
            ],
            "variants": [
                {
                    "sku": "SKU-EXACT",
                    "values": [
                        {
                            "name": "Цвет",
                            "value": "Черный",
                            "provenance": {"source": "ozon_pdp_structured_data"},
                        }
                    ],
                    "images": ["https://cdn.example/exact-2.jpg"],
                    "videoUrls": ["https://cdn.example/exact-2.mp4"],
                    "packageWidthMm": 200,
                    "packageHeightMm": 100,
                }
            ],
        }
    )
    assert bulk_create_scraped_products(test_db, [enrichment]) == [record]
    test_db.refresh(record)

    assert record.package_facts == {
        "packageWeightG": 1250,
        "packageDepthMm": 300,
        "packageWidthMm": 200,
        "packageHeightMm": 100,
        "packagePhysicalProvenance": {
            "packageWeightG": {
                "source": "ozon_seller_analytics",
                "sourcePath": "analytics.exactSku",
                "raw": {"weight": "1.25 kg"},
                "capturedAt": "2026-07-25T01:00:00Z",
            },
            "packageWidthMm": {
                "source": "ozon_seller_variant_package",
                "sourcePath": "variant.width",
            },
            "packageHeightMm": {
                "source": "ozon_seller_variant_package",
                "sourcePath": "variant.height",
            },
        },
    }
    assert record.facts[0]["unknownEvidence"] == {"selector": "#material"}
    assert record.facts[0]["capturedAt"] == "2026-07-25T01:00:00Z"
    assert record.facts[1]["name"] == "Маркетинговое имя без Ozon ID"
    assert len(record.ozon_attribute_facts) == 2
    assert {fact["attributeId"] for fact in record.ozon_attribute_facts} == {85, 900}
    standard = next(fact for fact in record.ozon_attribute_facts if fact["attributeId"] == 85)
    assert standard["values"] == [
        {
            "dictionaryValueId": 1234,
            "value": "Черный",
            "raw": {"id": "1234"},
            "confidence": 1.0,
        },
        {"dictionaryValueId": 5678, "value": "Графит"},
    ]
    complex_fact = next(fact for fact in record.ozon_attribute_facts if fact["attributeId"] == 900)
    assert complex_fact["complexGroupId"] == "media-1"

    exact_variant = record.variants[0]
    assert exact_variant["images"] == [
        "https://cdn.example/exact-1.jpg",
        "https://cdn.example/exact-2.jpg",
    ]
    assert exact_variant["videoUrls"] == [
        "https://cdn.example/exact-1.mp4",
        "https://cdn.example/exact-2.mp4",
    ]
    assert exact_variant["unknownNestedFact"] == {"keep": True}
    assert exact_variant["values"][0]["unknownEvidence"] == {"nodeId": "color-black"}
    assert exact_variant["values"][0]["provenance"] == {
        "source": "ozon_pdp_structured_data"
    }
    assert exact_variant["packageWeightG"] == 1250
    assert exact_variant["packageDepthMm"] == 300
    assert exact_variant["packageWidthMm"] == 200
    assert exact_variant["packageHeightMm"] == 100

    persisted = (
        test_db.query(ScrapedProductRecord)
        .filter(ScrapedProductRecord.source_id == "fidelity-1001")
        .one()
    )
    assert persisted.package_facts == record.package_facts
    assert persisted.ozon_attribute_facts == record.ozon_attribute_facts
    assert all("attributeId" not in fact for fact in persisted.facts)
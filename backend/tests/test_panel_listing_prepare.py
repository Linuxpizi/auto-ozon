from copy import deepcopy

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.store import Store
from app.models.upload_draft import UploadDraft


PANEL_PREPARE_URL = "/api/panel-tools/listing/prepare"


def _auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"email": "panel-listing@example.com", "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_store(db: Session) -> Store:
    store = Store(
        name="Panel Ozon 店铺",
        client_id="panel-client",
        api_key="panel-key",
        status="active",
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


def _attribute_fact(
    attribute_id: int,
    value: str,
    *,
    scope: str = "product",
    recognized: bool = True,
    publishable: bool = True,
    marker: str,
) -> dict:
    return {
        "attributeId": attribute_id,
        "scope": scope,
        "recognized": recognized,
        "publishable": publishable,
        "values": [{"value": value, "rawValueMeta": {"marker": marker}}],
        "provenance": {
            "source": "collector",
            "sourcePath": f"attributes.{marker}",
        },
        "collectorAttributeMeta": {"marker": marker},
    }


def _prepare_payload(store_id: int, product_id: str = "710001") -> dict:
    source_url = f"https://www.ozon.ru/product/{product_id}/"
    selected_sku = f"sku-{product_id}"
    return {
        "product": {
            "storeId": store_id,
            "recordName": "面板事实记录",
            "source": "OZON",
            "sourceUrl": source_url,
            "productId": product_id,
            "sku": selected_sku,
            "title": "采集商品标题",
            "titleRu": "Название товара",
            "description": "采集描述",
            "descriptionRu": "Описание товара",
            "tags": ["事实标签", "事实标签", "第二标签"],
            "images": ["https://cdn.example.com/product.jpg"],
            "videoUrls": ["https://cdn.example.com/product-video.mp4"],
            "price": 1200,
            "specs": [{"name": "任意文本", "value": "不得推导属性 ID"}],
            "textFacts": [
                {
                    "name": "材质文本",
                    "value": "棉",
                    "sourcePath": "pdp.characteristics.material",
                    "rawTextMeta": {"language": "ru"},
                }
            ],
            "packageFacts": {
                "packageWeightG": 1702,
                "packageDepthMm": 202,
                "packageWidthMm": 1703,
                "packageHeightMm": 1704,
                "packagePhysicalProvenance": {
                    "packageDepthMm": {
                        "source": "product-package",
                        "sourcePath": "product.package.depth",
                    }
                },
                "rawPackageMeta": {"unit": "mm"},
            },
            "ozonAttributeFacts": [
                _attribute_fact(10, "product-value", marker="product-10"),
                _attribute_fact(
                    11,
                    "product-stale-sku-value",
                    scope="sku",
                    marker="product-11",
                ),
            ],
            "variantsData": [
                {
                    "id": product_id,
                    "productId": product_id,
                    "sku": selected_sku,
                    "offerId": f"source-offer-{product_id}",
                    "barcode": f"barcode-{product_id}",
                    "price": 1200,
                    "images": ["https://cdn.example.com/factual-variant.jpg"],
                    "videos": [],
                    "packageWeightG": 701,
                    "packageWidthMm": 303,
                    "packagePhysicalProvenance": {
                        "packageWeightG": {
                            "source": "selected-variant",
                            "sourcePath": "variant.package.weight",
                        }
                    },
                    # These are item/net legacy values and must never fill package fields.
                    "weight": 9001,
                    "depth": 9002,
                    "width": 9003,
                    "height": 9004,
                    "ozonAttributeFacts": [
                        _attribute_fact(
                            11,
                            "selected-sku-value",
                            scope="sku",
                            marker="variant-11",
                        ),
                        _attribute_fact(
                            0,
                            "unrecognized-but-losslessly-stored",
                            scope="sku",
                            recognized=False,
                            publishable=False,
                            marker="variant-invalid",
                        ),
                    ],
                    "collectorMeta": {
                        "raw": {"nested": ["must", "survive"]},
                    },
                }
            ],
            "variantAttrIds": [10, 11],
            "categoryPath": "Категория / Товар",
            "categoryId": 17028922,
            "descriptionCategoryId": 17028922,
            "typeId": 9163,
            "ozonMetrics": {
                "weightG": 8001,
                "lengthMm": 8002,
                "widthMm": 8003,
                "heightMm": 8004,
                "packageWeightG": 2701,
                "packageLengthMm": 2702,
                "packageWidthMm": 2703,
                "packageHeightMm": 404,
                "unknownMetric": {"nested": True},
            },
            "status": "draft",
        },
        "input": {
            "storeId": store_id,
            "productId": product_id,
            "sourceUrl": source_url,
            "title": "编辑后的上架标题",
            "brand": "事实品牌",
            "offerId": f"panel-offer-{product_id}",
            "descriptionCategoryId": 17028922,
            "typeId": 9163,
            "categoryName": "Категория / Товар",
            "variants": [
                {
                    "sku": selected_sku,
                    "name": "编辑后的 SKU 标题",
                    "priceRub": 1599.25,
                    "oldPriceRub": 1899,
                    "images": ["https://cdn.example.com/selected.jpg"],
                    "selected": True,
                }
            ],
            "followSourceImages": True,
            "watermarkEnabled": False,
            "randomizeImages": False,
            "modelImagesEnabled": False,
            "floatingPriceEnabled": False,
        },
    }


def test_panel_prepare_persists_exact_selected_facts_and_true_readiness(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    payload = _prepare_payload(store.id)

    response = test_app.post(PANEL_PREPARE_URL, headers=headers, json=payload)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "draftId": response.json()["draftId"],
        "status": "ready",
        "offerId": "panel-offer-710001",
        "selectedVariantCount": 1,
        "warnings": [],
    }
    draft = test_db.query(UploadDraft).filter_by(id=response.json()["draftId"]).one()
    assert (draft.weight, draft.depth, draft.width, draft.height) == (701, 202, 303, 1704)
    assert draft.package_facts == {
        "packageWeightG": 701,
        "packageDepthMm": 202,
        "packageWidthMm": 303,
        "packageHeightMm": 1704,
        "packagePhysicalProvenance": {
            "packageWeightG": {
                "source": "selected-variant",
                "sourcePath": "variant.package.weight",
            },
            "packageDepthMm": {
                "source": "product-package",
                "sourcePath": "product.package.depth",
            },
            "packageWidthMm": {
                "source": "selected_sku_snapshot",
                "sourcePath": "variantsData.selected.packageWidthMm",
            },
            "packageHeightMm": {
                "source": "scraped_product_package",
                "sourcePath": "packageFacts.packageHeightMm",
            },
        },
    }
    assert draft.barcode == "barcode-710001"
    assert draft.video_urls is None
    assert draft.text_facts[0]["rawTextMeta"] == {"language": "ru"}
    assert draft.ozon_metrics == payload["product"]["ozonMetrics"]
    assert draft.ozonbox_tags == "事实标签, 第二标签"
    assert draft.readiness_errors == []
    assert draft.error_message == ""

    snapshot = draft.selected_sku_snapshot
    assert snapshot["selectionIdentity"] == "sku-710001"
    assert snapshot["barcode"] == "barcode-710001"
    assert snapshot["collectorMeta"] == {"raw": {"nested": ["must", "survive"]}}
    assert snapshot["variantSnapshot"]["collectorMeta"] == {
        "raw": {"nested": ["must", "survive"]}
    }
    assert snapshot["editableSkuSnapshot"] == payload["input"]["variants"][0]

    attributes = {
        (fact["attributeId"], fact["scope"]): fact
        for fact in draft.ozon_attribute_facts
    }
    assert attributes[(10, "product")]["values"][0]["value"] == "product-value"
    assert attributes[(11, "sku")]["values"][0]["value"] == "selected-sku-value"
    assert attributes[(11, "sku")]["collectorAttributeMeta"] == {"marker": "variant-11"}
    assert attributes[(0, "sku")]["values"][0]["value"] == (
        "unrecognized-but-losslessly-stored"
    )


def test_panel_prepare_omitted_variant_videos_fall_back_to_product_media(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    payload = _prepare_payload(store.id, "710002")
    del payload["product"]["variantsData"][0]["videos"]

    response = test_app.post(PANEL_PREPARE_URL, headers=headers, json=payload)

    assert response.status_code == 200, response.text
    draft = test_db.query(UploadDraft).filter_by(id=response.json()["draftId"]).one()
    assert draft.video_urls == ["https://cdn.example.com/product-video.mp4"]


def test_panel_reprepare_clears_stale_facts_and_rejects_legacy_item_dimensions(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    first_payload = _prepare_payload(store.id, "710003")
    first_payload["product"]["variantsData"][0]["videos"] = [
        "https://cdn.example.com/selected-video.mp4"
    ]
    first = test_app.post(PANEL_PREPARE_URL, headers=headers, json=first_payload)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "ready"

    draft = test_db.query(UploadDraft).filter_by(id=first.json()["draftId"]).one()
    draft.package_override_audit = {
        "weight": {
            "source": "manual_override",
            "reason": "旧人工测量",
            "capturedAt": "2026-07-25T00:00:00+00:00",
            "value": 701,
        }
    }
    test_db.commit()

    second_payload = deepcopy(first_payload)
    product = second_payload["product"]
    product.pop("packageFacts")
    product.pop("ozonMetrics")
    product["ozonAttributeFacts"] = []
    product["textFacts"] = []
    product["videoUrls"] = []
    variant = product["variantsData"][0]
    for key in (
        "packageWeightG",
        "packageWidthMm",
        "packagePhysicalProvenance",
        "ozonAttributeFacts",
        "collectorMeta",
        "barcode",
    ):
        variant.pop(key, None)
    variant["videos"] = []
    # Legacy/item dimensions remain deliberately and must not authorize readiness.
    assert all(variant[key] > 0 for key in ("weight", "depth", "width", "height"))

    second = test_app.post(PANEL_PREPARE_URL, headers=headers, json=second_payload)

    assert second.status_code == 200, second.text
    assert second.json()["draftId"] == first.json()["draftId"]
    assert second.json()["status"] == "draft"
    assert second.json()["warnings"] == [
        "采集事实缺少完整包装尺寸/重量，补充有来源的包装数据或人工测量并填写修改原因后才能提交"
    ]
    test_db.refresh(draft)
    assert (draft.weight, draft.depth, draft.width, draft.height) == (
        None,
        None,
        None,
        None,
    )
    assert draft.package_facts is None
    assert draft.package_override_audit is None
    assert draft.ozon_attribute_facts is None
    assert draft.video_urls is None
    assert draft.text_facts is None
    assert draft.ozon_metrics is None
    assert draft.barcode == ""
    assert draft.status == "draft"
    assert draft.readiness_errors == [
        "缺少有效的包装重量(g)",
        "缺少有效的包装长度/深度(mm)",
        "缺少有效的包装宽度(mm)",
        "缺少有效的包装高度(mm)",
    ]
    assert draft.error_message == "；".join(draft.readiness_errors)

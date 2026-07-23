from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.listing import Listing
from app.models.panel_selection_rule import PanelSelectionRule
from app.models.store import Store
from app.models.upload_draft import UploadDraft
from app.models.user import User
from app.services.ozon_client import OzonAPIError, OzonClient


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"email": "ozonbox@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_store(
    db: Session,
    *,
    name: str = "Ozon 店铺",
    client_id: str = "client-1",
    api_key: str = "api-key-1",
    status: str = "active",
) -> Store:
    store = Store(name=name, client_id=client_id, api_key=api_key, status=status)
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


def product_record_payload(store_id: int, product_id: str = "123456") -> dict:
    return {
        "storeId": store_id,
        "recordName": "真实采集记录",
        "source": "OZON",
        "sourceUrl": f"https://www.ozon.ru/product/{product_id}/",
        "productId": product_id,
        "sku": "seller-sku-1",
        "title": "采集标题",
        "titleRu": "Русское название",
        "description": "采集描述",
        "images": ["https://cdn.example.com/product.jpg"],
        "price": 1599.5,
        "specs": [{"name": "颜色", "value": "红色"}],
        "variantsData": [
            {
                "productId": product_id,
                "offerId": "offer-1",
                "price": 1599.5,
                "images": ["https://cdn.example.com/variant.jpg"],
                "stock": 7,
                "variantAttrs": {"颜色": "红色"},
            }
        ],
        "variantAttrIds": [1001],
        "categoryPath": "Одежда / Футболки",
        "categoryId": 17028922,
        "descriptionCategoryId": 17028922,
        "typeId": 9163,
        "status": "draft",
    }


def selection_rule_payload() -> dict:
    return {
        "name": "完整规则",
        "tag": "完整",
        "autoFavorite": False,
        "sort": 100,
        "enabled": True,
        "conditions": {
            "brandOption": 2,
            "soldCountMin": 1,
            "soldCountMax": 2,
            "daysWithTrafaretsMin": 3,
            "daysWithTrafaretsMax": 4,
            "qtyViewPdpMin": 5,
            "convToCartPdpMax": 6,
            "sessionCountSearchMin": 7,
            "convToCartSearchMax": 8,
            "convViewToOrderMin": 9,
            "salesSchema": "FBO",
            "cancelRateMax": 10,
            "sellerCountMax": 11,
            "minimumPriceFollowMin": 12.5,
        },
    }


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("get", "/api/store/list", None),
        ("post", "/api/online-product/info?storeId=1", {"product_id": [1]}),
        ("post", "/api/ozon/products/info?clientId=client-1", {"product_id": 1}),
        ("post", "/api/product-record/save", product_record_payload(1)),
        ("post", "/api/system/sku/shops", {"sku": "seller-sku-1"}),
    ],
)
def test_ozonbox_routes_require_auth(
    test_app: TestClient, method: str, url: str, body: dict | None
):
    response = test_app.request(method, url, json=body)
    assert response.status_code == 401


def test_panel_selection_rules_use_exact_schema_and_sanitize_stale_json(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    user = test_db.query(User).filter(User.email == "ozonbox@example.com").one()
    stale_rule = PanelSelectionRule(
        user_id=user.id,
        name="历史规则",
        tag="历史",
        color=None,
        auto_favorite=False,
        sort=1,
        enabled=True,
        conditions={
            "brandOption": 1,
            "priceMin": 100,
            "avgOrdersOnAccDaysMin": 7,
            "avgGmvOnAccDaysMax": 999,
        },
    )
    test_db.add(stale_rule)
    test_db.commit()

    listed = test_app.get("/api/panel-tools/selection-rules", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["conditions"] == {"brandOption": 1, "priceMin": 100.0}

    payload = selection_rule_payload()
    created = test_app.post(
        "/api/panel-tools/selection-rules", headers=headers, json=payload
    )
    assert created.status_code == 201
    assert created.json()["conditions"] == payload["conditions"]

    stale_request = deepcopy(payload)
    stale_request["conditions"]["avgOrdersOnAccDaysMin"] = 1
    rejected = test_app.post(
        "/api/panel-tools/selection-rules", headers=headers, json=stale_request
    )
    assert rejected.status_code == 422


def test_store_list_is_safe_and_marks_usable_stores(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    active = create_store(test_db)
    inactive = create_store(
        test_db,
        name="停用店铺",
        client_id="client-2",
        api_key="secret-key-2",
        status="disabled",
    )

    response = test_app.get("/api/store/list", headers=headers)

    assert response.status_code == 200
    stores = response.json()["data"]
    assert stores == [
        {
            "id": active.id,
            "name": "Ozon 店铺",
            "storeName": "Ozon 店铺",
            "clientId": "client-1",
            "status": "active",
            "usable": True,
        },
        {
            "id": inactive.id,
            "name": "停用店铺",
            "storeName": "停用店铺",
            "clientId": "client-2",
            "status": "disabled",
            "usable": False,
        },
    ]
    assert "api_key" not in response.text
    assert "secret-key-2" not in response.text


def test_local_category_is_scoped_by_store_and_product(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    first_store = create_store(test_db)
    second_store = create_store(
        test_db, name="第二店铺", client_id="client-2", api_key="api-key-2"
    )
    test_db.add_all(
        [
            Listing(
                store_id=first_store.id,
                store_name=first_store.name,
                product_id="777",
                category_id=100,
                type_id=10,
            ),
            Listing(
                store_id=second_store.id,
                store_name=second_store.name,
                product_id="777",
                category_id=200,
                type_id=20,
            ),
            Listing(
                store_id=first_store.id,
                store_name=first_store.name,
                product_id="888",
                category_id=0,
                type_id=0,
            ),
        ]
    )
    test_db.commit()

    response = test_app.post(
        f"/api/online-product/info?storeId={first_store.id}",
        headers=headers,
        json={"product_id": [777]},
    )
    assert response.status_code == 200
    assert response.json()["data"] == {
        "categoryId": 100,
        "typeId": 10,
        "descriptionCategoryId": 100,
        "categoryPath": None,
    }

    missing = test_app.post(
        f"/api/online-product/info?storeId={first_store.id}",
        headers=headers,
        json={"product_id": [888]},
    )
    assert missing.status_code == 404

    unknown_store = test_app.post(
        "/api/online-product/info?storeId=99999",
        headers=headers,
        json={"product_id": [777]},
    )
    assert unknown_store.status_code == 404


def test_local_category_accepts_public_ozon_sku(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    test_db.add(
        Listing(
            store_id=store.id,
            store_name=store.name,
            product_id="123",
            sku="777",
            category_id=400,
            type_id=40,
        )
    )
    test_db.commit()

    response = test_app.post(
        f"/api/online-product/info?storeId={store.id}",
        headers=headers,
        json={"product_id": [777]},
    )

    assert response.status_code == 200
    assert response.json()["data"]["descriptionCategoryId"] == 400


def test_live_category_uses_exact_product_and_fields(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)

    def product_info(
        _self: OzonClient, product_ids=None, *, offer_ids=None, skus=None
    ) -> list[dict]:
        assert skus == ["777"]
        assert product_ids is None
        return [
            {"sku": 999, "description_category_id": 1, "type_id": 2},
            {"sku": 777, "description_category_id": 300, "type_id": 30},
        ]

    monkeypatch.setattr(OzonClient, "get_product_info_list", product_info)
    response = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "categoryId": 300,
        "typeId": 30,
        "descriptionCategoryId": 300,
        "categoryPath": None,
    }


def test_live_category_rejects_ambiguous_data_and_maps_api_failure(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)

    monkeypatch.setattr(
        OzonClient,
        "get_product_info_list",
        lambda _self, _ids=None, **_kwargs: [{"sku": 777, "category_id": 300}],
    )
    monkeypatch.setattr(
        OzonClient,
        "get_product_attributes",
        lambda _self, **_kwargs: [{"sku": 777, "category_id": 300}],
    )
    missing = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )
    assert missing.status_code == 404

    def fail(_self: OzonClient, **_kwargs) -> list[dict]:
        raise OzonAPIError(503, {"message": "unavailable"})

    monkeypatch.setattr(OzonClient, "get_product_info_list", fail)
    failed = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )
    assert failed.status_code == 502


def test_live_category_does_not_call_v4_when_v3_has_no_exact_item(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)
    info_calls = []
    attribute_calls = []

    def product_info(
        _self: OzonClient, product_ids=None, *, offer_ids=None, skus=None
    ) -> list[dict]:
        info_calls.append({"product_ids": product_ids, "skus": skus})
        return []

    def attributes(_self: OzonClient, **kwargs) -> list[dict]:
        attribute_calls.append(kwargs)
        return []

    monkeypatch.setattr(OzonClient, "get_product_info_list", product_info)
    monkeypatch.setattr(OzonClient, "get_product_attributes", attributes)

    response = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )

    assert response.status_code == 404
    assert info_calls == [
        {"product_ids": None, "skus": ["777"]},
        {"product_ids": ["777"], "skus": None},
    ]
    assert attribute_calls == []
    assert response.json()["detail"] == (
        "所选店铺的 Ozon Seller API 中没有该商品；公开商品可能不属于该店铺"
    )


def test_live_category_uses_v4_only_after_exact_v3_sku_without_category(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)
    info_calls = []
    attribute_calls = []

    def product_info(
        _self: OzonClient, product_ids=None, *, offer_ids=None, skus=None
    ) -> list[dict]:
        info_calls.append({"product_ids": product_ids, "skus": skus})
        return [{"sku": 777, "category_id": 999}]

    def attributes(_self: OzonClient, **kwargs) -> list[dict]:
        attribute_calls.append(kwargs)
        return [{"sku": 777, "description_category_id": 300, "type_id": 30}]

    monkeypatch.setattr(OzonClient, "get_product_info_list", product_info)
    monkeypatch.setattr(OzonClient, "get_product_attributes", attributes)

    response = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )

    assert response.status_code == 200
    assert response.json()["data"]["descriptionCategoryId"] == 300
    assert info_calls == [{"product_ids": None, "skus": ["777"]}]
    assert attribute_calls == [{"skus": ["777"]}]


def test_live_category_treats_v4_item_not_found_as_item_miss(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)
    attribute_calls = []

    def product_info(
        _self: OzonClient, product_ids=None, *, offer_ids=None, skus=None
    ) -> list[dict]:
        if skus:
            return [{"sku": 777, "category_id": 999}]
        return []

    def item_not_found(_self: OzonClient, **kwargs) -> list[dict]:
        attribute_calls.append(kwargs)
        raise OzonAPIError(404, {"code": 5, "message": "item not found"})

    monkeypatch.setattr(OzonClient, "get_product_info_list", product_info)
    monkeypatch.setattr(OzonClient, "get_product_attributes", item_not_found)

    response = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Ozon 返回中没有明确的真实类目信息"
    assert attribute_calls == [{"skus": ["777"]}]


def test_live_category_downgrades_v4_compatibility_error_after_exact_v3_item(
    test_app: TestClient, test_db: Session, monkeypatch: pytest.MonkeyPatch
):
    headers = auth_headers(test_app)
    create_store(test_db)
    attribute_calls = []

    def product_info(
        _self: OzonClient, product_ids=None, *, offer_ids=None, skus=None
    ) -> list[dict]:
        if skus:
            return [{"sku": 777}]
        return []

    def unsupported(_self: OzonClient, **kwargs) -> list[dict]:
        attribute_calls.append(kwargs)
        raise OzonAPIError(405, {"message": "method not allowed"})

    monkeypatch.setattr(OzonClient, "get_product_info_list", product_info)
    monkeypatch.setattr(OzonClient, "get_product_attributes", unsupported)

    response = test_app.post(
        "/api/ozon/products/info?clientId=client-1",
        headers=headers,
        json={"product_id": 777},
    )

    assert response.status_code == 404
    assert attribute_calls == [{"skus": ["777"]}]


def test_product_info_list_supports_public_sku_filter(
    monkeypatch: pytest.MonkeyPatch,
):
    client = OzonClient("client-1", "api-key-1")
    calls = []

    def request(method: str, path: str, json_body=None) -> dict:
        calls.append((method, path, json_body))
        return {
            "items": [
                {"sku": 777, "description_category_id": 300, "type_id": 30}
            ]
        }

    monkeypatch.setattr(client, "_request", request)

    assert client.get_product_info_list(skus=[" 777 ", "", "0"]) == [
        {"sku": 777, "description_category_id": 300, "type_id": 30}
    ]
    assert calls == [
        ("POST", "/v3/product/info/list", {"sku": ["777"]})
    ]


def test_product_attributes_uses_sku_filter_and_accepts_top_level_items(
    monkeypatch: pytest.MonkeyPatch,
):
    client = OzonClient("client-1", "api-key-1")
    calls = []

    def request(method: str, path: str, json_body=None) -> dict:
        calls.append((method, path, json_body))
        return {
            "items": [
                {
                    "sku": 777,
                    "description_category_id": 300,
                    "type_id": 30,
                }
            ]
        }

    monkeypatch.setattr(client, "_request", request)

    assert client.get_product_attributes(skus=[" 777 ", "", "0"]) == [
        {"sku": 777, "description_category_id": 300, "type_id": 30}
    ]
    assert calls == [
        (
            "POST",
            "/v4/product/info/attributes",
            {
                "filter": {"sku": ["777"], "visibility": "ALL"},
                "limit": 100,
                "sort_dir": "ASC",
            },
        )
    ]


def test_save_product_record_preserves_facts_without_legacy_defaults(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    payload = product_record_payload(store.id)

    response = test_app.post(
        "/api/product-record/save", headers=headers, json=payload
    )

    assert response.status_code == 200
    saved_data = response.json()["data"]
    draft = test_db.query(UploadDraft).one()
    assert saved_data == {
        "id": draft.id,
        "storeId": store.id,
        "productId": "123456",
        "status": "draft",
    }
    assert draft.source_type == "ozonbox"
    assert draft.source_product_key == "123456"
    assert draft.ozonbox_images == payload["images"]
    assert draft.ozonbox_specs == payload["specs"]
    assert draft.ozonbox_variants[0]["product_id"] == "123456"
    assert draft.ozonbox_variants[0]["stock"] == 7
    assert draft.ozonbox_price == 1599.5
    assert draft.price_cny is None
    assert draft.price_rub is None
    assert draft.old_price_rub is None
    assert draft.weight is None
    assert draft.height is None
    assert draft.depth is None
    assert draft.width is None


def test_package_facts_are_saved_in_ozonbox_variant_and_read_by_identity(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    payload = product_record_payload(store.id)
    payload["variantsData"][0].update(
        depth=110,
        width=104,
        height=18,
        weight=14,
    )

    saved = test_app.post(
        "/api/product-record/save", headers=headers, json=payload
    )
    assert saved.status_code == 200

    draft = test_db.query(UploadDraft).one()
    assert draft.ozonbox_variants[0]["depth"] == 110
    assert draft.ozonbox_variants[0]["width"] == 104
    assert draft.ozonbox_variants[0]["height"] == 18
    assert draft.ozonbox_variants[0]["weight"] == 14
    assert draft.weight is None
    assert draft.height is None
    assert draft.depth is None
    assert draft.width is None

    response = test_app.post(
        "/api/system/sku/shops",
        headers=headers,
        json={"sku": "seller-sku-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "code": 200,
        "data": [
            {
                "attributes": [
                    {"key": "9454", "value": "110"},
                    {"key": "9455", "value": "104"},
                    {"key": "9456", "value": "18"},
                    {"key": "4497", "value": "14"},
                ],
                "categories": [],
            }
        ],
        "message": "success",
    }


def test_package_facts_require_exact_variant_identity_and_return_missing_as_empty(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    test_db.add(
        UploadDraft(
            store_id=store.id,
            source_type="ozonbox",
            source_product_key="product-1",
            ozonbox_product_id="product-1",
            ozonbox_sku="seller-sku-1",
            ozonbox_variants=[
                {
                    "productId": "different-product",
                    "sku": "different-sku",
                    "depth": 110,
                    "width": 104,
                    "height": 18,
                    "weight": 14,
                },
                {
                    "productId": "another-product",
                    "sku": "another-sku",
                    "depth": 120,
                    "width": 114,
                    "height": 28,
                    "weight": 24,
                },
            ],
        )
    )
    test_db.commit()

    mismatched = test_app.post(
        "/api/system/sku/shops",
        headers=headers,
        json={"sku": "seller-sku-1"},
    )
    missing = test_app.post(
        "/api/system/sku/shops",
        headers=headers,
        json={"sku": "unknown-sku"},
    )

    assert mismatched.status_code == 200
    assert mismatched.json()["data"] == []
    assert missing.status_code == 200
    assert missing.json()["data"] == []


def test_package_facts_do_not_promote_partial_dimensions_but_keep_weight(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    test_db.add(
        UploadDraft(
            store_id=store.id,
            source_type="ozonbox",
            source_product_key="product-2",
            ozonbox_product_id="product-2",
            ozonbox_variants=[
                {
                    "productId": "product-2",
                    "depth": 110,
                    "width": 104,
                    "weight": 14,
                }
            ],
        )
    )
    test_db.commit()

    response = test_app.post(
        "/api/system/sku/shops",
        headers=headers,
        json={"sku": "product-2"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == [
        {
            "attributes": [{"key": "4497", "value": "14"}],
            "categories": [],
        }
    ]


def test_package_facts_prefer_complete_then_newest_matching_record(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    test_db.add_all(
        [
            UploadDraft(
                store_id=store.id,
                source_type="ozonbox",
                source_product_key="product-3-old",
                ozonbox_variants=[
                    {
                        "productId": "product-3",
                        "depth": 100,
                        "width": 90,
                        "height": 20,
                        "weight": 10,
                    }
                ],
            ),
            UploadDraft(
                store_id=store.id,
                source_type="ozonbox",
                source_product_key="product-3-new",
                ozonbox_variants=[
                    {
                        "productId": "product-3",
                        "depth": 120,
                        "width": 95,
                        "height": 25,
                        "weight": 12,
                    }
                ],
            ),
        ]
    )
    test_db.commit()

    response = test_app.post(
        "/api/system/sku/shops",
        headers=headers,
        json={"sku": "product-3"},
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["attributes"] == [
        {"key": "9454", "value": "120"},
        {"key": "9455", "value": "95"},
        {"key": "9456", "value": "25"},
        {"key": "4497", "value": "12"},
    ]


def test_save_is_idempotent_updates_facts_and_clears_removed_values(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    first_payload = product_record_payload(store.id)
    first = test_app.post(
        "/api/product-record/save", headers=headers, json=first_payload
    )
    assert first.status_code == 200

    second_payload = product_record_payload(store.id)
    second_payload["title"] = "更新后的标题"
    second_payload["sku"] = None
    second_payload["description"] = None
    second_payload["variantsData"][0]["stock"] = 0
    second = test_app.post(
        "/api/product-record/save", headers=headers, json=second_payload
    )

    assert second.status_code == 200
    assert second.json()["data"]["id"] == first.json()["data"]["id"]
    assert test_db.query(UploadDraft).count() == 1
    draft = test_db.query(UploadDraft).one()
    assert draft.ozonbox_title == "更新后的标题"
    assert draft.ozonbox_sku is None
    assert draft.ozonbox_description is None
    assert draft.ozonbox_variants[0]["stock"] == 0


def test_same_product_can_be_saved_once_per_store(
    test_app: TestClient, test_db: Session
):
    headers = auth_headers(test_app)
    first_store = create_store(test_db)
    second_store = create_store(
        test_db, name="第二店铺", client_id="client-2", api_key="api-key-2"
    )

    first = test_app.post(
        "/api/product-record/save",
        headers=headers,
        json=product_record_payload(first_store.id),
    )
    second = test_app.post(
        "/api/product-record/save",
        headers=headers,
        json=product_record_payload(second_store.id),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    assert test_db.query(UploadDraft).count() == 2


@pytest.mark.parametrize(
    "change",
    [
        lambda payload: payload.pop("productId"),
        lambda payload: payload.update(productId="not-a-number"),
        lambda payload: payload.update(price=0),
        lambda payload: payload.update(variantsData=[]),
        lambda payload: payload["variantsData"].__setitem__(
            0, {"price": 100, "images": []}
        ),
        lambda payload: payload.update(source="PDD"),
        lambda payload: payload.update(categoryId=1, descriptionCategoryId=2),
    ],
)
def test_save_rejects_non_factual_payloads(
    test_app: TestClient, test_db: Session, change
):
    headers = auth_headers(test_app)
    store = create_store(test_db)
    payload = deepcopy(product_record_payload(store.id))
    change(payload)

    response = test_app.post(
        "/api/product-record/save", headers=headers, json=payload
    )

    assert response.status_code == 422
    assert test_db.query(UploadDraft).count() == 0


def test_save_rejects_unknown_store(test_app: TestClient):
    headers = auth_headers(test_app)
    response = test_app.post(
        "/api/product-record/save",
        headers=headers,
        json=product_record_payload(99999),
    )
    assert response.status_code == 404
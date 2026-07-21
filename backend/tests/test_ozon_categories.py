"""Local Chinese Ozon category snapshot contract."""

from unittest.mock import patch

import pytest

from app.api.routers.selection import get_ozon_categories, sync_ozon_categories
from app.models.ozon_category import OzonCategory
from app.models.store import Store
from app.services.ozon_category_service import replace_category_snapshot


TREE = [
    {
        "description_category_id": 100,
        "category_name": "电子产品",
        "children": [
            {
                "description_category_id": 110,
                "category_name": "手机与配件",
                "children": [
                    {"type_id": 11001, "type_name": "智能手机"},
                    {"type_id": 11002, "type_name": "手机壳"},
                ],
            }
        ],
    }
]


def _store(test_db) -> Store:
    store = Store(name="测试店铺", client_id="client-1", api_key="secret")
    test_db.add(store)
    test_db.commit()
    test_db.refresh(store)
    return store


def test_sync_persists_complete_chinese_tree_and_get_reads_local_db(test_db) -> None:
    store = _store(test_db)

    with patch("app.services.ozon_client.OzonClient.get_category_tree", return_value=TREE) as fetch:
        result = sync_ozon_categories(store_id=store.id, db=test_db)

    fetch.assert_called_once_with(language="ZH_HANS")
    assert result["language"] == "ZH_HANS"
    assert result["count"] == 4

    rows = test_db.query(OzonCategory).order_by(OzonCategory.level, OzonCategory.sort_order).all()
    assert [row.node_key for row in rows] == [
        "cat:100",
        "cat:110",
        "type:110:11001",
        "type:110:11002",
    ]
    smartphone = next(row for row in rows if row.type_id == 11001)
    assert smartphone.description_category_id == 110
    assert smartphone.parent_node_key == "cat:110"
    assert smartphone.name == "智能手机"
    assert smartphone.path == "电子产品 / 手机与配件 / 智能手机"

    with patch(
        "app.services.ozon_client.OzonClient.get_category_tree",
        side_effect=AssertionError("GET must not call Ozon"),
    ):
        snapshot = get_ozon_categories(store_id=None, language="ZH_HANS", db=test_db)

    assert snapshot["count"] == 4
    root = snapshot["categories"][0]
    assert root["description_category_id"] == 100
    assert root["category_name"] == "电子产品"
    type_nodes = root["children"][0]["children"]
    assert type_nodes == [
        {
            "description_category_id": 110,
            "type_id": 11001,
            "type_name": "智能手机",
        },
        {
            "description_category_id": 110,
            "type_id": 11002,
            "type_name": "手机壳",
        },
    ]
    assert snapshot["source_store_id"] == store.id


def test_snapshot_replacement_removes_stale_nodes(test_db) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)

    replacement = [
        {
            "description_category_id": 200,
            "category_name": "家居",
            "children": [{"type_id": 20001, "type_name": "照明"}],
        }
    ]
    result = replace_category_snapshot(test_db, replacement, source_store_id=store.id)

    assert result["count"] == 2
    assert {row.node_key for row in test_db.query(OzonCategory).all()} == {
        "cat:200",
        "type:200:20001",
    }


def test_empty_sync_keeps_previous_snapshot(test_db) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)

    with pytest.raises(ValueError, match="空分类树"):
        replace_category_snapshot(test_db, [], source_store_id=store.id)

    assert test_db.query(OzonCategory).count() == 4
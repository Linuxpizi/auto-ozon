"""Local Chinese Ozon category snapshot contract."""

from unittest.mock import patch
import sqlite3

import pytest

from app.api.routers.selection import get_ozon_categories
from app.models.ozon_category import OzonCategory
from app.models.store import Store
from app.models.task_config import TaskConfig
from app.ozon_constants import OZON_CATEGORY_LANGUAGE
from app.services.ozon_category_service import replace_category_snapshot
from app.services.ozon_client import OzonClient
from app.services.sync_service import run_sync_task


def test_task_config_source_store_migration_is_idempotent(tmp_path) -> None:
    db_path = tmp_path / "legacy.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE task_configs (
                id INTEGER PRIMARY KEY,
                task_key VARCHAR(64) NOT NULL UNIQUE
            )
            """
        )

    with patch("app.core.config.DATABASE_URL", f"sqlite:///{db_path}"):
        from app.main import _ensure_task_config_columns

        _ensure_task_config_columns()
        _ensure_task_config_columns()

    with sqlite3.connect(db_path) as conn:
        columns = [
            row[1]
            for row in conn.execute('PRAGMA table_info("task_configs")').fetchall()
        ]

    assert columns.count("source_store_id") == 1


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


def _category_task(test_db, *, source_store_id: int | None) -> TaskConfig:
    task = TaskConfig(
        task_key="sync_ozon_categories",
        name="同步 Ozon 中文分类",
        description="测试任务",
        trigger_type="interval",
        interval_seconds=7 * 24 * 60 * 60,
        cron_expression="",
        enabled=False,
        source_store_id=source_store_id,
    )
    test_db.add(task)
    test_db.commit()
    test_db.refresh(task)
    return task


def test_sync_persists_complete_chinese_tree_and_get_reads_local_db(test_db) -> None:
    store = _store(test_db)
    task = _category_task(test_db, source_store_id=store.id)

    with patch("app.services.ozon_category_service.OzonClient") as client_class:
        client_class.return_value.get_category_tree.return_value = TREE
        status = run_sync_task(test_db, task.task_key)

    assert status == "success"
    client_class.assert_called_once_with(client_id="client-1", api_key="secret")
    client_class.return_value.get_category_tree.assert_called_once_with()
    test_db.refresh(task)
    assert task.last_status == "success"

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
        snapshot = get_ozon_categories(store_id=None, db=test_db)

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


def test_sync_without_source_store_fails_without_calling_ozon_or_replacing_snapshot(test_db) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)
    task = _category_task(test_db, source_store_id=None)

    with patch("app.services.ozon_category_service.OzonClient") as client_class:
        status = run_sync_task(test_db, task.task_key)

    assert status == "failed"
    client_class.assert_not_called()
    test_db.refresh(task)
    assert task.last_status == "failed"
    assert {row.node_key for row in test_db.query(OzonCategory).all()} == {
        "cat:100",
        "cat:110",
        "type:110:11001",
        "type:110:11002",
    }


def test_sync_with_missing_source_store_fails_and_preserves_snapshot(test_db) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)
    task = _category_task(test_db, source_store_id=999_999)

    with patch("app.services.ozon_category_service.OzonClient") as client_class:
        status = run_sync_task(test_db, task.task_key)

    assert status == "failed"
    client_class.assert_not_called()
    test_db.refresh(task)
    assert task.last_status == "failed"
    assert test_db.query(OzonCategory).count() == 4


def test_invalid_remote_tree_marks_task_failed_and_preserves_snapshot(test_db) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)
    task = _category_task(test_db, source_store_id=store.id)

    with patch("app.services.ozon_category_service.OzonClient") as client_class:
        client_class.return_value.get_category_tree.return_value = []
        status = run_sync_task(test_db, task.task_key)

    assert status == "failed"
    test_db.refresh(task)
    assert task.last_status == "failed"
    assert test_db.query(OzonCategory).count() == 4


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


def test_repeated_sync_is_idempotent(test_db) -> None:
    store = _store(test_db)

    first = replace_category_snapshot(test_db, TREE, source_store_id=store.id)
    second = replace_category_snapshot(test_db, TREE, source_store_id=store.id)

    assert first["count"] == second["count"] == 4
    assert test_db.query(OzonCategory).count() == 4
    assert {row.language for row in test_db.query(OzonCategory).all()} == {
        OZON_CATEGORY_LANGUAGE
    }


def test_ozon_client_category_tree_always_requests_simplified_chinese() -> None:
    client = OzonClient(client_id="client-1", api_key="secret")
    with patch.object(client, "_request", return_value={"result": TREE}) as request:
        result = client.get_category_tree()

    request.assert_called_once_with(
        "POST",
        "/v1/description-category/tree",
        json_body={"language": OZON_CATEGORY_LANGUAGE},
    )
    assert result == TREE


@pytest.mark.parametrize(
    ("invalid_tree", "message"),
    [
        ([{"category_id": 100, "category_name": "电子产品"}], "description_category_id"),
        ([{"description_category_id": 100, "name": "电子产品"}], "category_name"),
        (
            [
                {"description_category_id": 100, "category_name": "电子产品"},
                {"description_category_id": 100, "category_name": "重复电子产品"},
            ],
            "重复节点",
        ),
    ],
)
def test_invalid_sync_keeps_previous_snapshot(test_db, invalid_tree, message) -> None:
    store = _store(test_db)
    replace_category_snapshot(test_db, TREE, source_store_id=store.id)

    with pytest.raises(ValueError, match=message):
        replace_category_snapshot(test_db, invalid_tree, source_store_id=store.id)

    assert {row.node_key for row in test_db.query(OzonCategory).all()} == {
        "cat:100",
        "cat:110",
        "type:110:11001",
        "type:110:11002",
    }

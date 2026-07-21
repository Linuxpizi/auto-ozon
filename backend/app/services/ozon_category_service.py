"""Persistence and reconstruction for the local Ozon category snapshot."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models.ozon_category import OzonCategory


CHINESE_LANGUAGE = "ZH_HANS"


def _positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _category_id(node: dict[str, Any]) -> int | None:
    return _positive_int(
        node.get("description_category_id")
        or node.get("category_id")
        or node.get("id")
    )


def _type_id(node: dict[str, Any]) -> int | None:
    return _positive_int(node.get("type_id") or node.get("ozon_type_id"))


def _node_name(node: dict[str, Any], *, is_type: bool) -> str:
    candidates = (
        (node.get("type_name"), node.get("name"), node.get("category_name"))
        if is_type
        else (node.get("category_name"), node.get("name"), node.get("type_name"))
    )
    return next((str(value).strip() for value in candidates if str(value or "").strip()), "")


def flatten_category_tree(
    tree: Iterable[dict[str, Any]],
    *,
    language: str = CHINESE_LANGUAGE,
    source_store_id: int | None = None,
    synced_at: datetime | None = None,
) -> list[OzonCategory]:
    """Normalize nested Ozon nodes and inherit category IDs for type leaves."""

    timestamp = synced_at or datetime.now(UTC).replace(tzinfo=None)
    rows: list[OzonCategory] = []
    seen_keys: set[str] = set()

    def visit(
        nodes: Iterable[dict[str, Any]],
        *,
        parent_key: str | None,
        parent_category_id: int | None,
        parent_path: list[str],
        level: int,
    ) -> None:
        for sort_order, raw_node in enumerate(nodes):
            if not isinstance(raw_node, dict):
                continue
            direct_category_id = _category_id(raw_node)
            effective_category_id = direct_category_id or parent_category_id
            type_id = _type_id(raw_node)
            if not effective_category_id:
                continue

            is_type = type_id is not None
            node_key = (
                f"type:{effective_category_id}:{type_id}"
                if is_type
                else f"cat:{effective_category_id}"
            )
            if node_key in seen_keys:
                continue
            seen_keys.add(node_key)

            name = _node_name(raw_node, is_type=is_type)
            path_parts = [*parent_path, name] if name else list(parent_path)
            children = raw_node.get("children")
            child_nodes = children if isinstance(children, list) else []
            payload = {key: value for key, value in raw_node.items() if key != "children"}

            rows.append(
                OzonCategory(
                    node_key=node_key,
                    language=language,
                    description_category_id=effective_category_id,
                    type_id=type_id,
                    parent_node_key=parent_key,
                    name=name,
                    path=" / ".join(path_parts),
                    level=level,
                    sort_order=sort_order,
                    is_leaf=not child_nodes,
                    raw_payload=payload,
                    source_store_id=source_store_id,
                    synced_at=timestamp,
                )
            )
            visit(
                child_nodes,
                parent_key=node_key,
                parent_category_id=effective_category_id,
                parent_path=path_parts,
                level=level + 1,
            )

    visit(tree, parent_key=None, parent_category_id=None, parent_path=[], level=0)
    return rows


def replace_category_snapshot(
    db: Session,
    tree: list[dict[str, Any]],
    *,
    source_store_id: int,
    language: str = CHINESE_LANGUAGE,
) -> dict[str, Any]:
    """Atomically replace one complete language snapshot after successful fetch."""

    rows = flatten_category_tree(
        tree,
        language=language,
        source_store_id=source_store_id,
    )
    if not rows:
        raise ValueError("Ozon 返回了空分类树，已保留本地分类快照")

    synced_at = rows[0].synced_at
    try:
        db.query(OzonCategory).filter(OzonCategory.language == language).delete(
            synchronize_session="fetch"
        )
        db.add_all(rows)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "language": language,
        "count": len(rows),
        "synced_at": synced_at,
        "source_store_id": source_store_id,
    }


def get_category_tree_snapshot(
    db: Session,
    *,
    language: str = CHINESE_LANGUAGE,
) -> dict[str, Any]:
    rows = (
        db.query(OzonCategory)
        .filter(OzonCategory.language == language)
        .order_by(OzonCategory.level, OzonCategory.sort_order, OzonCategory.id)
        .all()
    )
    children_by_parent: dict[str | None, list[OzonCategory]] = {}
    for row in rows:
        children_by_parent.setdefault(row.parent_node_key, []).append(row)

    def build(parent_key: str | None) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for row in children_by_parent.get(parent_key, []):
            node = dict(row.raw_payload or {})
            node["description_category_id"] = row.description_category_id
            if row.type_id:
                node["type_id"] = row.type_id
                node["type_name"] = row.name
            else:
                node["category_name"] = row.name
            children = build(row.node_key)
            if children:
                node["children"] = children
            result.append(node)
        return result

    latest = max((row.synced_at for row in rows if row.synced_at), default=None)
    source_store_id = next((row.source_store_id for row in rows if row.source_store_id), None)
    return {
        "categories": build(None),
        "language": language,
        "count": len(rows),
        "synced_at": latest,
        "source_store_id": source_store_id,
    }
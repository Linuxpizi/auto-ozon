"""Version management service for image editing — tracks edit history per session."""
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from app.schemas.image_edit import VersionListResponse, VersionNode, VersionRestoreResponse

logger = logging.getLogger(__name__)

VERSIONS_DIR = Path(__file__).resolve().parent.parent / "static" / "image_versions"
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)

# In-memory session map: image_id -> session_dir name
_session_map: Dict[str, str] = {}


def _get_session_dir(image_id: str) -> Path:
    """Get or create the session directory for an image_id."""
    if image_id not in _session_map:
        session_name = image_id
        _session_map[image_id] = session_name
    return VERSIONS_DIR / _session_map[image_id]


def _load_index(session_dir: Path) -> dict:
    """Load index.json from session dir."""
    index_file = session_dir / "index.json"
    if index_file.exists():
        return json.loads(index_file.read_text(encoding="utf-8"))
    return {"image_id": "", "versions": [], "current_version": ""}


def _save_index(session_dir: Path, index: dict):
    """Save index.json to session dir."""
    index_file = session_dir / "index.json"
    index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def _new_image_id() -> str:
    return f"img_{uuid.uuid4().hex[:12]}"


# ── Public API ─────────────────────────────────────────────────────────


def init_session(image_url: str, description: str = "原图", image_bytes: Optional[bytes] = None) -> str:
    """Initialize a new version session. Returns image_id."""
    image_id = _new_image_id()
    session_dir = _get_session_dir(image_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    version_id = f"v{1}"
    filename = f"{version_id}.png"
    file_path = session_dir / filename

    if image_bytes:
        file_path.write_bytes(image_bytes)

    index = {
        "image_id": image_id,
        "versions": [
            {
                "version_id": version_id,
                "description": description,
                "file": filename,
                "url": f"/static/image_versions/{session_dir.name}/{filename}",
                "prompt": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "parent_version": None,
                "output_size": "",
            }
        ],
        "current_version": version_id,
    }
    _save_index(session_dir, index)
    return image_id


def create_version(
    description: str,
    image_bytes: bytes,
    prompt: Optional[str] = None,
    output_size: str = "",
    image_id: Optional[str] = None,
) -> str:
    """Create a new version. Returns version_id. If no image_id given, creates new session."""
    if image_id and image_id in _session_map:
        session_dir = _get_session_dir(image_id)
        index = _load_index(session_dir)
        parent = index.get("current_version", None)
        v_num = len(index["versions"]) + 1
    else:
        if not image_id:
            image_id = _new_image_id()
        session_dir = _get_session_dir(image_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        index = {"image_id": image_id, "versions": [], "current_version": ""}
        parent = None
        v_num = 1

    version_id = f"v{v_num}"
    filename = f"{version_id}.png"
    file_path = session_dir / filename
    file_path.write_bytes(image_bytes)

    node = {
        "version_id": version_id,
        "description": description,
        "file": filename,
        "url": f"/static/image_versions/{session_dir.name}/{filename}",
        "prompt": prompt,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "parent_version": parent,
        "output_size": output_size,
    }
    index["versions"].append(node)
    index["current_version"] = version_id
    _save_index(session_dir, index)
    return version_id


def list_versions(image_id: str) -> Optional[VersionListResponse]:
    """List all versions for an image."""
    session_dir = _get_session_dir(image_id)
    index = _load_index(session_dir)
    if not index.get("versions"):
        return None
    return VersionListResponse(
        image_id=index["image_id"],
        versions=[VersionNode(**v) for v in index["versions"]],
        current_version=index["current_version"],
    )


def restore_version(image_id: str, version_id: str) -> Optional[VersionRestoreResponse]:
    """Restore to a specific version."""
    session_dir = _get_session_dir(image_id)
    index = _load_index(session_dir)
    found = None
    for v in index["versions"]:
        if v["version_id"] == version_id:
            found = v
            break
    if not found:
        return None

    index["current_version"] = version_id
    _save_index(session_dir, index)

    return VersionRestoreResponse(
        image_id=image_id,
        restored_version=VersionNode(**found),
        all_versions=[VersionNode(**v) for v in index["versions"]],
    )

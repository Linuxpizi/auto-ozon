"""Image version management router — list, get, restore versions."""
from fastapi import APIRouter, HTTPException

from app.services import image_version_service

router = APIRouter()


@router.get("/versions/{image_id}")
async def api_list_versions(image_id: str):
    """List all edit versions for an image."""
    result = image_version_service.list_versions(image_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Image session not found")
    return result


@router.post("/versions/{image_id}/{version_id}/restore")
async def api_restore_version(image_id: str, version_id: str):
    """Restore to a specific version."""
    result = image_version_service.restore_version(image_id, version_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return result

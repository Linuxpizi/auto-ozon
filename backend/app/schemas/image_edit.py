"""Schemas for interactive image editing endpoints."""
from typing import List, Optional
from pydantic import BaseModel, Field

# ── EditAction – a single composable operation ──


class EditAction(BaseModel):
    """A single editable operation in a composition chain.

    type:
      - 'prompt'     : natural-language edit on image
      - 'remove_bg'  : remove background
      - 'brush'      : freeform mask inpainting
      - 'rect'       : rectangular region inpainting
      - 'upscale'    : 2× / 4× super-resolution
      - 'expand'     : outpainting / image expansion

    Every action operates on the **latest intermediate result** of the chain.
    """

    type: str = Field(..., description="Action type: prompt / remove_bg / brush / rect / upscale / expand")
    prompt: Optional[str] = Field(None, description="Instruction for prompt/brush/rect/expand actions")
    mask_data: Optional[str] = Field(None, description="Brush mask base64 (used when type='brush')")
    bbox: Optional[dict] = Field(None, description="Bounding box {x1,y1,x2,y2} normalized (used when type='rect')")
    scale: int = Field(default=2, ge=2, le=4, description="Upscale factor (used when type='upscale')")
    direction: str = Field(default="all", description="Expand direction (used when type='expand')")
    expand_ratio: float = Field(default=0.5, ge=0.25, le=1.0, description="Expand ratio (used when type='expand')")


class EditChainRequest(BaseModel):
    """Multi-step composite editing: execute actions sequentially on an image.

    Each action uses the **previous action's output** as its input,
    dramatically reducing token waste compared to N separate round-trips.
    """
    image_url: str = Field(..., description="Starting image URL or base64")
    actions: List[EditAction] = Field(..., min_length=1, max_length=8,
                                       description="Actions to execute in sequence (1-8)")
    output_preset: str = Field(default="ozon_main")
    custom_width: Optional[int] = None
    custom_height: Optional[int] = None
    quality: int = Field(default=90, ge=1, le=100)


class EditChainResponse(BaseModel):
    original_url: str
    result_url: str
    version_id: str
    output_size: str = ""
    file_size_kb: int = 0
    steps: int = 0
    final_prompt: str = Field(default="", description="Final merged instruction sent/recorded for the edit chain")
    ai_calls: int = Field(default=0, description="Number of backend AI operations executed after batching")


# ── Output Presets (Ozon platform sizes) ────────────────────────────────

OUTPUT_PRESETS = {
    "ozon_main":      {"label": "Ozon 主图",      "width": 900,  "height": 1200, "ratio": "3:4"},
    "ozon_secondary": {"label": "Ozon 辅图",      "width": 900,  "height": 1200, "ratio": "3:4"},
    "ozon_detail_h":  {"label": "Ozon 详情(横)",  "width": 1200, "height": 900,  "ratio": "4:3"},
    "ozon_detail_sq": {"label": "Ozon 详情(方)",  "width": 1000, "height": 1000, "ratio": "1:1"},
    "ozon_banner":    {"label": "Ozon Banner",    "width": 1200, "height": 675,  "ratio": "16:9"},
}

GPT_SIZE_MAP = {
    "ozon_main":      "1024x1536",
    "ozon_secondary": "1024x1536",
    "ozon_detail_h":  "1536x1024",
    "ozon_detail_sq": "1024x1024",
    "ozon_banner":    "1536x1024",
}

# ── Unified Edit (backward-compatible single-action) ────────────────────


class ImageEditRequest(BaseModel):
    image_url: str = Field(..., description="原始图片 URL 或 base64")
    prompt: str = Field(..., description="编辑指令 (自然语言)")
    mask: Optional[str] = Field(None, description="遮罩 base64 (白色=编辑区域)")
    output_preset: str = Field(default="ozon_main", description="输出尺寸预设")
    custom_width: Optional[int] = Field(None, description="自定义宽度")
    custom_height: Optional[int] = Field(None, description="自定义高度")
    quality: int = Field(default=90, ge=1, le=100, description="输出质量")
    context: Optional[str] = Field(None, description="商品上下文 (类目/风格等)")
    # 兼容字段: edit-chain 内部转换使用
    mask_data: Optional[str] = Field(None, description="同 mask, 编辑链内部透传")
    bbox: Optional[dict] = Field(None, description="框选区域 {x1,y1,x2,y2} 归一化")
    brush_strokes: Optional[List[dict]] = Field(None, description="涂鸦笔迹列表")
    remove_bg: bool = False


class ImageEditResponse(BaseModel):
    original_url: str
    result_url: str
    version_id: str
    output_size: str = Field(default="", description="输出尺寸, e.g. 900x1200")
    file_size_kb: int = Field(default=0, description="文件大小 KB")


# ── Remove Background ──────────────────────────────────────────────────


class ImageRemoveBgRequest(BaseModel):
    image_url: str = Field(..., description="原始图片 URL 或 base64")
    bg_color: str = Field(default="white", description="背景色: white / transparent")
    output_preset: str = Field(default="ozon_main")
    custom_width: Optional[int] = None
    custom_height: Optional[int] = None


class ImageRemoveBgResponse(BaseModel):
    original_url: str
    result_url: str
    version_id: str
    output_size: str = ""
    file_size_kb: int = 0


# ── AI Expand (Outpainting) ───────────────────────────────────────────


class ImageExpandRequest(BaseModel):
    image_url: str = Field(..., description="原始图片 URL 或 base64")
    direction: str = Field(default="all", description="扩展方向: all/left/right/top/bottom")
    expand_ratio: float = Field(default=0.5, ge=0.25, le=1.0, description="扩展比例")
    prompt: Optional[str] = Field(None, description="可选: 引导生成方向")
    output_preset: str = Field(default="ozon_detail_h")
    custom_width: Optional[int] = None
    custom_height: Optional[int] = None


class ImageExpandResponse(BaseModel):
    original_url: str
    result_url: str
    version_id: str
    original_size: str = ""
    expanded_size: str = ""


# ── High-Res Upscale ──────────────────────────────────────────────────


class ImageUpscaleRequest(BaseModel):
    image_url: str = Field(..., description="原始图片 URL 或 base64")
    scale: int = Field(default=2, ge=2, le=4, description="倍率: 2 或 4")
    output_preset: Optional[str] = Field(None, description="如指定则裁剪到目标尺寸")
    custom_width: Optional[int] = None
    custom_height: Optional[int] = None


class ImageUpscaleResponse(BaseModel):
    original_url: str
    result_url: str
    version_id: str
    original_size: str = ""
    upscaled_size: str = ""


# ── Version Management ─────────────────────────────────────────────────


class VersionNode(BaseModel):
    version_id: str
    description: str
    file: str
    url: str
    prompt: Optional[str] = None
    timestamp: str
    parent_version: Optional[str] = None
    output_size: str = ""


class VersionListResponse(BaseModel):
    image_id: str
    versions: List[VersionNode]
    current_version: str


class VersionRestoreResponse(BaseModel):
    image_id: str
    restored_version: VersionNode
    all_versions: List[VersionNode]

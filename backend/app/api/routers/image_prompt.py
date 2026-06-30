"""Image Prompt API router — POST /api/v1/image/prompt"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.crud import prompt_template as pt_crud
from app.services.prompt_engine import render_prompt, _call_llm, _extract_json

router = APIRouter()


class ImagePromptRequest(BaseModel):
    category: str = Field(..., description="商品品类")
    brand: Optional[str] = None
    style: str = Field(default="realistic", description="风格: realistic | flat | 3d | minimalist")
    features: List[str] = Field(default=[], description="商品特征")
    platform: str = Field(default="OZON", description="目标平台: TB | OZON")
    language: str = Field(default="ru", description="输出语言: zh | ru | en")
    template_name: Optional[str] = Field(None, description="指定模板名称，否则自动路由")


class ImagePromptResponse(BaseModel):
    prompts: List[str] = []
    style_notes: Optional[str] = None
    raw_output: Optional[str] = None


# ── Pre-built image prompt templates ────────────────────────────────────

IMAGE_SYSTEM_PROMPT = """你是一名专业的电商商品图片AI绘图Prompt工程师。

任务：根据商品信息生成高质量的AI绘图Prompt（适用于 Midjourney / Stable Diffusion）。

要求：
- Prompt 必须使用英文
- 包含主体描述、材质、光影、构图、风格
- 适合电商平台主图和详情页
- 不编造不存在的属性
- 输出JSON格式，包含 prompts 数组和 style_notes

输出格式：
{
  "prompts": ["prompt1", "prompt2", ...],
  "style_notes": "..."
}"""


@router.post("/prompt", response_model=ImagePromptResponse)
def generate_image_prompt(body: ImagePromptRequest, db: Session = Depends(get_db)):
    """根据商品信息生成AI绘图Prompt"""
    try:
        # Try to load template from DB
        template = None
        if body.template_name:
            template = pt_crud.get_template_by_name(db, body.template_name)
        else:
            template = pt_crud.get_active_template(
                db, platform=body.platform, language=body.language, category="IMAGE"
            )

        system_prompt = IMAGE_SYSTEM_PROMPT
        if template:
            system_prompt = template.system_prompt

        input_data = {
            "category": body.category,
            "brand": body.brand or "",
            "style": body.style,
            "features": body.features,
            "platform": body.platform,
            "language": body.language,
        }

        rendered_system = render_prompt(system_prompt, input_data)
        import json
        user_content = json.dumps(input_data, ensure_ascii=False)

        model = template.model if template else "deepseek-chat"
        raw_output = _call_llm(rendered_system, user_content, model)
        parsed = _extract_json(raw_output)

        resp = ImagePromptResponse(raw_output=raw_output)
        if "prompts" in parsed and isinstance(parsed["prompts"], list):
            resp.prompts = parsed["prompts"]
        if "style_notes" in parsed:
            resp.style_notes = parsed["style_notes"]
        return resp

    except Exception as e:
        raise HTTPException(500, f"图片Prompt生成失败: {e}")

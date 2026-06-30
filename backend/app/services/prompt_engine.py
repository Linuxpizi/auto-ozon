"""Prompt Engine — template management, routing, rendering, and LLM execution."""
import json
import logging
import re
from typing import Any, Dict, Optional
from openai import OpenAI

from app.core.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.models.prompt_template import PromptTemplate
from app.schemas.prompt_template import (
    TitleOptimizeRequest,
    TitleOptimizeResponse,
    ProductOptimizeRequest,
    ProductOptimizeResponse,
)
from app.services.localization_rules import apply_localization

logger = logging.getLogger(__name__)

# ── LLM Client ──────────────────────────────────────────────────────────

def _get_client(model: Optional[str] = None) -> OpenAI:
    return OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
    )


def _call_llm(system_prompt: str, user_content: str, model: str = DEEPSEEK_MODEL) -> str:
    client = _get_client(model)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.3,
        max_tokens=2048,
    )
    return response.choices[0].message.content or ""


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Strip markdown code fences
    if "```" in text:
        # Try to find JSON block
        match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", text)
        if match:
            text = match.group(1)

    # Find first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON from: %s", text)
        return {}


# ── Prompt Renderer ─────────────────────────────────────────────────────

# Known parameter placeholders: {{platform}}, {{country}}, {{language}},
# {{category}}, {{brand}}, {{attribute}}, {{feature}}, {{audience}}, {{tone}}, {{output}}

def render_prompt(template: str, params: Dict[str, Any]) -> str:
    """Replace {{key}} placeholders in the template with actual values."""
    result = template
    for key, value in params.items():
        placeholder = "{{" + key + "}}"
        if isinstance(value, (list, dict)):
            value = json.dumps(value, ensure_ascii=False, indent=2)
        result = result.replace(placeholder, str(value))
    return result


# ── Input Builders ──────────────────────────────────────────────────────

def build_title_input(req: TitleOptimizeRequest) -> Dict[str, Any]:
    """Build the JSON input for title optimization prompt."""
    data: Dict[str, Any] = {
        "platform": req.platform,
        "language": req.language,
        "brand": req.brand,
    }
    if req.category:
        data["category"] = req.category
    if req.material:
        data["material"] = req.material
    if req.capacity:
        data["capacity"] = req.capacity
    if req.color:
        data["color"] = req.color
    if req.feature:
        data["feature"] = req.feature
    if req.source_language:
        data["source_language"] = req.source_language
    return data


def build_product_input(req: ProductOptimizeRequest) -> Dict[str, Any]:
    """Build the JSON input for product optimization prompt."""
    data: Dict[str, Any] = {
        "platform": req.platform,
        "language": req.language,
        "title": req.title,
        "brand": req.brand,
    }
    if req.category:
        data["category"] = req.category
    if req.description:
        data["description"] = req.description
    if req.attributes:
        data["attributes"] = req.attributes
    if req.features:
        data["features"] = req.features
    return data


# ── Template Router ─────────────────────────────────────────────────────

def resolve_template(
    db_session,
    platform: str,
    language: str = "zh",
    category: Optional[str] = None,
    template_name: Optional[str] = None,
) -> Optional[PromptTemplate]:
    """Resolve which template to use: by name or by auto-routing."""
    from app.crud import prompt_template as pt_crud

    if template_name:
        return pt_crud.get_template_by_name(db_session, template_name)
    return pt_crud.get_active_template(db_session, platform, language, category)


# ── Title Optimizer ─────────────────────────────────────────────────────

def optimize_title(req: TitleOptimizeRequest, db_session) -> TitleOptimizeResponse:
    """Execute title optimization using the resolved template."""
    template = resolve_template(
        db_session,
        platform=req.platform,
        language=req.language,
        category=req.category,
        template_name=req.template_name,
    )
    if not template:
        raise ValueError(
            f"No template found for platform={req.platform}, language={req.language}, "
            f"category={req.category}"
        )

    input_data = build_title_input(req)
    user_content = json.dumps(input_data, ensure_ascii=False)

    # Render the system prompt with params
    rendered_system = render_prompt(template.system_prompt, input_data)

    raw_output = _call_llm(rendered_system, user_content, template.model)
    parsed = _extract_json(raw_output)

    resp = TitleOptimizeResponse(raw_output=raw_output)

    # Map parsed fields to response (flexible — handles both TB and OZON outputs)
    if "title_ru" in parsed:
        resp.title_ru = parsed["title_ru"]
        resp.title = parsed.get("title", "")
    elif "title" in parsed:
        resp.title = parsed["title"]
    if "keywords" in parsed:
        resp.keywords = parsed["keywords"] if isinstance(parsed["keywords"], list) else []
    if "reason" in parsed:
        resp.reason = parsed["reason"]
    if "seo_score" in parsed:
        resp.seo_score = int(parsed["seo_score"]) if parsed["seo_score"] else None

    return resp


# ── Product Optimizer ───────────────────────────────────────────────────

def optimize_product(req: ProductOptimizeRequest, db_session) -> ProductOptimizeResponse:
    """Execute product optimization using the resolved template."""
    template = resolve_template(
        db_session,
        platform=req.platform,
        language=req.language,
        category=req.category,
        template_name=req.template_name,
    )
    if not template:
        raise ValueError(
            f"No template found for platform={req.platform}, language={req.language}, "
            f"category={req.category}"
        )

    input_data = build_product_input(req)

    # Apply localization for OZON platform
    if req.platform.upper() == "OZON":
        input_data = apply_localization(input_data)

    user_content = json.dumps(input_data, ensure_ascii=False)
    rendered_system = render_prompt(template.system_prompt, input_data)

    raw_output = _call_llm(rendered_system, user_content, template.model)
    parsed = _extract_json(raw_output)

    resp = ProductOptimizeResponse(raw_output=raw_output)

    # Map parsed fields
    for field in ("title", "title_ru", "description", "target_audience", "notes"):
        if field in parsed:
            setattr(resp, field, parsed[field])
    for list_field in ("selling_points", "usage_scenarios", "keywords"):
        if list_field in parsed:
            val = parsed[list_field]
            setattr(resp, list_field, val if isinstance(val, list) else [])
    if "faq" in parsed:
        faq = parsed["faq"]
        resp.faq = faq if isinstance(faq, list) else []

    return resp

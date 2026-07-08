"""AI Translate Service — text translation and description optimization via DeepSeek."""
import json
import logging

from app.schemas.ai import (
    AITranslateRequest,
    AITranslateResponse,
    AIBatchTranslateRequest,
    AIBatchTranslateResponse,
    AIBatchTranslateItemResponse,
    AIOptimizeDescriptionRequest,
    AIOptimizeDescriptionResponse,
)
from app.services.prompt_engine import _call_llm, _extract_json

logger = logging.getLogger(__name__)

# ── Prompts ─────────────────────────────────────────────────────────────

TRANSLATE_SYSTEM_PROMPT = """你是一位专业的中俄翻译专家,精通电商领域翻译。

任务: 将中文电商文本翻译为自然流畅的俄语。

翻译要求:
1. 保留原始含义,不要遗漏信息
2. 使用符合俄罗斯消费者习惯的表达方式
3. 如果是标题(field_type=title),保持简洁有力,突出卖点
4. 如果是属性(field_type=attribute),使用标准俄语商品属性格式
5. 如果是描述(field_type=description),语句通顺,突出商品特点
6. 不要添加原文没有的信息
7. 只输出翻译后的俄语文本,不要解释"""

BATCH_TRANSLATE_SYSTEM_PROMPT = """你是一位专业的中俄翻译专家,精通电商领域翻译。

任务: 将多条中文电商文本批量翻译为俄语。

翻译要求:
1. 保留原始含义
2. 使用符合俄罗斯消费者习惯的表达方式
3. 根据 field_type 区分翻译风格: title 简洁有力, attribute 标准格式, description 语句通顺
4. 不要添加原文没有的信息

输出格式: 严格返回 JSON 数组,每个元素包含 key 和 translated 字段。
示例: [{"key": "color", "translated": "красный"}, {"key": "material", "translated": "из нержавеющей стали"}]"""

OPTIMIZE_DESCRIPTION_SYSTEM_PROMPT = """你是一位资深的俄罗斯电商平台(Ozon)商品文案优化专家。

任务: 基于商品信息,按 field_type 生成优化后的俄语商品文案。

优化要求:
1. 如果 field_type=title: 生成适合 Ozon 的俄语商品名称,简洁清晰,包含品类/核心属性/规格,不要堆砌关键词
2. 如果 field_type=description: 生成优化后的俄语商品描述,突出商品核心卖点和使用场景
3. 如果 field_type=attribute: 优化商品属性表达,保持属性事实准确
4. 不要添加输入中没有的品牌、材质、尺寸、认证等事实
5. 使用符合俄罗斯消费者习惯的表达
6. 包含必要搜索关键词提升 SEO,但不要牺牲可读性
7. 描述结构清晰,段落分明；标题保持一行短文本
8. 描述长度适中(200-500字符),标题建议 80-140 字符以内

通用要求:
2. 使用符合俄罗斯消费者习惯的表达
3. 语气专业但不生硬

输出格式: 严格返回 JSON,包含以下字段:
{
  "description": "优化后的俄语文案。field_type=title 时这里返回优化后的商品名称；field_type=description 时返回商品描述",
  "selling_points": ["卖点1", "卖点2"],
  "keywords": ["关键词1", "关键词2"]
}"""


# ── Core Functions ──────────────────────────────────────────────────────


def translate_text(req: AITranslateRequest) -> AITranslateResponse:
    """Translate a single text field from source_lang to target_lang."""
    user_content = json.dumps({
        "text": req.text,
        "source_lang": req.source_lang,
        "target_lang": req.target_lang,
        "field_type": req.field_type,
    }, ensure_ascii=False)

    if req.context:
        user_content += f"\n\n上下文: {req.context}"

    raw_output = _call_llm(TRANSLATE_SYSTEM_PROMPT, user_content)

    # For translation, the LLM typically returns plain text
    translated = raw_output.strip()

    # Remove possible quotes wrapping
    if len(translated) > 2 and translated.startswith('"') and translated.endswith('"'):
        translated = translated[1:-1]

    return AITranslateResponse(
        original=req.text,
        translated=translated,
        raw_output=raw_output,
    )


def translate_batch(req: AIBatchTranslateRequest) -> AIBatchTranslateResponse:
    """Translate multiple text fields in a single LLM call."""
    items_data = [{"key": item.key, "text": item.text, "field_type": item.field_type} for item in req.items]

    user_content = json.dumps({
        "items": items_data,
        "source_lang": req.source_lang,
        "target_lang": req.target_lang,
    }, ensure_ascii=False)

    if req.context:
        user_content += f"\n\n上下文: {req.context}"

    raw_output = _call_llm(BATCH_TRANSLATE_SYSTEM_PROMPT, user_content)
    parsed = _extract_json(raw_output)

    # parsed should be a list
    if isinstance(parsed, dict) and "items" in parsed:
        parsed = parsed["items"]

    results = []
    if isinstance(parsed, list):
        parsed_map = {item.get("key", ""): item.get("translated", "") for item in parsed if isinstance(item, dict)}
        for req_item in req.items:
            translated = parsed_map.get(req_item.key, "")
            results.append(AIBatchTranslateItemResponse(
                key=req_item.key,
                original=req_item.text,
                translated=translated,
            ))
    else:
        # Fallback: translate each item individually using simple replacement
        for req_item in req.items:
            results.append(AIBatchTranslateItemResponse(
                key=req_item.key,
                original=req_item.text,
                translated="[翻译失败,请重试]",
            ))

    return AIBatchTranslateResponse(items=results, raw_output=raw_output)


def optimize_description(req: AIOptimizeDescriptionRequest) -> AIOptimizeDescriptionResponse:
    """Optimize product description for the target platform."""
    user_content = json.dumps({
        "title": req.title,
        "description": req.description,
        "attributes": req.attributes or {},
        "field_type": req.field_type,
        "platform": req.platform,
        "language": req.language,
    }, ensure_ascii=False)

    if req.context:
        user_content += f"\n\n额外要求: {req.context}"

    raw_output = _call_llm(OPTIMIZE_DESCRIPTION_SYSTEM_PROMPT, user_content)
    parsed = _extract_json(raw_output)

    resp = AIOptimizeDescriptionResponse(raw_output=raw_output)

    if isinstance(parsed, dict) and "description" in parsed:
        resp.description = parsed["description"]
    elif isinstance(parsed, dict) and "title" in parsed:
        # Some LLMs return title for field_type=title despite the requested schema.
        resp.description = parsed["title"]
    elif isinstance(parsed, dict) and "title_ru" in parsed:
        resp.description = parsed["title_ru"]
    else:
        # Fallback: avoid turning a malformed LLM response into HTTP 500.
        resp.description = raw_output.strip()
    if isinstance(parsed, dict) and "selling_points" in parsed and isinstance(parsed["selling_points"], list):
        resp.selling_points = parsed["selling_points"]
    if isinstance(parsed, dict) and "keywords" in parsed and isinstance(parsed["keywords"], list):
        resp.keywords = parsed["keywords"]

    return resp

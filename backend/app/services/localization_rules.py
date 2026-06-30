"""Localization Engine — Chinese e-commerce expressions → Russian localization."""
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

# Mapping table from design doc
LOCALIZATION_RULES: Dict[str, Any] = {
    # 删除类 — remove entirely
    "爆款": "",
    "网红推荐": "",
    "网红": "",
    "爆款热卖": "",
    # 替换类 — replace with Russian equivalents
    "居家必备": "Подходит для ежедневного использования",
    "厨房": "для кухни",
    "厨房用品": "для кухни и дома",
    "家庭": "для семьи",
    "家庭必备": "подходит для дома и семьи",
    "冬季": "зимний",
    "保暖": "сохраняет тепло",
    "便携": "портативный",
    "防漏": "герметичная крышка",
    "大容量": "большая вместимость",
    "不锈钢": "из нержавеющей стали",
    "双层": "двойные стенки",
    "保温": "термо",
    "防摔": "защита от ударов",
    "轻便": "лёгкий",
    "耐用": "прочный и долговечный",
    "高品质": "высокое качество",
    "性价比": "отличное соотношение цены и качества",
    "包邮": "бесплатная доставка",
    "限时特价": "специальная цена",
    "新品": "новинка",
    "热销": "популярный товар",
    # 单位类 — unit conversions (handled separately, placeholder here)
    "ML": "мл",
    "ml": "мл",
    "CM": "см",
    "cm": "см",
    "KG": "кг",
    "kg": "кг",
}


def apply_localization(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply Russian localization rules to product data.
    - Removes Chinese e-commerce specific expressions
    - Replaces with Russian consumer-friendly expressions
    - Does NOT fabricate attributes
    """
    localized = {}
    for key, value in data.items():
        if isinstance(value, str):
            localized[key] = _localize_text(value)
        elif isinstance(value, list):
            localized[key] = [_localize_text(item) if isinstance(item, str) else item for item in value]
        else:
            localized[key] = value
    return localized


def _localize_text(text: str) -> str:
    """Apply localization rules to a single string."""
    result = text
    for cn_expr, ru_expr in LOCALIZATION_RULES.items():
        if ru_expr == "":
            # Remove
            result = result.replace(cn_expr, "")
        else:
            # Replace
            result = result.replace(cn_expr, ru_expr)
    # Clean up extra spaces
    result = " ".join(result.split())
    return result

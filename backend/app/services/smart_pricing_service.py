"""智能定价服务 — 根据成本、汇率、运费、佣金、利润率自动计算建议价格"""
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PricingInput:
    """定价输入参数"""
    # 成本
    cost_cny: float = 0.0          # 1688 采购价 (CNY)
    shipping_cny: float = 0.0      # 国际运费 (CNY)，可选
    packaging_cny: float = 0.0     # 包装费 (CNY)，可选

    # 汇率与佣金
    exchange_rate: float = 12.5     # CNY → RUB 汇率
    ozon_commission_pct: float = 15.0  # Ozon 佣金比例 %
    logistics_commission_pct: float = 0.0  # Ozon 物流佣金 %

    # 利润设定
    target_margin_pct: float = 30.0  # 目标利润率 %
    min_margin_pct: float = 10.0     # 最低利润率 %

    # 竞品参考 (可选)
    competitor_price_rub: float = 0.0  # 竞品价格 RUB

    # 平台规则
    min_price_rub: float = 0.0      # 平台最低价 (如有)
    max_price_rub: float = 0.0      # 平台最高价 (如有)


@dataclass
class PricingResult:
    """定价计算结果"""
    cost_total_cny: float = 0.0       # 总成本 (CNY)
    cost_total_rub: float = 0.0       # 总成本 (RUB)
    suggested_price_rub: float = 0.0  # 建议售价 (RUB)
    old_price_rub: float = 0.0        # 原价/划线价 (RUB)
    margin_pct: float = 0.0           # 实际利润率 %
    profit_rub: float = 0.0           # 预计利润 (RUB)
    commission_rub: float = 0.0       # 佣金 (RUB)
    breakdown: dict = field(default_factory=dict)  # 费用明细


def calculate_smart_price(inp: PricingInput) -> PricingResult:
    """
    智能定价算法：
    1. 计算总成本 (采购 + 运费 + 包装)
    2. 汇率换算到 RUB
    3. 加入佣金和利润率
    4. 参考竞品价格微调
    5. 限制在平台允许范围内
    """
    result = PricingResult()

    # ── Step 1: 总成本 (CNY) ──
    total_cost_cny = inp.cost_cny + inp.shipping_cny + inp.packaging_cny
    result.cost_total_cny = round(total_cost_cny, 2)

    # ── Step 2: 汇率换算 ──
    rate = inp.exchange_rate if inp.exchange_rate > 0 else 12.5
    total_cost_rub = total_cost_cny * rate
    result.cost_total_rub = round(total_cost_rub, 2)

    # ── Step 3: 基础定价 (成本 + 佣金 + 利润) ──
    # 佣金 = 售价 * 佣金率, 所以 售价 = 成本 / (1 - 佣金率) * (1 + 利润率)
    commission_rate = (inp.ozon_commission_pct + inp.logistics_commission_pct) / 100.0
    margin_rate = inp.target_margin_pct / 100.0

    if commission_rate >= 1.0:
        commission_rate = 0.5  # 安全上限

    # 售价 = 成本 × (1 + 利润率) / (1 - 佣金率)
    denominator = max(1.0 - commission_rate, 0.01)  # 防止除以 0
    base_price = total_cost_rub * (1.0 + margin_rate) / denominator
    suggested_price = round(base_price, 0)  # 取整到卢布

    # ── Step 4: 竞品参考 ──
    if inp.competitor_price_rub > 0:
        # 如果建议价格比竞品高太多 (超过 30%)，适当降低
        if suggested_price > inp.competitor_price_rub * 1.3:
            # 取竞品价格的 110% 和建议价格的加权平均
            suggested_price = round(
                suggested_price * 0.5 + inp.competitor_price_rub * 1.1 * 0.5, 0
            )
        # 如果建议价格比竞品低太多 (低于 60%)，适当提高
        elif suggested_price < inp.competitor_price_rub * 0.6:
            suggested_price = round(
                suggested_price * 0.5 + inp.competitor_price_rub * 0.8 * 0.5, 0
            )

    # ── Step 5: 最低利润保护 ──
    min_price = total_cost_rub * (1.0 + inp.min_margin_pct / 100.0) / denominator
    if suggested_price < min_price:
        suggested_price = round(min_price, 0)

    # ── Step 6: 平台价格范围限制 ──
    if inp.min_price_rub > 0 and suggested_price < inp.min_price_rub:
        suggested_price = inp.min_price_rub
    if inp.max_price_rub > 0 and suggested_price > inp.max_price_rub:
        suggested_price = inp.max_price_rub

    result.suggested_price_rub = suggested_price

    # ── Step 7: 划线价 (原价) ──
    # 比建议价高 15-25% 作为划线价
    result.old_price_rub = round(suggested_price * 1.2, 0)

    # ── Step 8: 计算实际利润 ──
    commission = suggested_price * commission_rate
    result.commission_rub = round(commission, 2)
    result.profit_rub = round(suggested_price - total_cost_rub - commission, 2)
    result.margin_pct = round(
        (result.profit_rub / total_cost_rub * 100) if total_cost_rub > 0 else 0, 1
    )

    # ── 费用明细 ──
    result.breakdown = {
        "cost_cny": total_cost_cny,
        "cost_rub": total_cost_rub,
        "shipping_cny": inp.shipping_cny,
        "packaging_cny": inp.packaging_cny,
        "exchange_rate": rate,
        "commission_pct": inp.ozon_commission_pct + inp.logistics_commission_pct,
        "commission_rub": round(commission, 2),
        "target_margin_pct": inp.target_margin_pct,
        "actual_margin_pct": result.margin_pct,
        "profit_rub": result.profit_rub,
    }

    logger.info(
        "Smart pricing: cost=%.2fCNY → %.2fRUB, suggested=%.0fRUB, margin=%.1f%%",
        total_cost_cny, total_cost_rub, suggested_price, result.margin_pct,
    )

    return result

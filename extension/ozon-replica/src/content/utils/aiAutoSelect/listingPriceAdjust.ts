import { roundPrice } from '../../../utils/price'
import type { AiAutoSelectDraftItem, ListingPriceAdjustConfig } from './types'

/** 售价调整数值有效且大于 0 时才启用 */
export function isListingPriceAdjustActive(config?: ListingPriceAdjustConfig | null): config is ListingPriceAdjustConfig {
  if (!config) return false
  const value = Number(config.value)
  return Number.isFinite(value) && value > 0
}

/** 上涨/下调为百分比运算，展示与输入需带 % */
export function isListingPriceAdjustPercentOp(op: ListingPriceAdjustConfig['op']): boolean {
  return op === 'pct_up' || op === 'pct_down'
}

/** 依据采集价与调整规则计算上架售价 */
export function calcAdjustedListingPrice(basePrice: number, config: ListingPriceAdjustConfig): number {
  const base = Number.isFinite(basePrice) ? basePrice : 0
  const value = Number(config.value)
  let next = base
  switch (config.op) {
    case 'add':
      next = base + value
      break
    case 'sub':
      next = base - value
      break
    case 'mul':
      next = base * value
      break
    case 'div':
      next = value !== 0 ? base / value : base
      break
    case 'pct_up':
      next = base * (1 + value / 100)
      break
    case 'pct_down':
      next = base * (1 - value / 100)
      break
    default:
      break
  }
  return Math.max(0, roundPrice(next, 2))
}

/** 深拷贝草稿并对全部变体应用售价调整，不修改原草稿 */
export function applyListingPriceAdjustToDraftItem(
  item: AiAutoSelectDraftItem,
  config: ListingPriceAdjustConfig,
): AiAutoSelectDraftItem {
  const transformed = JSON.parse(JSON.stringify(item.transformed || {})) as AiAutoSelectDraftItem['transformed']
  const skuMatrix = transformed?.sku_matrix
  if (!Array.isArray(skuMatrix)) {
    return { ...item, transformed }
  }
  skuMatrix.forEach((sku) => {
    if (!sku || typeof sku !== 'object') return
    const row = sku as { sale_price?: number; price_amount?: number }
    const basePrice = Number(row.sale_price ?? row.price_amount ?? 0)
    const adjusted = calcAdjustedListingPrice(basePrice, config)
    row.sale_price = adjusted
    row.price_amount = adjusted
  })
  return { ...item, transformed }
}

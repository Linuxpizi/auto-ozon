import { getCalcLocalPrefs } from '../ozonProfitCalc/calcLocalPrefs'
import { calculateOzonRealPrice, extractPriceUnit } from '../ozonProfitCalc/realPriceCalc'
import type { QuickShelvePriceSource, QuickShelveSkuRow } from './types'

export interface PriceQuadResult {
  now: string
  original: string
  actual: string
  recommend: string
  showDerived: boolean
  unit: string
}

export interface PriceQuadContext {
  currentDetailSku?: string
  isDetail?: boolean
}

function parsePriceNumber(text: string): number {
  if (text == null) return NaN
  let s = String(text)
    .trim()
    .replace(/[    ⁠]/g, '')
    .replace(/\s+/g, '')
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(?:,\d{3})+$/.test(s) || /^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '')
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/** 从行内价格文案识别币种（₽ / $ / ¥ 等） */
export function resolveRowPriceUnit(row: QuickShelveSkuRow): string {
  return extractPriceUnit(row.price) || extractPriceUnit(row.originalPrice) || extractPriceUnit(row.blackPrice || '') || '₽'
}

/** 千分位 + 固定两位小数（不带币种，表头已标注） */
export function formatAmountDisplay(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '--'
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 千分位 + 固定两位小数 + 币种符号（供跟卖换算等场景） */
export function formatAmountWithUnit(num: number, unit: string): string {
  if (!Number.isFinite(num) || num <= 0) return '--'
  return `${formatAmountDisplay(num)}${unit}`
}

/** 价格文案 → 千分位两位小数（不带单位） */
export function formatDisplayPrice(text: string): string {
  if (!text || !String(text).trim()) return '--'
  const n = parsePriceNumber(text)
  if (!Number.isFinite(n) || n <= 0) return String(text).trim()
  return formatAmountDisplay(n)
}

function formatPriceWithUnit(num: number, refText: string): string {
  if (!Number.isFinite(num) || num <= 0) return ''
  const unit = extractPriceUnit(refText) || '₽'
  const rounded = Math.round(num * 100) / 100
  return `${rounded}${unit}`
}

function computeActualRecommend(row: QuickShelveSkuRow): { actual: number; recommend: number } | null {
  const green = parsePriceNumber(row.price)
  // 黑标单独存 blackPrice；originalPrice 是划线原价，不能参与反推
  const black = parsePriceNumber(row.blackPrice || '')
  if (green <= 0 && black <= 0) return null
  const prefs = getCalcLocalPrefs()
  let actual = 0
  try {
    actual = calculateOzonRealPrice(green, black, { coeff: prefs.realPriceCoeff })
  } catch {
    return null
  }
  if (actual <= 0) return null
  const recommend = Math.round(actual * (prefs.recommendRatePct / 100) * 100) / 100
  return { actual, recommend }
}

function shouldShowDerived(row: QuickShelveSkuRow, ctx?: PriceQuadContext): boolean {
  if (!computeActualRecommend(row)) return false
  if (row.pricePairSource === 'api') return true
  if (
    ctx?.currentDetailSku &&
    String(row.sku) === String(ctx.currentDetailSku)
  ) {
    return true
  }
  return false
}

/** 四宫格价格展示数据 */
export function computeRowPriceQuad(
  row: QuickShelveSkuRow,
  ctx?: PriceQuadContext,
): PriceQuadResult {
  const unit = resolveRowPriceUnit(row)
  const now = formatDisplayPrice(row.price)
  const original = formatDisplayPrice(row.originalPrice)
  const showDerived = shouldShowDerived(row, ctx)

  if (!showDerived) {
    return { now, original, actual: '--', recommend: '--', showDerived: false, unit }
  }

  const derived = computeActualRecommend(row)!
  return {
    now,
    original,
    actual: formatAmountDisplay(derived.actual),
    recommend: formatAmountDisplay(derived.recommend),
    showDerived: true,
    unit,
  }
}

/** 按价格选择项解析行内基准价文案（供跟卖币种换算） */
export function resolveRowSourcePriceText(
  row: QuickShelveSkuRow,
  source: QuickShelvePriceSource,
): string {
  switch (source) {
    case 'now':
      return row.price || ''
    case 'original':
      return row.originalPrice || ''
    case 'actual':
    case 'recommend': {
      const derived = computeActualRecommend(row)
      if (!derived) return ''
      const refText = row.price || row.blackPrice || row.originalPrice
      if (source === 'actual') return formatPriceWithUnit(derived.actual, refText)
      return formatPriceWithUnit(derived.recommend, refText)
    }
    default:
      return row.price || ''
  }
}

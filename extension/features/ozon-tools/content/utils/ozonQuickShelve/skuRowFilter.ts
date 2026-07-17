import { parseOzonPriceNumber } from '../ozonBatchCrawl/exportPriceUtils'
import type { QuickShelveSkuRow } from './types'

export interface SkuRowFilter {
  priceMin: string
  priceMax: string
  salesMin: string
  salesMax: string
  dateMin: string
  dateMax: string
}

function parseNumberInput(text: string): number | null {
  if (!text || !text.trim()) return null
  const n = parseFloat(text)
  return Number.isFinite(n) ? n : null
}

export function parseRowPriceRub(priceText: string): number | null {
  if (!priceText || priceText === '--') return null
  const n = parseOzonPriceNumber(priceText)
  return Number.isFinite(n) ? n : null
}

/** 销量数字解析：取文本中第一段数字（兼容"已售 X 件"/"X 件"/纯数字） */
export function parseRowSalesNumber(text: string): number | null {
  if (!text) return null
  const m = String(text).match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 日期数字（YYYY.MM.DD / YYYY-MM-DD → YYYYMMDD 整数），便于区间比较 */
export function parseRowCreatedAtNumber(text?: string): number | null {
  if (!text) return null
  const m = String(text).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return y * 10000 + mo * 100 + d
}

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  if (value === null) return false
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

function dateInputToNumber(text: string): number | null {
  if (!text || !text.trim()) return null
  return parseRowCreatedAtNumber(text)
}

/** 三组筛选条件 → 返回符合条件的 SKU 集合（用于隐藏不符合行，对齐旧版 bcsFilterSourceSkusByInputs） */
export function computeVisibleSkus(rows: QuickShelveSkuRow[], filter: SkuRowFilter): Set<string> {
  const priceMin = parseNumberInput(filter.priceMin)
  const priceMax = parseNumberInput(filter.priceMax)
  const salesMin = parseNumberInput(filter.salesMin)
  const salesMax = parseNumberInput(filter.salesMax)
  const dateMin = dateInputToNumber(filter.dateMin)
  const dateMax = dateInputToNumber(filter.dateMax)

  const noFilter =
    priceMin === null &&
    priceMax === null &&
    salesMin === null &&
    salesMax === null &&
    dateMin === null &&
    dateMax === null
  if (noFilter) return new Set(rows.map((r) => r.sku))

  const visible = new Set<string>()
  rows.forEach((row) => {
    const priceOk = inRange(parseRowPriceRub(row.price), priceMin, priceMax)
    if (!priceOk) return
    const salesOk = inRange(parseRowSalesNumber(row.sales), salesMin, salesMax)
    if (!salesOk) return
    const dateOk = inRange(parseRowCreatedAtNumber(row.createdAt), dateMin, dateMax)
    if (!dateOk) return
    visible.add(row.sku)
  })
  return visible
}

/** 校验 min/max 合法性 */
export function validateFilterRanges(filter: SkuRowFilter): string | null {
  const pMin = parseNumberInput(filter.priceMin)
  const pMax = parseNumberInput(filter.priceMax)
  if (pMin !== null && pMax !== null && pMin > pMax) return '现价最小值不能大于最大值'
  const sMin = parseNumberInput(filter.salesMin)
  const sMax = parseNumberInput(filter.salesMax)
  if (sMin !== null && sMax !== null && sMin > sMax) return '销量最小值不能大于最大值'
  const dMin = dateInputToNumber(filter.dateMin)
  const dMax = dateInputToNumber(filter.dateMax)
  if (dMin !== null && dMax !== null && dMin > dMax) return '时间起始不能晚于结束'
  return null
}

import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'

// 默认汇率：对齐旧版 config.js（AppConfig.lbRMB / myRMB）。
// 避免在汇率字典未拉取前，priceTextToCnyNumber 返回 null 导致选品规则的价格范围匹配全部失效。
let rubToCny = 0.0919
let usdToCny = 7.1874

/** 拉取汇率字典（卢布/美元 → 人民币），失败时保留上次缓存 */
export async function ensureExchangeRates(): Promise<void> {
  try {
    const res = await apiService.request<{ code: number; data?: Array<{ dictLabel?: string; dictValue?: string }> }>(
      '/system/dict/data/type/exchange_rate',
      { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
    )
    const list = res?.data || []
    for (const item of list) {
      const label = String(item.dictLabel || '').toLowerCase()
      const val = parseFloat(String(item.dictValue || ''))
      if (!Number.isFinite(val)) continue
      if (label.includes('卢布') || label.includes('rub')) rubToCny = val
      if (label.includes('美元') || label.includes('usd')) usdToCny = val
    }
  } catch (e) {
    console.warn('[mjgd][crawl] 汇率加载失败', e)
  }
}

export function extractPriceUnit(text: string): string {
  if (text.includes('₽')) return '₽'
  if (text.includes('$')) return '$'
  if (text.includes('¥') || text.includes('￥')) return '¥'
  return ''
}

export function parseOzonPriceNumber(text: string): number {
  const raw = String(text || '').replace(/\s+/g, '')
  if (!raw) return NaN
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) return NaN
  const normalized = cleaned.includes(',') && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : NaN
}

export function formatExportPriceCell(text: string): string {
  const n = parseOzonPriceNumber(text)
  if (!Number.isFinite(n) || n < 0) return ''
  return n.toFixed(2)
}

/** 按币种将展示价换算为人民币 */
export function exportPriceToCnyText(priceText: string): string {
  const num = parseOzonPriceNumber(priceText)
  if (!Number.isFinite(num) || num < 0) return ''
  const unit = extractPriceUnit(priceText)
  if (unit === '¥' || unit === '￥') return num.toFixed(2)
  if (unit === '$') {
    if (!usdToCny) return ''
    return (num * usdToCny).toFixed(2)
  }
  if (!rubToCny) return ''
  return (num * rubToCny).toFixed(2)
}

export function exportListingFormatCell(sku: string, priceText: string): string {
  const cny = exportPriceToCnyText(priceText)
  return cny ? `${sku},${cny}` : `${sku},`
}

export function priceUnitDisplayName(text: string): string {
  const sym = extractPriceUnit(text)
  const map: Record<string, string> = { '₽': '卢布', $: '美元', '¥': '人民币', '￥': '人民币' }
  return map[sym] || sym
}

export function getRubToCnyRate(): number {
  return rubToCny
}

export function getUsdToCnyRate(): number {
  return usdToCny
}

/** 列表价文案 → 人民币数值（需先 ensureExchangeRates） */
export function priceTextToCnyNumber(text: string): number | null {
  const raw = exportPriceToCnyText(text)
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

/** 列表价文案 → 卢布数值（佣金分档用） */
export function priceTextToRubNumber(text: string): number | null {
  const num = parseOzonPriceNumber(text)
  if (!Number.isFinite(num) || num < 0) return null
  const unit = extractPriceUnit(text)
  if (unit === '₽') return num
  if (unit === '¥' || unit === '￥') {
    if (!rubToCny) return null
    return num / rubToCny
  }
  if (unit === '$') {
    if (!usdToCny || !rubToCny) return null
    return (num * usdToCny) / rubToCny
  }
  return num
}

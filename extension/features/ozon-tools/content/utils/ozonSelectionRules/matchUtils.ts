import type { OzonSkuCardData } from '../ozonList/types'
import {
  getRubToCnyRate,
  getUsdToCnyRate,
  priceTextToCnyNumber,
  priceTextToRubNumber,
} from '../ozonBatchCrawl/exportPriceUtils'

export function parseNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(String(v).replace(/%/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function parseMonthlySalesNum(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0
  const n = parseNum(v)
  return n !== null ? n : 0
}

export function parseSalesDynamicsNum(salesDynamics: unknown): number | null {
  if (salesDynamics === undefined || salesDynamics === null || String(salesDynamics).trim() === '') {
    return null
  }
  const m = String(salesDynamics).trim().match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return null
  return parseFloat(m[0].replace(',', '.'))
}

export function getListingDays(isoString?: string): number | null {
  if (!isoString) return null
  const start = new Date(isoString)
  if (Number.isNaN(start.getTime())) return null
  const ms = Date.now() - start.getTime()
  if (ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/** 品牌未就绪：仅「加载中」占位（数据对象一般不会出现，DOM 占位不参与匹配，此处仅作防御）。
 *  未就绪既不算有品牌、也不算无品牌，有品牌/无品牌规则都不应命中。 */
export function isBrandUnsettled(brand?: string): boolean {
  return String(brand ?? '').includes('加载')
}

/** 无品牌：空 / null / '无品牌' / '--' / '-' 等「确无品牌」形态（不含加载中未就绪） */
export function isNoBrand(brand?: string): boolean {
  const s = String(brand ?? '').trim()
  if (isBrandUnsettled(s)) return false
  return s === '' || s === '无品牌' || s === '--' || s === '-'
}

/** 有品牌：非空、非未就绪、且非无品牌的真实品牌值 */
export function hasBrandValue(brand?: string): boolean {
  const s = String(brand ?? '').trim()
  if (!s || isBrandUnsettled(s)) return false
  return !isNoBrand(s)
}

export function rangeBounds(
  f: Record<string, string>,
  minKey: string,
  maxKey: string,
): { min: number | null; max: number | null; active: boolean } {
  const min = parseNum(f[minKey])
  const max = parseNum(f[maxKey])
  return { min, max, active: min !== null || max !== null }
}

export function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

export function commissionActiveTierFromPriceRub(priceRub: number | null): number {
  if (priceRub === null || !Number.isFinite(priceRub) || priceRub < 0) return -1
  if (priceRub <= 1500) return 0
  if (priceRub <= 5000) return 1
  return 2
}

export function getActiveCommissionPercent(
  comm: OzonSkuCardData['commission'] | undefined,
  kind: 'fbs' | 'fbp',
  priceRub: number | null,
): number | null {
  const tier = commissionActiveTierFromPriceRub(priceRub)
  if (tier < 0 || !comm) return null
  const fbsKeys = ['rfbs1500', 'rfbs1500To5000', 'rfbsGreater5000'] as const
  const fbpKeys = ['fbp1500', 'fbp1500To5000', 'fbpGreater5000'] as const
  const keys = kind === 'fbp' ? fbpKeys : fbsKeys
  return parseNum(comm[keys[tier]])
}

function nativeAmountToCny(amount: number | null, unit: string): number | null {
  if (amount === null || !Number.isFinite(amount)) return null
  const u = String(unit || '₽').trim()
  if (u === '¥' || u === '￥') return amount
  if (u === '$') {
    const r = getUsdToCnyRate()
    return r ? amount * r : null
  }
  const r = getRubToCnyRate()
  return r ? amount * r : null
}

export function getMonthlyRevenueCny(data: OzonSkuCardData): number | null {
  const rub = parseNum(data.gmvSum)
  return nativeAmountToCny(rub, '₽')
}

export function getAvgPriceCny(data: OzonSkuCardData): number | null {
  const n = parseNum(data.avgprice)
  if (n === null) return null
  return nativeAmountToCny(n, '₽')
}

/** 展示文案「≈￥/≈¥」后的人民币近似值（支持"万"），与卡片 ≈￥ 展示口径一致 */
function parseCnyApproxFromDisplay(text: string): number | null {
  const i = text.indexOf('≈')
  if (i < 0) return null
  const part = text.slice(i)
  if (!/[¥￥]/.test(part)) return null
  const m = part.match(/[¥￥]\s*(\d+(?:[.,]\d+)?)(万)?/)
  if (!m) return null
  let n = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (m[2] === '万') n *= 10000
  return n
}

/** 跟卖价原值主体（≈ 前半段）→ 数值，支持"万" */
function parseFollowNativeAmount(text: string): number {
  let s = text
  const i = s.indexOf('≈')
  if (i >= 0) s = s.slice(0, i)
  s = s.replace(/[\s,]/g, '')
  const wanM = s.match(/(\d+(?:\.\d+)?)\s*万/)
  if (wanM) {
    const n = parseFloat(wanM[1])
    return Number.isFinite(n) ? n * 10000 : NaN
  }
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/** 跟卖价原值主体币种符号（展示已本地化为 ₽/$/¥） */
function detectFollowUnit(text: string): string {
  if (/[¥￥]/.test(text)) return '¥'
  if (/\$/.test(text)) return '$'
  return '₽'
}

/**
 * 跟卖最低/最高价展示文案 → 人民币（对齐旧版 cardPriceDisplayToCny）：
 * 优先直接读展示里的 ≈￥ 近似值（与卡片一致、天然支持"万"与多币种）；
 * 无 ≈ 时说明本身即人民币（¥ 商城），按原值主体解析。
 */
function followPriceDisplayToCny(text: string | null | undefined): number | null {
  if (!text || text === '--' || text.indexOf('加载') !== -1) return null
  const approx = parseCnyApproxFromDisplay(text)
  if (approx !== null) return approx
  const mainPart = text.indexOf('≈') >= 0 ? text.slice(0, text.indexOf('≈')) : text
  const amount = parseFollowNativeAmount(mainPart)
  if (!Number.isFinite(amount)) return null
  return nativeAmountToCny(amount, detectFollowUnit(mainPart))
}

export function getFollowMinPriceCny(data: OzonSkuCardData, card?: HTMLElement | null): number | null {
  const cny = followPriceDisplayToCny(
    card?.querySelector('.mjgd_ozon_field_price_min')?.textContent?.trim(),
  )
  if (cny !== null) return cny
  const amount = parseNum(data.priceMin)
  if (amount === null) return null
  return nativeAmountToCny(amount, '₽')
}

export function getFollowMaxPriceCny(data: OzonSkuCardData, card?: HTMLElement | null): number | null {
  const cny = followPriceDisplayToCny(
    card?.querySelector('.mjgd_ozon_field_price_max')?.textContent?.trim(),
  )
  if (cny !== null) return cny
  const amount = parseNum(data.priceMax)
  if (amount === null) return null
  return nativeAmountToCny(amount, '₽')
}

/**
 * 跟卖卖家数：优先读卡片 DOM 的 .mjgd_ozon_field_gnumber（由 applyFollowFieldsToCard 保证最新），
 * 与接口返回顺序无关。不能只读 goods data.gnumber——列表流程里 loadCardFollowData 与
 * setCardGoodsData 并发，跟卖接口先返回时写入会被后到的 setCardGoodsData 覆盖，
 * 导致 gnumber 恒为 undefined 被 skipIfNull 静默跳过，范围规则对所有卡片都命中。
 * 导出/无卡片场景（ctx.card 为空）回退到 data.gnumber（exportMatch 会填）。
 */
export function getFollowSellersValue(data: OzonSkuCardData, card?: HTMLElement | null): number | null {
  const fromDom = parseNum(card?.querySelector('.mjgd_ozon_field_gnumber')?.textContent)
  if (fromDom !== null) return fromDom
  return parseNum(data.gnumber)
}

export function getPriceRubFromContext(priceText?: string): number | null {
  if (!priceText) return null
  return priceTextToRubNumber(priceText)
}

export function getPriceCnyFromContext(priceText?: string): number | null {
  if (!priceText) return null
  return priceTextToCnyNumber(priceText)
}

export function matchShipModeFilter(filterVal: string, dataSources?: string): boolean {
  const mode = filterVal || 'any'
  if (mode === 'any') return true
  const src = String(dataSources ?? '').trim()
  if (!src || src === '--' || src === '-') return false
  return src.toUpperCase().includes(String(mode).toUpperCase())
}

export function normalizeTagBg(color?: string): string {
  const s = String(color || '').trim()
  if (!s || s === 'transparent' || s === 'none') return ''
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s
  if (/^rgb/i.test(s)) return s
  return ''
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null
  let h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

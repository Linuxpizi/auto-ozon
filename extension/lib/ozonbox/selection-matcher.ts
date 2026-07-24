import type { OzonboxCollectedProduct } from './contract'
import type { PanelSelectionConditions, PanelSelectionRule } from './panel-tools-contract'
import { normalizeAnalyticsItem, type OzonboxAnalyticsItem } from './seller-analytics'

export interface OzonSellerOffersFacts {
  sellerCount?: number
  hasExplicitNoSellers: boolean
  minimumPriceFollowRub?: number
  maximumPriceFollowRub?: number
}

/** Unit-explicit, browser-independent facts consumed by selection rules. */
export interface OzonSelectionCandidate {
  brand?: string
  soldCount?: number
  soldSumCny?: number
  priceCny?: number
  weightG?: number
  listedDays?: number
  salesDynamics?: number
  drr?: number
  daysInPromo?: number
  discount?: number
  promoRevenueShare?: number
  daysWithTrafarets?: number
  qtyViewPdp?: number
  convToCartPdp?: number
  sessionCountSearch?: number
  convToCartSearch?: number
  convViewToOrder?: number
  salesSchema?: string
  cancelRate?: number
  sellerCount?: number
  hasExplicitNoSellers: boolean
  /** Ozon other-seller offer price. Intentionally remains RUB. */
  minimumPriceFollowRub?: number
}

export interface BuildOzonSelectionCandidateInput {
  product: OzonboxCollectedProduct
  analytics?: OzonboxAnalyticsItem | null
  /** Number of CNY represented by one RUB. */
  rubToCny?: number
  sellerOffers?: OzonSellerOffersFacts | null
  now?: Date
}

const UNBRANDED_MARKERS = new Set(['--', '暂无数据', '无', '无品牌', 'без бренда'])

const ANALYTICS_ALIASES = {
  soldCount: ['sumOrders', 'orders', 'sum_orders', 'sales', 'soldCount'],
  soldSumRub: ['sumGmv', 'gmv', 'sum_gmv', 'sumGmvRub', 'soldSum'],
  salesDynamics: ['gmvGrowthRate', 'salesGrowth', 'growthRate', 'salesDynamics'],
  drr: ['drr', 'adsShare', 'ads_share', 'adShare', 'ad_share', 'adsRevenueShare'],
  daysInPromo: ['daysInPromo', 'promoDays', 'promo_days'],
  discount: ['discount', 'promoDiscount', 'discountPercent'],
  promoRevenueShare: ['promoConversionRate', 'promoConvRate', 'promoRate'],
  daysWithTrafarets: ['daysWithTrafarets', 'paidPromoDays', 'trafaretDays'],
  qtyViewPdp: ['qtyViewPdp', 'hits_view_pdp', 'pdpViews', 'pdpViewCount'],
  convToCartPdp: ['cardCartConversionRate', 'cardCartRate', 'pdpToCartConversion', 'conv_tocart_pdp'],
  sessionCountSearch: ['searchImpressions', 'qtySearchImpressions', 'sessionCountSearch', 'hits_view_search'],
  convToCartSearch: ['searchCartConversionRate', 'searchCartRate', 'convToCartSearch', 'conv_tocart_search'],
  convViewToOrder: ['orderConversionRate', 'conversionRate', 'convViewToOrder', 'conversion'],
  salesSchema: ['sellSchema', 'saleSchema', 'sellModel', 'salesSchema'],
  cancelRate: ['returnCancelRate', 'cancellationRate', 'returnsRate', 'cancelRate'],
  listedDays: ['daysInStock', 'days_in_stock', 'stockDays'],
  listedDate: ['createDate', 'createdAt', 'dateInStock', 'nullableCreateDate'],
  brand: ['brand', 'brandName'],
} as const

type NumericCandidateKey = Exclude<keyof OzonSelectionCandidate,
  'brand' | 'salesSchema' | 'hasExplicitNoSellers'>

const NUMERIC_RANGES: Array<{
  candidate: NumericCandidateKey
  min: keyof PanelSelectionConditions
  max: keyof PanelSelectionConditions
}> = [
  { candidate: 'soldCount', min: 'soldCountMin', max: 'soldCountMax' },
  { candidate: 'soldSumCny', min: 'soldSumMin', max: 'soldSumMax' },
  { candidate: 'priceCny', min: 'priceMin', max: 'priceMax' },
  { candidate: 'weightG', min: 'weightMin', max: 'weightMax' },
  { candidate: 'listedDays', min: 'listedDaysMin', max: 'listedDaysMax' },
  { candidate: 'salesDynamics', min: 'salesDynamicsMin', max: 'salesDynamicsMax' },
  { candidate: 'drr', min: 'drrMin', max: 'drrMax' },
  { candidate: 'daysInPromo', min: 'daysInPromoMin', max: 'daysInPromoMax' },
  { candidate: 'discount', min: 'discountMin', max: 'discountMax' },
  { candidate: 'promoRevenueShare', min: 'promoRevenueShareMin', max: 'promoRevenueShareMax' },
  { candidate: 'daysWithTrafarets', min: 'daysWithTrafaretsMin', max: 'daysWithTrafaretsMax' },
  { candidate: 'qtyViewPdp', min: 'qtyViewPdpMin', max: 'qtyViewPdpMax' },
  { candidate: 'convToCartPdp', min: 'convToCartPdpMin', max: 'convToCartPdpMax' },
  { candidate: 'sessionCountSearch', min: 'sessionCountSearchMin', max: 'sessionCountSearchMax' },
  { candidate: 'convToCartSearch', min: 'convToCartSearchMin', max: 'convToCartSearchMax' },
  { candidate: 'convViewToOrder', min: 'convViewToOrderMin', max: 'convViewToOrderMax' },
  { candidate: 'cancelRate', min: 'cancelRateMin', max: 'cancelRateMax' },
  { candidate: 'minimumPriceFollowRub', min: 'minimumPriceFollowMin', max: 'minimumPriceFollowMax' },
]

/** Parse one factual metric without coercing null, blank, booleans, or invalid text to zero. */
export function finiteMetric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, '')
  if (!normalized) return undefined
  const token = normalized.match(/[-+]?\d[\d.,]*/)?.[0]
  if (!token) return undefined

  const lastComma = token.lastIndexOf(',')
  const lastDot = token.lastIndexOf('.')
  let numeric = token
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot)
    numeric = `${token.slice(0, decimalIndex).replace(/[.,]/g, '')}.${token.slice(decimalIndex + 1)}`
  } else if (lastComma >= 0) {
    numeric = token.replace(/,/g, token.length - lastComma - 1 === 3 ? '' : '.')
  } else if (lastDot >= 0 && token.length - lastDot - 1 === 3) {
    numeric = token.replace(/\./g, '')
  }
  const parsed = Number(numeric)
  return Number.isFinite(parsed) ? parsed : undefined
}

function firstMetric(item: OzonboxAnalyticsItem, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const parsed = finiteMetric(item[key])
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function firstText(item: OzonboxAnalyticsItem, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function positiveRate(value: unknown): number | undefined {
  const parsed = finiteMetric(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function elapsedFullDays(value: unknown, now: Date): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return undefined
  const timestamp = new Date(value).getTime()
  const nowTimestamp = now.getTime()
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowTimestamp) || timestamp > nowTimestamp) return undefined
  return Math.floor((nowTimestamp - timestamp) / 86_400_000)
}

function listedDays(item: OzonboxAnalyticsItem, now: Date): number | undefined {
  const explicit = firstMetric(item, ANALYTICS_ALIASES.listedDays)
  if (explicit !== undefined && explicit >= 0) return explicit
  for (const key of ANALYTICS_ALIASES.listedDate) {
    const derived = elapsedFullDays(item[key], now)
    if (derived !== undefined) return derived
  }
  return undefined
}

function factualBrand(product: OzonboxCollectedProduct, analytics: OzonboxAnalyticsItem): string | undefined {
  if (typeof product.brand === 'string' && product.brand.trim()) return product.brand.trim()
  return firstText(analytics, ANALYTICS_ALIASES.brand)
}

function factualWeightG(product: OzonboxCollectedProduct, analytics: OzonboxAnalyticsItem): number | undefined {
  const analyticsWeight = finiteMetric(analytics.weight_g)
  if (analyticsWeight !== undefined && analyticsWeight >= 0) return analyticsWeight
  const productWeight = finiteMetric(product.ozonMetrics?.weightG)
  if (productWeight !== undefined && productWeight >= 0) return productWeight
  const packageWeight = finiteMetric(product.ozonMetrics?.packageWeightG)
  return packageWeight !== undefined && packageWeight >= 0 ? packageWeight : undefined
}

export function buildOzonSelectionCandidate({
  product,
  analytics,
  rubToCny,
  sellerOffers,
  now = new Date(),
}: BuildOzonSelectionCandidateInput): OzonSelectionCandidate {
  const item = analytics ? normalizeAnalyticsItem(analytics) : {}
  const rate = positiveRate(rubToCny)
  const priceRub = finiteMetric(product.price)
  const soldSumRub = firstMetric(item, ANALYTICS_ALIASES.soldSumRub)
  const sellerCount = finiteMetric(sellerOffers?.sellerCount)
  const minimumPriceFollowRub = finiteMetric(sellerOffers?.minimumPriceFollowRub)

  return {
    brand: factualBrand(product, item),
    soldCount: firstMetric(item, ANALYTICS_ALIASES.soldCount),
    soldSumCny: rate !== undefined && soldSumRub !== undefined ? soldSumRub * rate : undefined,
    priceCny: rate !== undefined && priceRub !== undefined ? priceRub * rate : undefined,
    weightG: factualWeightG(product, item),
    listedDays: listedDays(item, now),
    salesDynamics: firstMetric(item, ANALYTICS_ALIASES.salesDynamics),
    drr: firstMetric(item, ANALYTICS_ALIASES.drr),
    daysInPromo: firstMetric(item, ANALYTICS_ALIASES.daysInPromo),
    discount: firstMetric(item, ANALYTICS_ALIASES.discount),
    promoRevenueShare: firstMetric(item, ANALYTICS_ALIASES.promoRevenueShare),
    daysWithTrafarets: firstMetric(item, ANALYTICS_ALIASES.daysWithTrafarets),
    qtyViewPdp: firstMetric(item, ANALYTICS_ALIASES.qtyViewPdp),
    convToCartPdp: firstMetric(item, ANALYTICS_ALIASES.convToCartPdp),
    sessionCountSearch: firstMetric(item, ANALYTICS_ALIASES.sessionCountSearch),
    convToCartSearch: firstMetric(item, ANALYTICS_ALIASES.convToCartSearch),
    convViewToOrder: firstMetric(item, ANALYTICS_ALIASES.convViewToOrder),
    salesSchema: firstText(item, ANALYTICS_ALIASES.salesSchema),
    cancelRate: firstMetric(item, ANALYTICS_ALIASES.cancelRate),
    sellerCount: sellerCount !== undefined && sellerCount >= 0 ? sellerCount : undefined,
    hasExplicitNoSellers: sellerOffers?.hasExplicitNoSellers === true,
    minimumPriceFollowRub: minimumPriceFollowRub !== undefined && minimumPriceFollowRub >= 0
      ? minimumPriceFollowRub
      : undefined,
  }
}

export function isRecognizedBrand(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLocaleLowerCase()
  return Boolean(normalized) && !UNBRANDED_MARKERS.has(normalized)
}

function configuredNumber(conditions: PanelSelectionConditions, key: keyof PanelSelectionConditions): number | undefined {
  const value = conditions[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function matchesRange(
  value: number | undefined,
  conditions: PanelSelectionConditions,
  minKey: keyof PanelSelectionConditions,
  maxKey: keyof PanelSelectionConditions,
): boolean {
  const hasMin = conditions[minKey] !== undefined
  const hasMax = conditions[maxKey] !== undefined
  if (!hasMin && !hasMax) return true
  const min = configuredNumber(conditions, minKey)
  const max = configuredNumber(conditions, maxKey)
  if ((hasMin && min === undefined) || (hasMax && max === undefined)) return false
  if (value === undefined || !Number.isFinite(value)) return false
  return (min === undefined || value >= min) && (max === undefined || value <= max)
}

function matchesSellerCount(candidate: OzonSelectionCandidate, conditions: PanelSelectionConditions): boolean {
  const min = configuredNumber(conditions, 'sellerCountMin')
  const max = configuredNumber(conditions, 'sellerCountMax')
  if (conditions.sellerCountMin === 0 && conditions.sellerCountMax === 0) {
    return candidate.hasExplicitNoSellers
  }
  return matchesRange(candidate.sellerCount, conditions, 'sellerCountMin', 'sellerCountMax')
    && !(conditions.sellerCountMin !== undefined && min === undefined)
    && !(conditions.sellerCountMax !== undefined && max === undefined)
}

export function matchesSelectionRule(candidate: OzonSelectionCandidate, rule: PanelSelectionRule): boolean {
  if (!rule.enabled) return false
  const { conditions } = rule
  const branded = isRecognizedBrand(candidate.brand)
  if (conditions.brandOption === 1 && !branded) return false
  if (conditions.brandOption === 0 && branded) return false

  for (const range of NUMERIC_RANGES) {
    if (!matchesRange(candidate[range.candidate], conditions, range.min, range.max)) return false
  }
  if (!matchesSellerCount(candidate, conditions)) return false

  const targetSchema = conditions.salesSchema?.trim().toUpperCase()
  const actualSchema = candidate.salesSchema?.trim().toUpperCase()
  // Preserve reference behavior: absence of the actual schema does not reject.
  if (targetSchema && actualSchema && !actualSchema.includes(targetSchema)) return false
  return true
}

/** AND within each rule, OR across enabled rules; return every deterministic match. */
export function matchSelectionRules(
  candidate: OzonSelectionCandidate,
  rules: readonly PanelSelectionRule[],
): PanelSelectionRule[] {
  return rules
    .filter(rule => rule.enabled)
    .sort((left, right) => left.sort - right.sort || left.id - right.id)
    .filter(rule => matchesSelectionRule(candidate, rule))
}
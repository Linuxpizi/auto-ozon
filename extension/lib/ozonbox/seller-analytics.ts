import {
  isRecord,
  type OzonboxCollectedProduct,
  type OzonboxRuntimeMessage,
  type OzonboxPackageShopFacts,
  type OzonboxSellerApiResponse,
} from './contract'
import { requireOzonCompanyId } from './seller-session'

export type OzonboxAnalyticsItem = Record<string, unknown>

const ANALYTICS_BLOCK_KEYS = ['metrics', 'summary', 'stat', 'stats', 'analytics', 'values'] as const

const NORMALIZED_DIMENSION_KEYS = ['dimension_mm'] as const

const NORMALIZED_WEIGHT_KEYS = ['weight_g'] as const

const CATEGORY_PATH_KEYS = [
  'categoryPath',
  'category_path',
  'categoryBreadcrumbs',
  'category_breadcrumbs',
  'categoryTree',
  'category_tree',
] as const

const CATEGORY_NAME_KEYS = [
  'categoryName',
  'category_name',
  'categoryTitle',
  'category_title',
  'category3',
  'category_3',
  'category',
] as const

const PACKAGING_ATTRIBUTE_KEYS = {
  length: '9454',
  width: '9455',
  height: '9456',
  weight: '4497',
} as const

function requirePositiveIntegerString(value: string, field: string): string {
  const normalized = value.trim()
  if (!/^[1-9]\d*$/.test(normalized)) throw new Error(`${field} 必须是正整数`)
  return normalized
}

function apiErrorMessage(data: unknown): string | undefined {
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (!isRecord(data)) return undefined
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim()
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim()
  if (isRecord(data.error) && typeof data.error.message === 'string' && data.error.message.trim()) {
    return data.error.message.trim()
  }
  if (isRecord(data.result) && typeof data.result.message === 'string' && data.result.message.trim()) {
    return data.result.message.trim()
  }
  return undefined
}

async function send(message: OzonboxRuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message)
}

function packageFactsFrom(value: unknown): OzonboxPackageShopFacts[] {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    throw new Error(value.error.trim())
  }
  if (!Array.isArray(value)) throw new Error('包裹参数响应格式无效')
  return value as OzonboxPackageShopFacts[]
}

function assertSellerApiResponse(value: unknown): OzonboxSellerApiResponse {
  if (!isRecord(value)) throw new Error('Ozon 卖家接口返回格式无效')
  if (typeof value.error === 'string' && value.error.trim()) throw new Error(value.error.trim())
  if (typeof value.ok !== 'boolean' || typeof value.status !== 'number' || !('data' in value)) {
    throw new Error('Ozon 卖家接口返回格式无效')
  }
  if (!value.ok) {
    const detail = apiErrorMessage(value.data)
    throw new Error(`Ozon 卖家接口请求失败（HTTP ${value.status}${detail ? `：${detail}` : ''}）`)
  }
  return value as unknown as OzonboxSellerApiResponse
}

function analyticsItemsFrom(data: unknown): unknown[] {
  if (!isRecord(data)) throw new Error('Ozon analytics 数据不是对象')
  if (Array.isArray(data.items)) return data.items
  if (isRecord(data.result) && Array.isArray(data.result.items)) return data.result.items
  return []
}

function positiveIntegerText(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  }
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return /^[1-9]\d*$/.test(normalized) ? normalized : undefined
}

/**
 * Seller analytics is queried with an exact SKU filter, but the response can
 * still contain several rows. Only an explicit numeric `sku`/`skuName` equal
 * to the requested SKU proves that a row belongs to this product.
 */
export function analyticsItemForExactSku(data: unknown, skuValue: string): OzonboxAnalyticsItem | null {
  const sku = requirePositiveIntegerString(skuValue, 'sku')
  for (const candidate of analyticsItemsFrom(data)) {
    if (!isRecord(candidate)) continue
    const candidateSku = positiveIntegerText(candidate.sku) ?? positiveIntegerText(candidate.skuName)
    if (candidateSku === sku) return candidate
  }
  return null
}

function analyticsBrand(item: OzonboxAnalyticsItem): string | undefined {
  const normalized = normalizeAnalyticsItem(item)
  for (const key of ['brand', 'brandName']) {
    const value = normalized[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function analyticsBrandForExactSku(data: unknown, skuValue: string): string | undefined {
  const item = analyticsItemForExactSku(data, skuValue)
  return item ? analyticsBrand(item) : undefined
}

export function collectedProductAnalyticsSku(
  product: Pick<OzonboxCollectedProduct, 'sku' | 'productId'>,
): string | undefined {
  // Analytics cards query by the numeric Ozon product ID extracted from the
  // PDP URL. Keep the same proven identity at the collection boundary.
  return positiveIntegerText(product.productId) ?? positiveIntegerText(product.sku)
}

/** Preserve a PDP-proven brand and only fill an empty brand from an exact-SKU row. */
export function mergeExactSkuAnalyticsBrand<T extends { brand?: string | null }>(
  product: T,
  data: unknown,
  skuValue: string,
): T {
  if (typeof product.brand === 'string' && product.brand.trim()) return product
  const brand = analyticsBrandForExactSku(data, skuValue)
  return brand ? { ...product, brand } : product
}

function hasFact(item: OzonboxAnalyticsItem, keys: readonly string[]): boolean {
  return keys.some((key) => item[key] !== undefined && item[key] !== null && item[key] !== '')
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/\s/g, '').match(/[\d,.]+/)
  if (!match) return null
  const parsed = Number(match[0].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function positiveContractNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return undefined
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function lengthUnit(value: unknown): 'mm' | 'cm' | 'm' | null {
  if (typeof value !== 'string') return null
  const unit = value.toLowerCase()
  if (unit === 'mm' || unit.includes('мм')) return 'mm'
  if (unit === 'cm' || unit.includes('см')) return 'cm'
  if (unit === 'm' || unit.includes('мет')) return 'm'
  return null
}

function detectedLengthUnit(value: unknown): 'mm' | 'cm' | 'm' | null {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase()
  if (normalized.includes('mm') || normalized.includes('мм')) return 'mm'
  if (normalized.includes('cm') || normalized.includes('см')) return 'cm'
  if (normalized.includes('meter') || /(^|\s)м($|\s)/i.test(normalized)) return 'm'
  return null
}

function weightUnit(value: unknown): 'g' | 'kg' | null {
  if (typeof value !== 'string') return null
  const unit = value.toLowerCase()
  if (unit === 'kg' || unit.includes('кг')) return 'kg'
  if (unit === 'g' || unit.includes('г')) return 'g'
  return null
}

function detectedWeightUnit(value: unknown): 'g' | 'kg' | null {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase()
  if (normalized.includes('kg') || normalized.includes('кг')) return 'kg'
  if (normalized.includes('гр') || normalized.includes('g') || normalized.includes('г')) return 'g'
  return null
}

function lengthInMm(value: unknown, unit: 'mm' | 'cm' | 'm' | null): number | null {
  const number = numberFrom(value)
  if (number === null || unit === null) return null
  if (unit === 'cm') return number * 10
  if (unit === 'm') return number * 1000
  return number
}

function weightInG(value: unknown, unit: 'g' | 'kg' | null): number | null {
  const number = numberFrom(value)
  if (number === null || unit === null) return null
  return unit === 'kg' ? number * 1000 : number
}

function packagingAttributeValue(item: OzonboxAnalyticsItem, attributeKey: string): unknown {
  for (const collectionKey of ['attributes', 'attrs']) {
    const entries = item[collectionKey]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (isRecord(entry) && String(entry.key) === attributeKey) return entry.value
    }
  }
  return undefined
}

function firstFact(item: OzonboxAnalyticsItem, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = item[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function categoryText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim() || undefined
  if (Array.isArray(value)) {
    const parts = value.map(categoryText).filter((part): part is string => Boolean(part))
    return parts.length ? Array.from(new Set(parts)).join(' > ') : undefined
  }
  if (!isRecord(value)) return undefined
  for (const key of CATEGORY_PATH_KEYS) {
    const path = categoryText(value[key])
    if (path) return path
  }
  const levels = [
    categoryText(value.category1 ?? value.category_1),
    categoryText(value.category2 ?? value.category_2),
    categoryText(value.category3 ?? value.category_3),
  ].filter((part): part is string => Boolean(part))
  if (levels.length) return Array.from(new Set(levels)).join(' > ')
  for (const key of ['name', 'title', 'label', 'value']) {
    const name = categoryText(value[key])
    if (name) return name
  }
  return undefined
}

export function analyticsCategoryName(item: OzonboxAnalyticsItem): string | undefined {
  for (const key of CATEGORY_PATH_KEYS) {
    const path = categoryText(item[key])
    if (path) return path
  }
  const levels = [
    categoryText(item.category1 ?? item.category_1),
    categoryText(item.category2 ?? item.category_2),
    categoryText(item.category3 ?? item.category_3),
  ].filter((part): part is string => Boolean(part))
  if (levels.length) return Array.from(new Set(levels)).join(' > ')
  for (const key of CATEGORY_NAME_KEYS) {
    const name = categoryText(item[key])
    if (name) return name
  }
  return undefined
}

function dimensionRecordInMm(
  value: unknown,
  sharedUnit: 'mm' | 'cm' | 'm' | null,
): OzonboxAnalyticsItem['dimension_mm'] {
  if (!isRecord(value)) return undefined
  const length = value.length ?? value.l ?? value.L
  const width = value.width ?? value.w ?? value.W
  const height = value.height ?? value.h ?? value.H
  const recordUnit = lengthUnit(value.unit ?? value.dimension_unit ?? value.dimensionUnit) ?? sharedUnit
  const lengthMm = lengthInMm(length, recordUnit ?? detectedLengthUnit(length))
  const widthMm = lengthInMm(width, recordUnit ?? detectedLengthUnit(width))
  const heightMm = lengthInMm(height, recordUnit ?? detectedLengthUnit(height))
  return lengthMm !== null && widthMm !== null && heightMm !== null
    ? { length: lengthMm, width: widthMm, height: heightMm }
    : undefined
}

function independentLengthInMm(
  item: OzonboxAnalyticsItem,
  genericKeys: readonly string[],
  millimeterKeys: readonly string[],
  sharedUnit: 'mm' | 'cm' | 'm' | null,
): number | null {
  for (const key of millimeterKeys) {
    const value = item[key]
    if (value !== undefined && value !== null && value !== '') return lengthInMm(value, 'mm')
  }
  const value = firstFact(item, genericKeys)
  return lengthInMm(value, sharedUnit ?? detectedLengthUnit(value))
}

function normalizedDimension(item: OzonboxAnalyticsItem): OzonboxAnalyticsItem['dimension_mm'] {
  for (const key of ['dimension_mm', 'dimensionMm']) {
    const dimension = dimensionRecordInMm(item[key], 'mm')
    if (dimension) return dimension
  }

  const packagingLength = packagingAttributeValue(item, PACKAGING_ATTRIBUTE_KEYS.length)
  const packagingWidth = packagingAttributeValue(item, PACKAGING_ATTRIBUTE_KEYS.width)
  const packagingHeight = packagingAttributeValue(item, PACKAGING_ATTRIBUTE_KEYS.height)
  if (packagingLength !== undefined || packagingWidth !== undefined || packagingHeight !== undefined) {
    const length = lengthInMm(packagingLength, 'mm')
    const width = lengthInMm(packagingWidth, 'mm')
    const height = lengthInMm(packagingHeight, 'mm')
    return length !== null && width !== null && height !== null ? { length, width, height } : undefined
  }

  const sharedUnit = lengthUnit(item.dimension_unit ?? item.dimensionUnit)
  for (const key of ['dimensions', 'dimension', 'size']) {
    const dimension = dimensionRecordInMm(item[key], sharedUnit)
    if (dimension) return dimension
  }

  const lengthMm = independentLengthInMm(
    item,
    ['depth', 'length', 'size_depth'],
    ['lengthMm', 'length_mm'],
    sharedUnit,
  )
  const widthMm = independentLengthInMm(
    item,
    ['width', 'size_width'],
    ['widthMm', 'width_mm'],
    sharedUnit,
  )
  const heightMm = independentLengthInMm(
    item,
    ['height', 'size_height'],
    ['heightMm', 'height_mm'],
    sharedUnit,
  )
  return lengthMm !== null && widthMm !== null && heightMm !== null
    ? { length: lengthMm, width: widthMm, height: heightMm }
    : undefined
}

function normalizedWeight(item: OzonboxAnalyticsItem): number | undefined {
  const packagingWeight = packagingAttributeValue(item, PACKAGING_ATTRIBUTE_KEYS.weight)
  if (packagingWeight !== undefined) return weightInG(packagingWeight, 'g') ?? undefined

  for (const key of ['weight_g', 'weightG', 'weightGrams', 'grossWeightG']) {
    const explicitGramValue = item[key]
    if (explicitGramValue === undefined || explicitGramValue === null || explicitGramValue === '') continue
    const weight = weightInG(explicitGramValue, 'g')
    if (weight !== null) return weight
  }

  const value = firstFact(item, ['weight', 'grossWeight'])
  const unit = weightUnit(item.weight_unit ?? item.weightUnit) ?? detectedWeightUnit(value)
  return weightInG(value, unit) ?? undefined
}

export function normalizeAnalyticsItem(item: OzonboxAnalyticsItem): OzonboxAnalyticsItem {
  const normalized = { ...item }
  for (const key of ANALYTICS_BLOCK_KEYS) {
    const block = item[key]
    if (isRecord(block)) Object.assign(normalized, block)
  }
  const categoryName = analyticsCategoryName(normalized)
  if (categoryName) normalized.categoryName = categoryName
  else delete normalized.categoryName
  const dimension = normalizedDimension(normalized)
  if (dimension) normalized.dimension_mm = dimension
  else delete normalized.dimension_mm
  const weight = normalizedWeight(normalized)
  if (weight !== undefined) normalized.weight_g = weight
  else delete normalized.weight_g
  return normalized
}

/**
 * Normalize the package measures returned by create-bundle-by-variant-id.
 * That endpoint's item contract uses millimetres for dimensions and grams for
 * weight, so no unit inference is needed or accepted here.
 */
export function normalizeSellerVariantPackage(data: unknown): OzonboxAnalyticsItem {
  if (!isRecord(data) || !isRecord(data.item)) return {}
  const depth = positiveContractNumber(data.item.depth)
  const width = positiveContractNumber(data.item.width)
  const height = positiveContractNumber(data.item.height)
  const weight = positiveContractNumber(data.item.weight)
  return {
    ...(depth !== undefined && width !== undefined && height !== undefined
      ? { dimension_mm: { length: depth, width, height } }
      : {}),
    ...(weight !== undefined ? { weight_g: weight } : {}),
  }
}

function mergeKnownMeasures(item: OzonboxAnalyticsItem, attributes: OzonboxAnalyticsItem): OzonboxAnalyticsItem {
  const merged = normalizeAnalyticsItem(item)
  const normalizedAttributes = normalizeAnalyticsItem(attributes)
  if (!hasFact(merged, NORMALIZED_DIMENSION_KEYS) && hasFact(normalizedAttributes, NORMALIZED_DIMENSION_KEYS)) {
    merged.dimension_mm = firstFact(normalizedAttributes, NORMALIZED_DIMENSION_KEYS)
  }
  if (!hasFact(merged, NORMALIZED_WEIGHT_KEYS) && hasFact(normalizedAttributes, NORMALIZED_WEIGHT_KEYS)) {
    merged.weight_g = firstFact(normalizedAttributes, NORMALIZED_WEIGHT_KEYS)
  }
  return merged
}

export async function readOzonSellerId(): Promise<string> {
  const response = await send({ type: 'OZONBOX_READ_SELLER_ID' })
  if (!isRecord(response)) throw new Error('读取 Ozon 卖家 ID 的响应格式无效')
  if (typeof response.error === 'string' && response.error.trim()) throw new Error(response.error.trim())
  if (typeof response.sellerId !== 'string') throw new Error('Ozon 卖家 ID 响应中缺少 sellerId')
  return requireOzonCompanyId(response.sellerId)
}

export async function fetchOzonAnalyticsItem(
  skuValue: string,
  shopIdValue: string,
): Promise<OzonboxAnalyticsItem | null> {
  const sku = requirePositiveIntegerString(skuValue, 'sku')
  const shopId = requireOzonCompanyId(shopIdValue)
  const analyticsResponse = assertSellerApiResponse(await send({
    type: 'OZONBOX_FETCH_SELLER_ANALYTICS',
    sku,
    shopId,
  }))
  const sourceItem = analyticsItemForExactSku(analyticsResponse.data, sku)
  if (!sourceItem) return null
  let item = normalizeAnalyticsItem(sourceItem)
  if (hasFact(item, NORMALIZED_DIMENSION_KEYS) && hasFact(item, NORMALIZED_WEIGHT_KEYS)) return item

  const variantId = positiveIntegerText(sourceItem.variantId) ?? positiveIntegerText(sourceItem.variant_id)
  if (variantId) {
    try {
      const variantResponse = assertSellerApiResponse(await send({
        type: 'OZONBOX_FETCH_SELLER_VARIANT_PACKAGE',
        variantId,
        shopId,
      }))
      item = mergeKnownMeasures(item, normalizeSellerVariantPackage(variantResponse.data))
      if (hasFact(item, NORMALIZED_DIMENSION_KEYS) && hasFact(item, NORMALIZED_WEIGHT_KEYS)) return item
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Seller 变体包裹参数读取失败'
      console.warn('Seller 变体包裹参数补充失败，继续读取已有包裹事实', error)
      item = { ...item, ozonboxSellerVariantPackageError: message }
    }
  }

  try {
    const shops = packageFactsFrom(await send({ type: 'OZONBOX_FETCH_PACKAGE_FACTS', sku }))
    const packageFacts = shops[0]
    if (!packageFacts) return item
    return mergeKnownMeasures(item, { attributes: packageFacts.attributes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '包裹参数读取失败'
    console.warn('包裹参数补充失败，保留已获取的 analytics 数据', error)
    return { ...item, ozonboxPackageFactsError: message }
  }
}
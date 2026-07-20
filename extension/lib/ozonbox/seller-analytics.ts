import {
  isRecord,
  type OzonboxRuntimeMessage,
  type OzonboxPackageShopFacts,
  type OzonboxSellerApiResponse,
} from './contract'

export type OzonboxAnalyticsItem = Record<string, unknown>

const ANALYTICS_BLOCK_KEYS = ['metrics', 'summary', 'stat', 'stats', 'analytics', 'values'] as const

const NORMALIZED_DIMENSION_KEYS = ['dimension_mm'] as const

const NORMALIZED_WEIGHT_KEYS = ['weight_g'] as const

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

function firstRecord(items: unknown, responseName: string): OzonboxAnalyticsItem | null {
  if (!Array.isArray(items) || items.length === 0) return null
  if (!isRecord(items[0])) throw new Error(`${responseName}首条数据不是对象`)
  return items[0]
}

function analyticsItemFrom(data: unknown): OzonboxAnalyticsItem | null {
  if (!isRecord(data)) throw new Error('Ozon analytics 数据不是对象')
  if (Array.isArray(data.items)) return firstRecord(data.items, 'Ozon analytics')
  if (isRecord(data.result) && Array.isArray(data.result.items)) {
    return firstRecord(data.result.items, 'Ozon analytics')
  }
  return null
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
  const dimension = normalizedDimension(normalized)
  if (dimension) normalized.dimension_mm = dimension
  else delete normalized.dimension_mm
  const weight = normalizedWeight(normalized)
  if (weight !== undefined) normalized.weight_g = weight
  else delete normalized.weight_g
  return normalized
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
  return requirePositiveIntegerString(response.sellerId, 'sellerId')
}

export async function fetchOzonAnalyticsItem(
  skuValue: string,
  shopIdValue: string,
): Promise<OzonboxAnalyticsItem | null> {
  const sku = requirePositiveIntegerString(skuValue, 'sku')
  const shopId = requirePositiveIntegerString(shopIdValue, 'shopId')
  const analyticsResponse = assertSellerApiResponse(await send({
    type: 'OZONBOX_FETCH_SELLER_ANALYTICS',
    sku,
    shopId,
  }))
  const sourceItem = analyticsItemFrom(analyticsResponse.data)
  if (!sourceItem) return null
  const item = normalizeAnalyticsItem(sourceItem)
  if (hasFact(item, NORMALIZED_DIMENSION_KEYS) && hasFact(item, NORMALIZED_WEIGHT_KEYS)) return item

  try {
    const shops = packageFactsFrom(await send({ type: 'OZONBOX_FETCH_PACKAGE_FACTS', sku }))
    const packageFacts = shops[0]
    if (!packageFacts) return item
    return mergeKnownMeasures(item, { attributes: packageFacts.attributes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '包裹参数读取失败'
    console.warn('Ozonbox 包裹参数补充失败，保留已获取的 analytics 数据', error)
    return { ...item, ozonboxPackageFactsError: message }
  }
}
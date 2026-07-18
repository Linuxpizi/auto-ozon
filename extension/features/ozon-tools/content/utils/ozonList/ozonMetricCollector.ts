import type { OzonSkuCardData } from './types'
import {
  decodeOzonWidgetState,
  type OzonWidgetStateValue as WidgetStateValue,
} from './ozonWidgetState'

type EntrypointResponse = {
  widgetStates?: Record<string, WidgetStateValue>
  [key: string]: unknown
}

const BRAND_NAMES = new Set(['бренд', 'brand', 'марка'])
const CATEGORY_NAMES = new Set(['категория', 'category', 'тип', 'type'])

function ozonOrigin(): string {
  return /(^|\.)ozon\.kz$/i.test(window.location.hostname)
    ? 'https://ozon.kz'
    : 'https://www.ozon.ru'
}

export function buildOzonEntrypointUrl(path: string, origin = ozonOrigin()): string {
  return `${origin}/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(path)}`
}

/** Ozon widget 值偶尔会被连续 JSON 编码，最多解三层。 */
export function parseWidgetState(raw: WidgetStateValue): unknown {
  return decodeOzonWidgetState(raw)
}

function textValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return textValue(record.text ?? record.value ?? record.name)
}

function characteristicValues(item: Record<string, unknown>): string[] {
  const values = Array.isArray(item.values) ? item.values : []
  return values.map(textValue).filter(Boolean)
}

export type OzonCharacteristic = { name: string; values: string[] }

const metricRequestCache = new Map<string, Promise<OzonSkuCardData>>()

/** 严格按原始 webCharacteristics 的 short/long 结构提取，避免递归误取无关文本。 */
export function parseCharacteristics(
  widgetStates: Record<string, WidgetStateValue> | undefined,
): OzonCharacteristic[] {
  if (!widgetStates) return []
  const result: OzonCharacteristic[] = []
  const seen = new Set<string>()

  for (const [key, raw] of Object.entries(widgetStates)) {
    const state = parseWidgetState(raw)
    if (!state || typeof state !== 'object' || Array.isArray(state)) continue
    const characteristics = (state as Record<string, unknown>).characteristics
    if (!key.includes('webCharacteristics') && !Array.isArray(characteristics)) continue
    if (!Array.isArray(characteristics)) continue

    for (const group of characteristics) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) continue
      const record = group as Record<string, unknown>
      for (const sectionName of ['short', 'long'] as const) {
        const section = record[sectionName]
        if (!Array.isArray(section)) continue
        for (const rawItem of section) {
          if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
          const item = rawItem as Record<string, unknown>
          const name = textValue(item.name)
          const values = characteristicValues(item)
          if (!name || !values.length) continue
          const signature = `${name}\0${values.join('\0')}`
          if (seen.has(signature)) continue
          seen.add(signature)
          result.push({ name, values })
        }
      }
    }
  }
  return result
}

function findCharacteristic(
  characteristics: OzonCharacteristic[],
  names: Set<string>,
): string | undefined {
  for (const item of characteristics) {
    if (names.has(item.name.trim().toLocaleLowerCase('ru'))) {
      return item.values.join(', ')
    }
  }
  return undefined
}

function parseHeading(widgetStates: Record<string, WidgetStateValue> | undefined): string | undefined {
  if (!widgetStates) return undefined
  for (const [key, raw] of Object.entries(widgetStates)) {
    if (!key.includes('webProductHeading')) continue
    const state = parseWidgetState(raw)
    if (!state || typeof state !== 'object' || Array.isArray(state)) continue
    const title = textValue((state as Record<string, unknown>).title)
    if (title) return title
  }
  return undefined
}

function firstWidgetRecord(
  widgetStates: Record<string, WidgetStateValue> | undefined,
  keyFragments: string[],
): Record<string, unknown> | undefined {
  if (!widgetStates) return undefined
  for (const [key, raw] of Object.entries(widgetStates)) {
    if (!keyFragments.some((fragment) => key.includes(fragment))) continue
    const state = parseWidgetState(raw)
    if (state && typeof state === 'object' && !Array.isArray(state)) {
      return state as Record<string, unknown>
    }
  }
  return undefined
}

/** 只提取商品页明确公开的即时价格字段，不映射到历史均价/促销分析指标。 */
export function parsePublicPrice(
  widgetStates: Record<string, WidgetStateValue> | undefined,
): Record<string, string> {
  const state = firstWidgetRecord(widgetStates, ['webPrice-', 'webSale-', 'webPrice'])
  if (!state) return {}
  const result: Record<string, string> = {}
  const currentPrice = textValue(state.price ?? state.cardPrice)
  const originalPrice = textValue(state.originalPrice ?? state.oldPrice)
  const currentDiscount = textValue(state.discount ?? state.discountText)
  if (currentPrice) result.currentPrice = currentPrice
  if (originalPrice) result.originalPrice = originalPrice
  if (currentDiscount) result.currentDiscount = currentDiscount
  return result
}

/** 只提取公开评分与评论数，绝不将评论数写入 views（展示量）。 */
export function parsePublicReview(
  widgetStates: Record<string, WidgetStateValue> | undefined,
): Record<string, string | number> {
  const state = firstWidgetRecord(widgetStates, [
    'webReviewProductScore-',
    'webProductScore-',
    'webReviewProductScore',
  ])
  if (!state) return {}
  const result: Record<string, string | number> = {}
  const rating = textValue(state.score ?? state.rating ?? state.totalScore)
  const reviewCount = textValue(state.reviewsCount ?? state.reviewCount ?? state.commentsCount)
  if (rating) result.rating = rating
  if (reviewCount) result.reviewCount = reviewCount
  return result
}

async function fetchEntrypoint(path: string): Promise<EntrypointResponse> {
  const response = await fetch(buildOzonEntrypointUrl(path), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const error = new Error(`Ozon 商品接口返回 HTTP ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !contentType.toLowerCase().includes('json')) {
    throw new Error('Ozon 商品接口返回了非 JSON 页面，可能需要验证登录状态')
  }
  const data = await response.json() as EntrypointResponse
  if (!data || typeof data !== 'object' || !data.widgetStates) {
    throw new Error('Ozon 商品接口未返回 widgetStates')
  }
  return data
}

function isCurrentDetailSku(sku: string): boolean {
  const pathname = String(window.location.pathname || '')
  if (!pathname.includes('/product/')) return false
  return pathname.split(/[/?#]/).some((part) => part === sku || part.endsWith(`-${sku}`))
}

function categoryFromDocument(sku: string): string | undefined {
  // 列表页 hierarchy 代表当前目录/搜索上下文，不能冒充每个商品自己的类目。
  if (!isCurrentDetailSku(sku)) return undefined
  try {
    const html = document.documentElement?.innerHTML || ''
    const match = html.match(/"hierarchy":"(.*?)"/)
    if (!match?.[1]) return undefined
    const decoded = match[1]
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
    const parts = decoded.split('/').map((part) => part.trim()).filter(Boolean)
    return parts.length ? parts.join(' > ') : undefined
  } catch {
    return undefined
  }
}

/**
 * 只采集 Ozon 商城响应能证明的字段。月销、GMV、曝光、转化等聚合指标不在公开商品
 * 响应中，故意保持 undefined，由渲染层展示“--”。
 */
async function collectOzonSkuMetricsUncached(sku: string): Promise<OzonSkuCardData> {
  const normalizedSku = String(sku || '').trim()
  if (!normalizedSku) throw new Error('缺少 Ozon SKU')

  // 整条内层路径会由 buildOzonEntrypointUrl 编码，SKU 此处不能提前二次编码。
  const page1 = await fetchEntrypoint(`/product/${normalizedSku}/`)
  const page2Path =
    `/product/${normalizedSku}/?&abt_att=1` +
    '&layout_page_index=2&origin_referer=www.ozon.ru&layout_container=pdpPage2column'
  const page2 = await fetchEntrypoint(page2Path).catch(() => null)

  const page1Characteristics = parseCharacteristics(page1.widgetStates)
  const page2Characteristics = parseCharacteristics(page2?.widgetStates)
  const characteristics = [...page2Characteristics, ...page1Characteristics]
  const brand = findCharacteristic(characteristics, BRAND_NAMES)
  const category = categoryFromDocument(normalizedSku) || findCharacteristic(characteristics, CATEGORY_NAMES)

  const data: OzonSkuCardData = { article: normalizedSku }
  if (brand) data.brand = brand
  if (category) data.catname = category

  // 标题不是旧卡片字段，但保留为扩展字段，供缓存/导出渐进复用。
  const title = parseHeading(page1.widgetStates)
  if (title) data.title = title
  Object.assign(data, parsePublicPrice(page1.widgetStates), parsePublicReview(page1.widgetStates))
  data.characteristics = characteristics
  // 包装加载器据此区分“Page2 确认无字段”和“Page2 请求失败”；失败结果不永久缓存。
  data.page2Loaded = page2 !== null
  data.metricSource = 'ozon'
  return data
}

export function collectOzonSkuMetrics(sku: string): Promise<OzonSkuCardData> {
  const normalizedSku = String(sku || '').trim()
  if (!normalizedSku) return Promise.reject(new Error('缺少 Ozon SKU'))
  const cached = metricRequestCache.get(normalizedSku)
  if (cached) return cached
  const request = collectOzonSkuMetricsUncached(normalizedSku)
    .then((data) => {
      if (data.page2Loaded === false && metricRequestCache.get(normalizedSku) === request) {
        metricRequestCache.delete(normalizedSku)
      }
      return data
    })
    .catch((error) => {
      metricRequestCache.delete(normalizedSku)
      throw error
    })
  metricRequestCache.set(normalizedSku, request)
  return request
}

export function clearOzonMetricCache(): void {
  metricRequestCache.clear()
}
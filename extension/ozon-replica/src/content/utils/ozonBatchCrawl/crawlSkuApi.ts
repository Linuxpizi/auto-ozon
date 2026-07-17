import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'
import { shopsClawlerLimiter, newClawlerLimiter } from './requestRateLimiter'

/** 导出 enrichment 单请求超时（对齐旧版 8s race） */
export const ENRICH_EXPORT_TIMEOUT_MS = 8000

export function withEnrichTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ENRICH_EXPORT_TIMEOUT_MS)
    }),
  ])
}

export interface OzonSellerOffer {
  sku?: string | number
  name?: string
  sellerName?: string
  shopName?: string
  link?: string
  productLink?: string
  logoImageUrl?: string
  logo?: string
  logoUrl?: string
  image?: string
  rating?: number | { totalScore?: number }
  starRating?: number
  credentials?: string[]
  warehouseName?: string
  countryName?: string
  country?: string
  regionName?: string
  advantages?: Array<{ contentRs?: { headRs?: Array<{ type?: string; content?: string }> } }>
  deliverySchema?: { text?: string }
  deliveryText?: string
  timeSlot?: string
  delivery?: { text?: string }
  deliveryTime?: { text?: string }
  estimatedDeliveryDateText?: string
  warehouse?: { name?: string }
  seller?: {
    name?: string
    sellerName?: string
    country?: string
    countryName?: string
    rating?: number
    logoImageUrl?: string
    logo?: string
    logoUrl?: string
    image?: string
  }
  feedback?: { rating?: number }
  price?: {
    price?: string
    cardPrice?: { price?: string }
  }
}

export interface CrawlerSkuData {
  article?: string
  brand?: string
  catname?: string
  monthsales?: number | string
  gmvSum?: number | string
  gnumber?: number | string
  priceMin?: number | string
  priceMax?: number | string
  priceMinSku?: string | number
  priceMaxSku?: string | number
  drr?: number | string
  daysInPromo?: number | string
  daysWithTrafarets?: number | string
  discount?: number | string
  salesDynamics?: string
  nullableRedemptionRate?: number | string
  views?: number | string
  convViewToOrder?: number | string
  sessioncount?: number | string
  convTocartPdp?: number | string
  promoRevenueShare?: number | string
  volume?: number | string
  avgprice?: number | string
  sources?: string
  sessionCountSearch?: number | string
  convToCartSearchRate?: number | string
  goodsClickRate?: number | string
  returnCancelRate?: number | string
  createDate?: string
  commission?: Record<string, number | string>
}

/** 爬取导出专用：newClawler 接口（字段比 skuss/new 更全） */
export async function fetchCrawlerSkuData(
  sku: string,
  period?: string,
  shouldCancel?: () => boolean,
): Promise<CrawlerSkuData | null> {
  let url = `/system/sku/skuss/newClawler?sku=${encodeURIComponent(sku)}`
  if (period) url += `&period=${encodeURIComponent(period)}`
  return withEnrichTimeout(
    (async () => {
      try {
        await newClawlerLimiter.acquire(shouldCancel)
        const res = await apiService.request<{ code: number; data?: CrawlerSkuData }>(url, {
          method: 'GET',
          baseURL: API_CONFIG.LOCAL_API_BASE_URL,
        })
        if (res?.code === 200 && res.data) return res.data
      } catch {
        return null
      }
      return null
    })(),
    null,
  )
}

/** 优先 webSellerList-*，否则第一个含非空 sellers 的 widget（对齐旧版 pickSellersFromOtherOffersWidgetStates） */
export function pickSellersFromOtherOffersWidgetStates(
  widgetStates: Record<string, string> | undefined,
): OzonSellerOffer[] | null {
  if (!widgetStates) return null
  const keys = Object.keys(widgetStates)
  const preferKeys = keys.filter((k) => k.startsWith('webSellerList-'))
  const ordered = [...preferKeys, ...keys.filter((k) => !preferKeys.includes(k))]

  for (const key of ordered) {
    try {
      const raw = widgetStates[key]
      if (raw == null) continue
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const sellers = parsed?.sellers
      if (Array.isArray(sellers) && sellers.length > 0) return sellers
    } catch {
      /* try next key */
    }
  }
  return null
}

const followSellersInflight = new Map<string, Promise<OzonSellerOffer[] | null>>()

/** 跟卖卖家列表（Ozon 页面 API，与旧版 getGMnumber 一致） */
export async function fetchOtherOffersSellers(sku: string): Promise<OzonSellerOffer[] | null> {
  const key = String(sku || '').trim()
  if (!key) return null

  const inflight = followSellersInflight.get(key)
  if (inflight) return inflight

  const origin = /ozon\.kz/i.test(window.location.hostname)
    ? 'https://www.ozon.kz'
    : 'https://www.ozon.ru'
  const apiUrl =
    `${origin}/api/entrypoint-api.bx/page/json/v2?url=%2Fmodal%2FotherOffersFromSellers%3Fproduct_id%3D`
    + `${encodeURIComponent(key)}%26sort%3Dprice%26page_changed%3Dtrue`

  const promise = withEnrichTimeout(
    (async () => {
      try {
        const res = await fetch(apiUrl, { credentials: 'include' })
        if (!res.ok) return null
        const os = await res.json() as { widgetStates?: Record<string, string> }
        return pickSellersFromOtherOffersWidgetStates(os.widgetStates)
      } catch {
        return null
      }
    })(),
    null,
  )

  followSellersInflight.set(key, promise)
  try {
    return await promise
  } finally {
    followSellersInflight.delete(key)
  }
}

/** 包装尺寸/重量（shopsClawler） */
export async function fetchSkuPackagingAttributes(
  sku: string,
  shouldCancel?: () => boolean,
): Promise<Array<{ key: string; value: string }> | null> {
  return withEnrichTimeout(
    (async () => {
      try {
        await shopsClawlerLimiter.acquire(shouldCancel)
        const res = await apiService.request<{ code: number; data?: Array<{ attributes?: Array<{ key: string; value: string }> }> }>(
          '/system/sku/shopsClawler',
          {
            method: 'POST',
            baseURL: API_CONFIG.LOCAL_API_BASE_URL,
            data: { sku },
          },
        )
        const attrs = res?.data?.[0]?.attributes
        return attrs?.length ? attrs : null
      } catch {
        return null
      }
    })(),
    null,
  )
}

export interface SkuShopsFull {
  attributes: Array<{ key: string; value: string }> | null
  categories: Array<{ level?: string | number; id?: string | number; name?: string }> | null
}

/** 列表/详情卡片补全：包装/类目（/shops，与上架路径同一接口，不走 shopsClawler 限流桶） */
export async function fetchSkuShops(sku: string): Promise<SkuShopsFull> {
  try {
    const res = await apiService.request<{
      code: number
      data?: Array<{
        attributes?: Array<{ key: string; value: string }>
        categories?: Array<{ level?: string | number; id?: string | number; name?: string }>
      }>
    }>('/system/sku/shops', {
      method: 'POST',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
      data: { sku },
    })
    const first = res?.data?.[0]
    return {
      attributes: first?.attributes?.length ? first.attributes : null,
      categories: first?.categories?.length ? first.categories : null,
    }
  } catch {
    return { attributes: null, categories: null }
  }
}

export type InspectShopCookieOutcome =
  | { ok: true; count: number }
  | { ok: false; reason: 'empty' | 'failed' }

let inspectCookiePromise: Promise<InspectShopCookieOutcome> | null = null

/** 检测本地保存的店铺 Cookie 可用性。 */
export async function inspectShopCookieAvailability(options?: {
  dedupe?: boolean
}): Promise<InspectShopCookieOutcome> {
  const dedupe = options?.dedupe !== false
  if (dedupe && inspectCookiePromise) return inspectCookiePromise

  const run = async (): Promise<InspectShopCookieOutcome> => {
    try {
      const res = await apiService.request<{ available_count?: number }>(
        '/browser-sync/ozon-cookies/inspect',
        { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
      )
      const count = Number(res?.available_count ?? 0)
      if (count > 0) return { ok: true, count }
      return { ok: false, reason: 'empty' }
    } catch {
      return { ok: false, reason: 'failed' }
    }
  }

  if (!dedupe) return run()

  inspectCookiePromise = run().finally(() => {
    inspectCookiePromise = null
  })
  return inspectCookiePromise
}

export function getShopCookieUnavailableMessage(reason: 'empty' | 'failed'): string {
  if (reason === 'failed') return '错误：本地服务暂时无法检测店铺 Cookie，请稍后重试！'
  return '错误：本地没有有效的店铺 Cookie，请至少保存一个店铺 Cookie 后再使用该功能！'
}

/** 导出前检测有效 Cookie 店铺数 */
export async function inspectShopCookieCount(): Promise<number> {
  const outcome = await inspectShopCookieAvailability({ dedupe: false })
  return outcome.ok ? outcome.count : 0
}

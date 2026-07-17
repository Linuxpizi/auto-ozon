import { normalizeMatchText } from './keywordMatch'

/** 店铺 ModuleAsyncService 接口 offerList 单条原始结构（仅用到的字段） */
export type ShopOfferApiItem = {
  id?: string | number
  subject?: string
  offerPrice?: string | number
  handPrice?: number
  thirtySaleQuantity?: string
  vagueSaleQuantity?: string
  offerImages?: Array<{ imageURI?: string; size220x220ImageURI?: string }>
}

export type ShopOfferListCache = {
  offerList: ShopOfferApiItem[]
  fetchedAt: number
  pageToken: string
}

const POLL_INTERVAL_MS = 400

/** 经 ext-req 从 MAIN 世界读取店铺 offerList 缓存 */
export function fetchShopOfferListFromMain(timeoutMs = 8000): Promise<ShopOfferListCache> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      document.removeEventListener('ext-res', handleResponse)
      reject(new Error('读取店铺商品列表超时'))
    }, timeoutMs)

    function handleResponse(event: Event) {
      const customEvent = event as CustomEvent
      let detail: Record<string, unknown> | null = customEvent.detail
      if (typeof detail === 'string') {
        try {
          detail = JSON.parse(detail) as Record<string, unknown>
        } catch {
          return
        }
      }
      if (!detail || detail.type !== 'getShopOfferList' || detail.action !== 'getShopOfferList') return
      window.clearTimeout(timer)
      document.removeEventListener('ext-res', handleResponse)
      if (detail.success && detail.data) {
        const cache = detail.data as ShopOfferListCache
        resolve({
          offerList: Array.isArray(cache.offerList) ? cache.offerList : [],
          fetchedAt: typeof cache.fetchedAt === 'number' ? cache.fetchedAt : 0,
          pageToken: typeof cache.pageToken === 'string' ? cache.pageToken : '',
        })
        return
      }
      reject(new Error('店铺商品列表未就绪'))
    }

    document.addEventListener('ext-res', handleResponse)
    document.dispatchEvent(
      new CustomEvent('ext-req', {
        detail: { type: 'ext-req', action: 'getShopOfferList' },
      }),
    )
  })
}

/** 轮询直到 offerList 有数据或超时 */
export async function waitForShopOfferList(timeoutMs: number): Promise<ShopOfferListCache | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const cache = await fetchShopOfferListFromMain(Math.min(3000, timeoutMs))
      if (cache.offerList.length > 0) return cache
    } catch {
      // MAIN hook 可能尚未注入，继续轮询
    }
    await sleep(POLL_INTERVAL_MS)
  }
  try {
    const cache = await fetchShopOfferListFromMain(2000)
    return cache.offerList.length > 0 ? cache : null
  } catch {
    return null
  }
}

/** 翻页后等待接口缓存刷新（fetchedAt 或 pageToken 变化） */
export async function waitForShopOfferListRefresh(
  previous: ShopOfferListCache,
  timeoutMs: number,
): Promise<ShopOfferListCache | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const cache = await fetchShopOfferListFromMain(2000)
      if (!cache.offerList.length) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }
      const refreshed =
        cache.fetchedAt > previous.fetchedAt
        || (cache.pageToken && cache.pageToken !== previous.pageToken)
      if (refreshed) return cache
    } catch {
      // 继续轮询
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return null
}

export function normalizeShopTitle(title: string): string {
  return normalizeMatchText(title || '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

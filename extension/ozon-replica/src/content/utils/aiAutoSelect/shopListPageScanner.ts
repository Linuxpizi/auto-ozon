import { normalizeMatchText } from './keywordMatch'
import type { ListMetrics, ListOfferItem } from './types'
import {
  fetchShopOfferListFromMain,
  normalizeShopTitle,
  waitForShopOfferList,
  waitForShopOfferListRefresh,
  type ShopOfferApiItem,
  type ShopOfferListCache,
} from './shopOfferListBridge'
import { is1688ShopListHost } from './storeCollectUrl'

const PAGE_SIZE = 60
const SHOP_LIST_NAV_DELAY_MS_MIN = 5000
const SHOP_LIST_NAV_DELAY_MS_MAX = 15000

/** 当前是否为 1688 店铺商品列表页 */
export function is1688ShopOfferListPage(): boolean {
  const { hostname, pathname } = window.location
  if (!is1688ShopListHost(hostname)) return false
  return pathname.toLowerCase().includes('offerlist')
}

/** 从 DOM 收集带 title 属性的 p 标签文案，供接口数据辅助校验 */
export function getShopDomTitles(): string[] {
  const titles: string[] = []
  const seen = new Set<string>()
  document.querySelectorAll('p').forEach((el) => {
    const title = el.getAttribute('title')?.trim()
    if (!title) return
    const normalized = normalizeShopTitle(title)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    titles.push(normalized)
  })
  return titles
}

/** 解析商品价格
 * @param item 商品信息
 * @returns 商品价格
 * 解析商品价格，返回商品价格
 * 使用 item.handPrice 获取商品价格
 * 使用 item.offerPrice 获取商品价格
 * 使用 parseFloat 解析商品价格
 */
function parseListPrice(item: ShopOfferApiItem): number | null {
  if (item.handPrice != null && !Number.isNaN(Number(item.handPrice))) {
    return Number(item.handPrice)
  }
  if (item.offerPrice != null && item.offerPrice !== '') {
    const n = parseFloat(String(item.offerPrice).replace(/[^\d.]/g, ''))
    if (!Number.isNaN(n)) return n
  }
  return null
}

/** 提取商品主图
 * @param item 商品信息
 * @returns 商品主图
 * 提取商品主图，返回商品主图
 * 使用 item.offerImages 获取商品主图
 * 使用 item.imageURI 获取商品主图
 * 使用 item.size220x220ImageURI 获取商品主图
 */
function extractMainImageUrl(item: ShopOfferApiItem): string | undefined {
  const img = item.offerImages?.[0]
  const raw = img?.imageURI || img?.size220x220ImageURI || ''
  if (!raw) return undefined
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http')) return raw
  if (raw.startsWith('img/')) return `https://cbu01.alicdn.com/${raw}`
  return raw
}

/** 提取商品指标
 * @param item 商品信息
 * @returns 商品指标
 * 提取商品指标，返回商品指标
 * 使用 item.thirtySaleQuantity 获取商品指标
 * 使用 item.vagueSaleQuantity 获取商品指标
 */
function extractListMetrics(item: ShopOfferApiItem): ListMetrics {
  const metrics: ListMetrics = {}
  if (item.thirtySaleQuantity) metrics.monthlySales = item.thirtySaleQuantity
  else if (item.vagueSaleQuantity) metrics.monthlySales = item.vagueSaleQuantity
  return metrics
}

/** 映射 API 商品信息为列表商品信息
 * @param item 商品信息
 * @param placeholder 占位元素
 * @returns 列表商品信息
 * 映射 API 商品信息为列表商品信息，返回列表商品信息
 * 使用 item.id 获取商品 ID
 * 使用 normalizeMatchText 规范化商品标题
 */
function mapApiItemToListOffer(item: ShopOfferApiItem, placeholder: Element): ListOfferItem | null {
  const offerId = item.id != null ? String(item.id) : ''
  if (!offerId || offerId === '0') return null
  const title = normalizeMatchText(String(item.subject || '').trim())
  if (!title) return null
  return {
    offerId,
    title,
    listPrice: parseListPrice(item),
    mainImageUrl: extractMainImageUrl(item),
    listMetrics: extractListMetrics(item),
    element: placeholder,
  }
}

/** 扫描当前店铺页：以接口 offerList 为主，DOM p[title] 做标题存在性校验 */
export async function scanShopPageItems(): Promise<ListOfferItem[]> {
  let cache: ShopOfferListCache
  try {
    cache = await fetchShopOfferListFromMain(5000)
  } catch {
    const waited = await waitForShopOfferList(8000)
    if (!waited) return []
    cache = waited
  }

  const domTitles = getShopDomTitles()
  const domTitleSet = new Set(domTitles)
  const placeholder = document.body
  const result: ListOfferItem[] = []
  const seen = new Set<string>()

  for (const item of cache.offerList) {
    const mapped = mapApiItemToListOffer(item, placeholder)
    if (!mapped || seen.has(mapped.offerId)) continue
    // DOM 已渲染时剔除接口有、页面无对应 title 的异常项
    if (domTitleSet.size > 0) {
      const normalizedSubject = normalizeShopTitle(String(item.subject || ''))
      if (!domTitleSet.has(normalizedSubject)) continue
    }
    seen.add(mapped.offerId)
    result.push(mapped)
    if (result.length >= PAGE_SIZE) break
  }
  return result
}

export function hasShopNextPage(): boolean {
  return Array.from(document.querySelectorAll('button')).some(
    (btn) => btn.innerText.includes('下一页'),
  )
}

/** 查找下一页按钮
 * @returns 下一页按钮
 * 查找下一页按钮，返回下一页按钮
 * 使用 document.querySelectorAll 获取按钮 DOM 节点
 * 使用 Array.from 将 NodeList 转换为数组
 * 使用 find 查找下一页按钮
 */
function findShopNextPageButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll('button'))
  const hit = buttons.find((btn) => btn.innerText.includes('下一页'))
  return hit instanceof HTMLButtonElement ? hit : null
}

/** 转到下一页
 * @returns 是否转到下一页
 * 转到下一页，返回是否转到下一页
 * 使用 findShopNextPageButton 查找下一页按钮
 * 使用 fetchShopOfferListFromMain 获取店铺商品列表
 * 使用 waitForShopOfferListRefresh 等待店铺商品列表刷新
 * 使用 sleep 睡眠
 * 使用 randomShopNavDelayMs 获取随机店铺导航延迟时间
 */
export async function goShopNextPage(): Promise<boolean> {
  const nextBtn = findShopNextPageButton()
  if (!nextBtn) return false

  let previous: ShopOfferListCache
  try {
    previous = await fetchShopOfferListFromMain(3000)
  } catch {
    previous = { offerList: [], fetchedAt: 0, pageToken: '' }
  }

  nextBtn.click()
  const refreshed = await waitForShopOfferListRefresh(previous, 15000)
  if (refreshed) {
    await sleep(randomShopNavDelayMs())
    return true
  }
  return false
}

/** 店铺页自动开始：等待页面判定 + 接口或 DOM 就绪 */
export function waitForShopOfferListPage(timeoutMs: number): Promise<boolean> {
  if (is1688ShopOfferListPage() && getShopDomTitles().length > 0) {
    return waitForShopOfferList(3000).then((cache) => !!cache?.offerList.length)
  }

  return new Promise((resolve) => {
    const start = Date.now()
    let settled = false

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      observer.disconnect()
      clearInterval(timer)
      resolve(ok)
    }

    const checkReady = async () => {
      if (!is1688ShopOfferListPage()) return false
      if (getShopDomTitles().length > 0) return true
      try {
        const cache = await fetchShopOfferListFromMain(1500)
        return cache.offerList.length > 0
      } catch {
        return false
      }
    }

    const observer = new MutationObserver(() => {
      checkReady().then((ok) => {
        if (ok) done(true)
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        done(false)
        return
      }
      checkReady().then((ok) => {
        if (ok) done(true)
      })
    }, 400)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomShopNavDelayMs(): number {
  return SHOP_LIST_NAV_DELAY_MS_MIN
    + Math.floor(Math.random() * (SHOP_LIST_NAV_DELAY_MS_MAX - SHOP_LIST_NAV_DELAY_MS_MIN))
}


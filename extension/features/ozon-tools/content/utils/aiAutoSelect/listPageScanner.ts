import { anyKeywordMatchesTitleWithMode, normalizeMatchText } from './keywordMatch'
import type { AiAutoSelectConfig, ListOfferItem } from './types'

const PAGE_SIZE = 60
/** 平滑滚动动画时长 */
const SCROLL_SMOOTH_DURATION_MS = 700
/** 搜索列表滚底后等待商品数量稳定的轮询间隔 */
const SEARCH_LIST_STABLE_POLL_MS = 400
/** 连续稳定轮询次数达到此值视为加载完成 */
const SEARCH_LIST_STABLE_ROUNDS = 1
/** 搜索列表懒加载等待超时 */
const SEARCH_LIST_LOAD_TIMEOUT_MS = 4000
/** 商品数量稳定后额外等待 DOM 插入 */
const SEARCH_LIST_POST_LOAD_MS = 400

/** www.1688.com/zw 滚动列表页 DOM 标记 */
const ZW_LIST_ROOT_SELECTOR = '.offer-list-wrap'
const ZW_OFFER_ITEM_SELECTOR = '.offer-list-wrap .offer-item'

export function is1688OfferListPage(): boolean {
  const { hostname } = window.location
  if (!hostname.includes('1688.com')) return false
  if (hostname === 'detail.1688.com') return false
  return !!document.querySelector(
    `.page-offerlist, .space-common-offerlist, .offer-card-container, .offer-card, ${ZW_LIST_ROOT_SELECTOR}, .offer.offer-item`,
  )
}

/** 扫描当前页商品卡片，去重后最多返回 60 条 */
export function scanCurrentPageItems(): ListOfferItem[] {
  const fromCards = scanOfferCards()
  const fromSearchList = scanSearchListRows()
  const merged = [...fromCards, ...fromSearchList]
  const seen = new Set<string>()
  const result: ListOfferItem[] = []

  for (const item of merged) {
    if (!item.offerId || seen.has(item.offerId)) continue
    seen.add(item.offerId)
    result.push(item)
    if (result.length >= PAGE_SIZE) break
  }
  return result
}

/** 扫描商品卡片
 * @returns 商品卡片列表
 * 使用 document.querySelectorAll 获取商品卡片 DOM 节点
 * 遍历商品卡片 DOM 节点，提取商品信息
 */
function scanOfferCards(): ListOfferItem[] {
  const nodes = document.querySelectorAll(
    `.offer-card-container, .offer-card, ${ZW_OFFER_ITEM_SELECTOR}`,
  )
  const items: ListOfferItem[] = []
  nodes.forEach((el) => {
    const item = extractFromElement(el)
    if (item) items.push(item)
  })
  return items
}

function scanSearchListRows(): ListOfferItem[] {
  const titleNodes = document.querySelectorAll('.offer-title-row .title-text')
  const items: ListOfferItem[] = []
  titleNodes.forEach((titleEl) => {
    const root = findOfferRoot(titleEl)
    if (!root) return
    const item = extractFromElement(root)
    if (item) items.push(item)
  })
  return items
}

/** 查找商品根节点
 * @param el 商品标题节点
 * @returns 商品根节点
 * 查找商品根节点，返回商品根节点
 * 使用 document.querySelectorAll 获取商品卡片 DOM 节点
 */
function findOfferRoot(el: Element): Element | null {
  let node: Element | null = el
  for (let i = 0; i < 12 && node; i++) {
    if (
      node.querySelector?.('.offer-price-row') ||
      node.querySelector?.('.price-wrap') ||
      node.classList?.contains('offer-card')
    ) {
      return node
    }
    node = node.parentElement
  }
  return el.parentElement
}

/** 从卡片 DOM 取最长有效标题，优先 title/aria-label 避免可见区截断 */
function extractOfferTitle(root: Element): string {
  const candidates: string[] = []

  // s.1688.com 搜索列表：innerText 直接取可见文本，保留 font 高亮内的搜索词
  const searchTitleEl = root.querySelector('.offer-title-row .title-text')
  if (searchTitleEl instanceof HTMLElement) {
    const innerText = searchTitleEl.innerText?.trim()
    if (innerText) candidates.push(innerText)
  }

  // www.1688.com/zw：标题在 span 内，避免 icon 图片混入 textContent
  const zwTitleSpan = root.querySelector('.offer-title > span')
  if (zwTitleSpan?.textContent?.trim()) {
    candidates.push(zwTitleSpan.textContent.trim())
  }

  const titleSelectors = [
    '.offer-title',
    '.title-text div',
    '.title-text',
    'a[href*="/offer/"]',
  ]

  for (const selector of titleSelectors) {
    const el = root.querySelector(selector)
    if (!el) continue

    const text = el.textContent?.trim()
    if (text) candidates.push(text)

    const attrTitle = el.getAttribute('title')?.trim()
    if (attrTitle) candidates.push(attrTitle)

    const ariaLabel = el.getAttribute('aria-label')?.trim()
    if (ariaLabel) candidates.push(ariaLabel)
  }

  const longest = candidates.reduce(
    (best, current) => (current.length > best.length ? current : best),
    '',
  )
  return longest ? normalizeMatchText(longest) : ''
}

/** 从元素中提取商品信息
 * @param root 商品根节点
 * @returns 商品信息
 */
function extractFromElement(root: Element): ListOfferItem | null {
  const offerId = extractOfferId(root)
  if (!offerId) return null

  const title = extractOfferTitle(root)

  const listPrice = extractListPrice(root)
  const listMetrics = extractListMetrics(root)
  const mainImageUrl = extractMainImageUrl(root)

  return { offerId, title, listPrice, listMetrics, mainImageUrl, element: root }
}

function extractOfferId(el: Element): string | null {
  let node: Element | null = el
  for (let i = 0; i < 8 && node; i++) {
    const report = node.getAttribute?.('data-aplus-report')
    if (report) {
      const fromReport =
        report.match(/offerId@(\d+)/)?.[1] || report.match(/object_id@(\d+)/)?.[1]
      if (fromReport) return fromReport
    }
    node = node.parentElement
  }

  const extraEl = el.querySelector('[data-extra]')
  if (extraEl) {
    const raw = extraEl.getAttribute('data-extra') || ''
    try {
      const decoded = raw.replace(/&quot;/g, '"')
      const obj = JSON.parse(decoded) as { offerId?: string | number }
      if (obj?.offerId) return String(obj.offerId)
    } catch {
      const m = raw.match(/offerId[&quot;:"]+(\d+)/)
      if (m?.[1]) return m[1]
    }
  }

  const link = el.querySelector('a[href*="/offer/"]') as HTMLAnchorElement | null
  if (link?.href) {
    const m = link.href.match(/\/offer\/(\d+)/)
    if (m?.[1]) return m[1]
  }

  const wwLink = el.querySelector('a[href*="offerId="]') as HTMLAnchorElement | null
  if (wwLink?.href) {
    const m = wwLink.href.match(/offerId=(\d+)/)
    if (m?.[1]) return m[1]
  }

  return null
}

/** 提取商品主图
 * @param root 商品根节点
 * @returns 商品主图
 * 提取商品主图，返回商品主图
 * 使用 document.querySelector 获取商品主图 DOM 节点
 * 获取商品主图 DOM 节点的 src 或 data-src 属性
 * 如果 src 或 data-src 属性包含 'grey.gif'，则返回 undefined
 */
function extractMainImageUrl(root: Element): string | undefined {
  const img = root.querySelector('.offer-img img, .main-img, .offer-image img, img') as HTMLImageElement | null
  const src = img?.getAttribute('src') || img?.getAttribute('data-src') || ''
  if (!src || src.includes('grey.gif')) return undefined
  if (src.startsWith('//')) return `https:${src}`
  return src
}

/** 提取商品指标
 * @param root 商品根节点
 * @returns 商品指标
 * 提取商品指标，返回商品指标
 * 使用 document.querySelector 获取商品指标 DOM 节点
 * 获取商品指标 DOM 节点的 textContent
 */
function extractListMetrics(root: Element): import('./types').ListMetrics {
  const metrics: import('./types').ListMetrics = {}
  const textBlob = root.textContent || ''

  // www.1688.com/zw：成交与回头率有独立节点
  const soltEl = root.querySelector('.offer-price .solt, .solt')
  if (soltEl?.textContent) {
    const soltMatch = soltEl.textContent.match(/成交([\d.万+]+)/)
    if (soltMatch?.[1]) metrics.monthlySales = soltMatch[1]
  }
  const rebuyEl = root.querySelector('.rebuy-rate')
  if (rebuyEl?.textContent) {
    const rebuyMatch = rebuyEl.textContent.match(/回头率(\d+(?:\.\d+)?)%/)
    if (rebuyMatch?.[1]) metrics.repurchaseRate = parseFloat(rebuyMatch[1]) / 100
  }

  const soldMatch = textBlob.match(/售([\d.+]+)/)
  if (soldMatch?.[1]) {
    metrics.monthlySales = soldMatch[1]
  }

  const returnMatch = textBlob.match(/回头率(\d+(?:\.\d+)?)%/)
  if (returnMatch?.[1]) {
    metrics.repurchaseRate = parseFloat(returnMatch[1]) / 100
  }

  const statItems = root.querySelectorAll('.stats-wrapper .stat-item, .stat-item')
  statItems.forEach((el) => {
    const label = el.querySelector('.stat-label')?.textContent?.trim() || ''
    const value = el.querySelector('.stat-value')?.textContent?.trim() || ''
    if (label.includes('品质') && value) {
      const n = parseFloat(value)
      if (!Number.isNaN(n)) metrics.rating = n
    }
  })

  let node: Element | null = root
  for (let i = 0; i < 8 && node; i++) {
    const report = node.getAttribute?.('data-aplus-report')
    if (report) {
      if (!metrics.monthlySales) {
        const sold = report.match(/soldOut-售([^-]+)/)?.[1]
        if (sold) metrics.monthlySales = sold.replace(/件$/, '')
      }
      if (metrics.repurchaseRate == null) {
        const rr = report.match(/returnRate-回头率(\d+(?:\.\d+)?)%/)?.[1]
        if (rr) metrics.repurchaseRate = parseFloat(rr) / 100
      }
    }
    node = node.parentElement
  }

  return metrics
}

/** 提取商品价格
 * @param root 商品根节点
 * @returns 商品价格
 * 提取商品价格，返回商品价格
 * 使用 document.querySelector 获取商品价格 DOM 节点
 * 获取商品价格 DOM 节点的 textContent
 */
function extractListPrice(root: Element): number | null {
  const cardPrice = root.querySelector('.price-wrap .number')
  if (cardPrice?.textContent) {
    const n = parseFloat(cardPrice.textContent.replace(/[^\d.]/g, ''))
    if (!Number.isNaN(n)) return n
  }

  // www.1688.com/zw：整数与小数分在两个 em.number
  const zwMain = root.querySelector('.offer-price .number.n-b')
  const zwSub = root.querySelector('.offer-price .number.n-s')
  if (zwMain?.textContent) {
    const mainPart = zwMain.textContent.replace(/[^\d.]/g, '')
    const decimalPart = zwSub?.textContent?.replace(/[^\d.]/g, '') || ''
    const combined = decimalPart
      ? `${mainPart}${decimalPart.startsWith('.') ? decimalPart : `.${decimalPart}`}`
      : mainPart
    const n = parseFloat(combined)
    if (!Number.isNaN(n)) return n
  }

  const main = root.querySelector('.offer-price-row .text-main')
  if (main?.textContent) {
    const mainPart = main.textContent.replace(/[^\d.]/g, '')
    const decimalEl = main.nextElementSibling
    const decimalPart =
      decimalEl?.textContent?.replace(/[^\d.]/g, '') || ''
    const combined = decimalPart ? `${mainPart}.${decimalPart.replace(/^\./, '')}` : mainPart
    const n = parseFloat(combined)
    if (!Number.isNaN(n)) return n
  }

  const priceItem = root.querySelector('.offer-price-row .price-item')
  if (priceItem?.textContent) {
    const m = priceItem.textContent.match(/[\d.]+/)
    if (m) {
      const n = parseFloat(m[0])
      if (!Number.isNaN(n)) return n
    }
  }

  return null
}

/** 过滤商品，返回是否过滤
 * @param item 商品信息
 * @param config 配置
 * @returns 是否过滤
 */
export function passesFilter(item: ListOfferItem, config: AiAutoSelectConfig): boolean {
  const titleLower = (item.title || '').toLowerCase()

  if (config.keywords.length > 0) {
    // 多个关键词为或关系；模糊匹配暂时下线，固定精准匹配
    if (!anyKeywordMatchesTitleWithMode(
      config.keywords,
      titleLower,
      config.keywordMatchMode ?? 'strict',
    )) {
      return false
    }
  }

  const hasMinLimit = config.minPrice != null && config.minPrice > 0
  const hasMaxLimit = config.maxPrice != null && config.maxPrice > 0

  if (item.listPrice != null) {
    if (hasMinLimit && item.listPrice < config.minPrice!) return false
    if (hasMaxLimit && item.listPrice > config.maxPrice!) return false
  } else if (hasMinLimit || hasMaxLimit) {
    // 列表无价格时跳过，避免误采
    return false
  }

  return true
}

/** 无限滚动列表容器（首页推荐流、/zw 列表等无分页场景） */
export function findScrollLoadContainer(): Element | null {
  return document.querySelector(`${ZW_LIST_ROOT_SELECTOR}, .swiper-slide, .list-container, .list-padding`)
}

/** 无下一页按钮且存在滚动容器时，切换为滚动加载模式 */
export function isScrollLoadMode(): boolean {
  return !hasNextPage() && !!findScrollLoadContainer()
}

/** 是否有下一页
 * @returns 是否有下一页
 * 使用 document.querySelector 获取下一页按钮 DOM 节点
 * 如果有下一页按钮，则返回 true
 * 否则返回 false
 */
export function hasNextPage(): boolean {
  const next = document.querySelector(
    '.fui-paging-list .fui-arrow.fui-next:not(.fui-next-disabled)',
  )
  return !!next
}

/** 转到下一页
 * @returns 是否转到下一页
 * 使用 document.querySelector 获取下一页按钮 DOM 节点
 * 如果有下一页按钮，则点击下一页按钮
 * 否则返回 false
 */
export async function goNextPage(): Promise<boolean> {
  const next = document.querySelector(
    '.fui-paging-list .fui-arrow.fui-next:not(.fui-next-disabled)',
  ) as HTMLElement | null
  if (!next) return false

  await sleep(randomNavDelayMs())
  const beforeCount = countListMarkers()
  next.click()

  const updated = await waitForListUpdate(beforeCount, 15000)
  await sleep(randomNavDelayMs())
  return updated
}

/** 搜索列表页滚底，触发懒加载并等待本页商品全部插入 DOM */
export async function ensureSearchListFullyLoaded(): Promise<void> {
  if (!document.querySelector('.offer-title-row')) return

  // 类目/搜索列表滚底前固定等待，降低频繁滚动触发风控
  await sleep(2000 + Math.floor(Math.random() * 3000))
  const bottom = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
  await smoothScrollToTop(window, bottom)
  await waitForListCountStable(SEARCH_LIST_LOAD_TIMEOUT_MS)
  await sleep(SEARCH_LIST_POST_LOAD_MS)
}

/** 滚动加载模式下将列表滚回顶部，便于重新选品时从首批商品开始扫描 */
export async function scrollListToTop(): Promise<void> {
  const container = findScrollLoadContainer()
  if (!container) {
    if (window.scrollY > 1) {
      await smoothScrollToTop(window, 0)
      await sleep(1000)
    }
    return
  }

  const target = getScrollableTarget(container)
  if (target === window) {
    if (window.scrollY > 1) {
      await smoothScrollToTop(window, 0)
    }
  } else {
    const el = target as HTMLElement
    if (el.scrollTop > 1) {
      await smoothScrollToTop(el, 0)
    }
  }
  // 首页推荐流滚回顶部后等待虚拟列表重绘首批商品
  await sleep(1000)
}

/** 滚动到底触发懒加载，等待新商品 DOM 插入 */
export async function scrollLoadMore(): Promise<boolean> {
  const container = findScrollLoadContainer()
  if (!container) return false

  await sleep(randomNavDelayMs())
  const beforeCount = countListMarkers()
  const updatePromise = waitForListUpdate(beforeCount, 15000)
  await triggerScrollToLoad(container)
  const updated = await updatePromise
  return updated
}

/** 获取列表观察根节点
 * @returns 列表观察根节点
 */
function resolveListObserveRoot(): Element {
  return (
    findScrollLoadContainer() ||
    document.querySelector(`${ZW_LIST_ROOT_SELECTOR}, .page-offerlist, .space-common-offerlist, .feeds-wrapper`) ||
    document.body
  )
}

/** 
 * 获取滚动事件目标元素
 * @param container 滚动加载容器
 * @returns 滚动事件目标元素
 * 如果容器是 window，则返回 window
 * 否则返回容器
 */
function getScrollableTarget(container: Element): Element | Window {
  let el: Element | null = container
  for (let i = 0; i < 12 && el; i++) {
    const style = window.getComputedStyle(el)
    const overflowY = style.overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
    el = el.parentElement
  }
  return window
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

/** 
 * 获取滚动事件目标元素
 * @param target 目标元素
 * @returns 滚动事件目标元素
 * 如果目标元素是 window，则返回 document.scrollingElement 或 document.documentElement
 * 否则返回目标元素
 */
function resolveScrollEventTarget(target: Element | Window): Element {
  if (target === window) {
    // 勿对 window 派发 scroll：监听方常对 e.target 调 closest，window 无此方法会报错
    return (document.scrollingElement || document.documentElement) as Element
  }
  return target as Element
}

function dispatchScrollEvent(target: Element | Window): void {
  resolveScrollEventTarget(target).dispatchEvent(new Event('scroll', { bubbles: true }))
}

function getScrollTop(target: Element | Window): number {
  if (target === window) return window.scrollY
  return (target as HTMLElement).scrollTop
}

function setScrollTop(target: Element | Window, top: number): void {
  if (target === window) {
    window.scrollTo({ top, behavior: 'auto' })
    return
  }
  ; (target as HTMLElement).scrollTop = top
}

/** requestAnimationFrame 平滑滚动，每帧派发 scroll 以触发懒加载 */
function smoothScrollToTop(
  target: Element | Window,
  toTop: number,
  durationMs = SCROLL_SMOOTH_DURATION_MS,
): Promise<void> {
  const startTop = getScrollTop(target)
  const delta = toTop - startTop
  if (Math.abs(delta) < 1) return Promise.resolve()

  const startTime = performance.now()

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs)
      const currentTop = startTop + delta * easeOutCubic(progress)
      setScrollTop(target, currentTop)
      dispatchScrollEvent(target)

      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(tick)
  })
}

/** 触发滚动加载
 * @param container 滚动加载容器
 * @returns 滚动加载完成后 resolved 的 Promise
 * 获取滚动加载容器的目标元素，如果目标元素是 window，则滚动到窗口底部，否则滚动到目标元素底部
 * 使用 smoothScrollToTop 平滑滚动到目标位置
 */
async function triggerScrollToLoad(container: Element): Promise<void> {
  const target = getScrollableTarget(container)

  if (target === window) {
    const rect = container.getBoundingClientRect()
    const bottom = rect.bottom + window.scrollY
    await smoothScrollToTop(window, Math.max(0, bottom))
    return
  }

  const el = target as HTMLElement
  const toTop = Math.max(0, el.scrollHeight - el.clientHeight)
  await smoothScrollToTop(el, toTop)
}

function countListMarkers(): number {
  return document.querySelectorAll(
    `.offer-card-container, .offer-card, .offer-title-row, ${ZW_OFFER_ITEM_SELECTOR}`,
  ).length
}

/** 轮询列表标记数量，连续稳定则视为懒加载完成 */
async function waitForListCountStable(timeoutMs: number): Promise<void> {
  const start = Date.now()
  let lastCount = countListMarkers()
  let stableRounds = 0

  while (Date.now() - start < timeoutMs) {
    await sleep(SEARCH_LIST_STABLE_POLL_MS)
    const count = countListMarkers()
    if (count === lastCount) {
      stableRounds++
      if (stableRounds >= SEARCH_LIST_STABLE_ROUNDS) return
    } else {
      stableRounds = 0
      lastCount = count
    }
  }
}

/** 等待商品列表 DOM 就绪（跨页自动采集时 content script 可能早于 SPA 渲染） */
export function waitForOfferListPage(timeoutMs: number): Promise<boolean> {
  if (is1688OfferListPage() && countListMarkers() > 0) {
    return Promise.resolve(true)
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

    const checkReady = () => is1688OfferListPage() && countListMarkers() > 0

    const observer = new MutationObserver(() => {
      if (checkReady()) done(true)
    })

    const listRoot = resolveListObserveRoot()
    observer.observe(listRoot, { childList: true, subtree: true })

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        done(false)
        return
      }
      if (checkReady()) done(true)
    }, 400)
  })
}

/** 
 * 等待商品列表 DOM 更新（滚动加载模式下触发懒加载后等待新商品 DOM 插入）
 * @param previousCount 上次统计的商品数量
 * @param timeoutMs 等待超时时间
 * @returns 是否更新成功
 * 当 previousCount 与当前统计的商品数量不一致且大于 0 时，认为更新成功
 * 使用 MutationObserver 监听商品列表 DOM 变化，当 DOM 变化时，重新统计商品数量
 * 当统计的商品数量大于 0 时，认为更新成功
 */
function waitForListUpdate(previousCount: number, timeoutMs: number): Promise<boolean> {
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

    const observer = new MutationObserver(() => {
      const count = countListMarkers()
      if (count !== previousCount && count > 0) {
        done(true)
      }
    })

    const listRoot = resolveListObserveRoot()
    observer.observe(listRoot, { childList: true, subtree: true })

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        done(false)
        return
      }
      const count = countListMarkers()
      if (count !== previousCount && count > 0) {
        done(true)
      }
    }, 400)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// 翻页/触底加载前随机等待 5~10s，降低频繁操作触发风控
function randomNavDelayMs(): number {
  return 5000 + Math.floor(Math.random() * 5000)
}

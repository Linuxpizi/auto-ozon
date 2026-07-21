import {
  bindAnalyticsActions,
  createAnalyticsIframe,
  renderAnalyticsItem,
  setAnalyticsStatus,
} from './analytics-view'
import { readOzonCategoryPath } from './collector'
import { analyticsCategoryName, fetchOzonAnalyticsItem, readOzonSellerId } from './seller-analytics'
import { extractOzonProductId, isOzonProductUrl } from './url'

const LIST_CARD_SELECTOR = '.tile-root'
const DETAIL_PRICE_SELECTOR = 'div[data-widget="webSale"]'
const LIST_SCAN_INTERVAL_MS = 1000
const LIST_INSERT_DELAY_MS = 900

let sellerId: string | undefined
let sellerIdRequest: Promise<string> | undefined
const iframeRequests = new WeakMap<HTMLIFrameElement, Promise<void>>()

function isListPage(value: string): boolean {
  try {
    const url = new URL(value)
    return url.pathname === '/search' || url.pathname.startsWith('/category/')
  } catch {
    return false
  }
}

async function resolveSellerId(force: boolean): Promise<string> {
  if (!force && sellerId) return sellerId
  if (!force && sellerIdRequest) return sellerIdRequest
  sellerIdRequest = readOzonSellerId().then((value) => {
    sellerId = value
    return value
  }).finally(() => {
    sellerIdRequest = undefined
  })
  return sellerIdRequest
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ozon analytics 加载失败'
}

function updateAnalyticsIframe(
  iframe: HTMLIFrameElement,
  sku: string,
  forceSellerId = false,
  categoryFallback?: () => string | undefined,
): Promise<void> {
  const active = iframeRequests.get(iframe)
  if (active) return active
  setAnalyticsStatus(iframe, '加载中...')
  const request = resolveSellerId(forceSellerId).then(async (shopId) => {
    const item = await fetchOzonAnalyticsItem(sku, shopId)
    if (item) {
      const categoryName = analyticsCategoryName(item) ?? categoryFallback?.()
      renderAnalyticsItem(iframe, categoryName ? { ...item, categoryName } : item)
    }
    else setAnalyticsStatus(iframe, `暂无数据（店铺ID: ${shopId}）`)
  }).catch((error: unknown) => {
    setAnalyticsStatus(iframe, errorMessage(error))
  }).finally(() => {
    iframeRequests.delete(iframe)
  })
  iframeRequests.set(iframe, request)
  return request
}

function initializeIframe(
  iframe: HTMLIFrameElement,
  sku: string,
  categoryFallback?: () => string | undefined,
): void {
  let initialized = false
  const initialize = () => {
    if (initialized) return
    initialized = true
    bindAnalyticsActions(iframe, () => {
      void updateAnalyticsIframe(iframe, sku, true, categoryFallback)
    })
    void updateAnalyticsIframe(iframe, sku, false, categoryFallback)
  }
  iframe.addEventListener('load', initialize, { once: true })
  window.setTimeout(initialize, iframe.dataset.type === 'detail' ? 800 : 600)
}

function injectDetailAnalytics(): void {
  const sku = extractOzonProductId(window.location.href)
  if (!sku) return
  const priceBox = document.querySelector<HTMLElement>(DETAIL_PRICE_SELECTOR)
  if (!priceBox) return
  const host = priceBox.parentElement?.parentElement?.parentElement ?? priceBox.parentElement ?? priceBox
  const id = `ozon-analytics-detail-${sku}`
  if (document.getElementById(id)) return
  const iframe = createAnalyticsIframe(id, 'detail', sku)
  host.prepend(iframe)
  initializeIframe(iframe, sku, readOzonCategoryPath)
  window.setTimeout(() => {
    if (!document.getElementById(id)) injectDetailAnalytics()
  }, 1200)
}

function injectListAnalytics(): void {
  let cards = Array.from(document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR))
  if (cards.some((card) => card.classList.contains('loading-analytics'))) return
  cards = cards.filter((card) => !card.classList.contains('has-analytics'))
  cards.forEach((card, index) => {
    card.classList.add('has-analytics', 'loading-analytics')
    const href = card.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')
    const sku = href ? extractOzonProductId(href, window.location.origin) : undefined
    if (!sku) {
      card.classList.remove('loading-analytics')
      return
    }
    const iframe = createAnalyticsIframe(`ozon-analytics-lite-${sku}`, 'lite', sku)
    window.setTimeout(() => {
      card.append(iframe)
      card.classList.remove('loading-analytics')
      initializeIframe(iframe, sku)
    }, index * LIST_INSERT_DELAY_MS)
  })
}

/** Start the Ozonbox-compatible PDP and `.tile-root` analytics enhancement. */
export function startOzonAnalyticsCards(): void {
  if (isOzonProductUrl(window.location.href)) injectDetailAnalytics()
  window.setInterval(() => {
    if (isListPage(window.location.href)) injectListAnalytics()
  }, LIST_SCAN_INTERVAL_MS)
}
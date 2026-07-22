import {
  bindAnalyticsActions,
  createAnalyticsIframe,
  renderAnalyticsItem,
  setAnalyticsStatus,
} from './analytics-view'
import { readOzonCategoryPath } from './collector'
import { analyticsCategoryName, fetchOzonAnalyticsItem, readOzonSellerId } from './seller-analytics'
import { SuccessfulRequestCache } from './successful-request-cache'
import { extractOzonProductId, isOzonProductUrl } from './url'

const LIST_CARD_SELECTOR = '.tile-root'
const DETAIL_PRICE_SELECTOR = 'div[data-widget="webSale"]'
const GENERATED_IFRAME_SELECTOR = 'iframe[data-ozonbox-analytics="true"], iframe[id^="ozon-analytics-"]'
const RECONCILE_DELAY_MS = 80
const LIST_INSERT_DELAY_MS = 900

export type OzonAnalyticsPage =
  | { kind: 'detail'; sku: string }
  | { kind: 'list' }
  | { kind: 'other' }

export interface OzonAnalyticsCardsController {
  reconcile: () => void
  stop: () => void
}

const sellerIdCache = new SuccessfulRequestCache<'seller-id', string>()
const analyticsItemCache = new SuccessfulRequestCache<
  string,
  Awaited<ReturnType<typeof fetchOzonAnalyticsItem>>
>()
const iframeRequests = new WeakMap<HTMLIFrameElement, Promise<void>>()
let activeController: OzonAnalyticsCardsController | undefined

export function analyticsPageForUrl(value: string): OzonAnalyticsPage {
  if (isOzonProductUrl(value)) {
    const sku = extractOzonProductId(value)
    if (sku) return { kind: 'detail', sku }
  }

  try {
    const url = new URL(value)
    if (url.pathname === '/search' || url.pathname === '/search/' || url.pathname.startsWith('/category/')) {
      return { kind: 'list' }
    }
  } catch {
    // Invalid URLs are outside the enhancement scope.
  }
  return { kind: 'other' }
}

function samePage(left: OzonAnalyticsPage | undefined, right: OzonAnalyticsPage): boolean {
  if (!left || left.kind !== right.kind) return false
  return left.kind !== 'detail' || (right.kind === 'detail' && left.sku === right.sku)
}

function resolveSellerId(forceRefresh: boolean): Promise<string> {
  return sellerIdCache.get('seller-id', readOzonSellerId, forceRefresh)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ozon analytics 加载失败'
}

function updateAnalyticsIframe(
  iframe: HTMLIFrameElement,
  sku: string,
  forceRefresh = false,
  categoryFallback?: () => string | undefined,
): Promise<void> {
  const activeRequest = iframeRequests.get(iframe)
  if (activeRequest) return activeRequest

  setAnalyticsStatus(iframe, '加载中...')
  const request = resolveSellerId(forceRefresh)
    .then(async (shopId) => {
      const item = await analyticsItemCache.get(
        `${shopId}:${sku}`,
        () => fetchOzonAnalyticsItem(sku, shopId),
        forceRefresh,
      )
      if (!iframe.isConnected) return
      if (!item) {
        setAnalyticsStatus(iframe, `暂无数据（店铺ID: ${shopId}）`)
        return
      }

      const categoryName = analyticsCategoryName(item) ?? categoryFallback?.()
      renderAnalyticsItem(iframe, categoryName ? { ...item, categoryName } : item)
    })
    .catch((error: unknown) => {
      if (iframe.isConnected) setAnalyticsStatus(iframe, errorMessage(error))
    })
    .finally(() => {
      iframeRequests.delete(iframe)
    })
  iframeRequests.set(iframe, request)
  return request
}

function nodeContainsSelector(node: Node, selector: string): boolean {
  return node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)))
}

function mutationsContainTarget(records: MutationRecord[], page: OzonAnalyticsPage): boolean {
  const selector = page.kind === 'list'
    ? LIST_CARD_SELECTOR
    : page.kind === 'detail'
      ? DETAIL_PRICE_SELECTOR
      : undefined
  return Boolean(selector && records.some((record) => (
    Array.from(record.addedNodes).some((node) => nodeContainsSelector(node, selector))
  )))
}

function cardSku(card: HTMLElement): string | undefined {
  const href = card.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')
  return href ? extractOzonProductId(href, window.location.origin) : undefined
}

/** Start one idempotent, mutation-driven Ozon analytics enhancement lifecycle. */
export function startOzonAnalyticsCards(): OzonAnalyticsCardsController {
  activeController?.stop()

  let stopped = false
  let previousPage: OzonAnalyticsPage | undefined
  let reconcileTimer: number | undefined
  let frameSequence = 0
  const timers = new Set<number>()
  const insertionTimers = new Map<HTMLElement, number>()
  const eventAbortController = new AbortController()

  const schedule = (callback: () => void, delay: number): number => {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      callback()
    }, delay)
    timers.add(timer)
    return timer
  }

  const cancelTimer = (timer: number): void => {
    window.clearTimeout(timer)
    timers.delete(timer)
  }

  const clearInsertionTimers = (): void => {
    for (const [card, timer] of insertionTimers) {
      cancelTimer(timer)
      card.classList.remove('loading-analytics')
    }
    insertionTimers.clear()
  }

  const removeGeneratedFrames = (): void => {
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR)) {
      iframe.remove()
    }
    for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
      card.classList.remove('has-analytics', 'loading-analytics')
    }
  }

  const initializeIframe = (
    iframe: HTMLIFrameElement,
    sku: string,
    categoryFallback?: () => string | undefined,
  ): void => {
    let initialized = false
    const initialize = (): void => {
      if (initialized || stopped || !iframe.isConnected) return
      initialized = true
      bindAnalyticsActions(iframe, () => {
        void updateAnalyticsIframe(iframe, sku, true, categoryFallback)
      })
      void updateAnalyticsIframe(iframe, sku, false, categoryFallback)
    }
    iframe.addEventListener('load', initialize, { once: true, signal: eventAbortController.signal })
    schedule(initialize, iframe.dataset.type === 'detail' ? 800 : 600)
  }

  const injectDetailAnalytics = (sku: string): void => {
    const priceBox = document.querySelector<HTMLElement>(DETAIL_PRICE_SELECTOR)
    if (!priceBox) return
    const host = priceBox.parentElement?.parentElement?.parentElement ?? priceBox.parentElement ?? priceBox
    const id = `ozon-analytics-detail-${sku}`
    if (document.getElementById(id)) return

    const iframe = createAnalyticsIframe(id, 'detail', sku)
    host.prepend(iframe)
    initializeIframe(iframe, sku, readOzonCategoryPath)
  }

  const injectListAnalytics = (): void => {
    let insertionIndex = insertionTimers.size
    for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
      const sku = cardSku(card)
      if (!sku) continue

      const existing = card.querySelector<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR)
      if (existing?.dataset.sku === sku) {
        card.classList.add('has-analytics')
        card.classList.remove('loading-analytics')
        continue
      }
      if (existing) {
        existing.remove()
        card.classList.remove('has-analytics', 'loading-analytics')
      }
      if (insertionTimers.has(card)) continue

      card.classList.add('loading-analytics')
      const timer = schedule(() => {
        insertionTimers.delete(card)
        if (stopped || !card.isConnected || analyticsPageForUrl(window.location.href).kind !== 'list') {
          card.classList.remove('loading-analytics')
          return
        }
        if (cardSku(card) !== sku) {
          card.classList.remove('loading-analytics')
          scheduleReconcile()
          return
        }

        const iframe = createAnalyticsIframe(`ozon-analytics-lite-${sku}-${++frameSequence}`, 'lite', sku)
        card.append(iframe)
        card.classList.add('has-analytics')
        card.classList.remove('loading-analytics')
        initializeIframe(iframe, sku)
      }, insertionIndex * LIST_INSERT_DELAY_MS)
      insertionTimers.set(card, timer)
      insertionIndex += 1
    }
  }

  const reconcileNow = (): void => {
    if (stopped) return
    const page = analyticsPageForUrl(window.location.href)
    if (!samePage(previousPage, page)) {
      clearInsertionTimers()
      removeGeneratedFrames()
      previousPage = page
    }

    if (page.kind === 'detail') injectDetailAnalytics(page.sku)
    else if (page.kind === 'list') injectListAnalytics()
  }

  function scheduleReconcile(): void {
    if (stopped || reconcileTimer !== undefined) return
    reconcileTimer = schedule(() => {
      reconcileTimer = undefined
      reconcileNow()
    }, RECONCILE_DELAY_MS)
  }

  const observer = new MutationObserver((records) => {
    if (mutationsContainTarget(records, analyticsPageForUrl(window.location.href))) scheduleReconcile()
  })

  let controller: OzonAnalyticsCardsController
  const stop = (): void => {
    if (stopped) return
    stopped = true
    observer.disconnect()
    eventAbortController.abort()
    clearInsertionTimers()
    for (const timer of timers) window.clearTimeout(timer)
    timers.clear()
    reconcileTimer = undefined
    removeGeneratedFrames()
    sellerIdCache.clear()
    analyticsItemCache.clear()
    if (activeController === controller) activeController = undefined
  }

  controller = { reconcile: scheduleReconcile, stop }
  activeController = controller
  observer.observe(document.documentElement, { childList: true, subtree: true })
  reconcileNow()
  return controller
}
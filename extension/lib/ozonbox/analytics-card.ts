import {
  createAnalyticsIframe,
  renderAnalyticsItem,
  setAnalyticsStatus,
} from './analytics-view'
import { readOzonCategoryPath } from './collector'
import { analyticsCategoryName, fetchOzonAnalyticsItem, readOzonSellerId } from './seller-analytics'
import { SuccessfulRequestCache } from './successful-request-cache'
import { extractOzonProductId, isOzonProductUrl } from './url'
import {
  DEFAULT_OZON_CARD_VISIBILITY,
  type OzonCardVisibility,
  type OzonPanelState,
} from './panel-storage'

const LIST_CARD_SELECTOR = '.tile-root'
const DETAIL_PRICE_SELECTOR = 'div[data-widget="webSale"]'
const GENERATED_IFRAME_SELECTOR = 'iframe[data-ozonbox-analytics="true"], iframe[id^="ozon-analytics-"]'
const CARD_OPERATION_SELECTOR = '[data-ozonbox-card-operation="true"]'
const RECONCILE_DELAY_MS = 80
const LIST_INSERT_DELAY_MS = 900

export type OzonAnalyticsPage =
  | { kind: 'detail'; sku: string }
  | { kind: 'list' }
  | { kind: 'other' }

export interface OzonAnalyticsCardsController {
  reconcile: () => void
  getCardVisibility: () => OzonCardVisibility
  setListCardsHidden: (hidden: boolean) => Promise<void>
  setDetailCardsVisible: (visible: boolean) => Promise<void>
  stop: () => void
}

export interface OzonAnalyticsCardsOptions {
  initialState?: OzonPanelState
  persistCardVisibility?: (visibility: OzonCardVisibility) => Promise<void>
  onCardListing?: (context: OzonCardProductContext) => Promise<void>
}

export interface OzonCardProductContext {
  sku: string
  sourceUrl: string
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
    const pathname = url.pathname
    const listPrefixes = ['/category', '/highlight', '/seller', '/search', '/brand', '/publisher']
    if (pathname === '/' || pathname === '' || listPrefixes.some((prefix) => pathname.startsWith(prefix))) {
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

/** Read one exact, canonical Ozon PDP identity from a list card. */
export function cardProductContext(
  card: ParentNode,
  baseUrl = window.location.href,
): OzonCardProductContext | undefined {
  for (const anchor of card.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')
    if (!href) continue
    try {
      const url = new URL(href, baseUrl)
      const sku = extractOzonProductId(url.href)
      if (!sku || !isOzonProductUrl(url.href)) continue
      url.search = ''
      url.hash = ''
      return { sku, sourceUrl: url.href }
    } catch {
      // Non-URL card actions are not product identities.
    }
  }
  return undefined
}

/** Start one idempotent, mutation-driven Ozon analytics enhancement lifecycle. */
export function startOzonAnalyticsCards(options: OzonAnalyticsCardsOptions = {}): OzonAnalyticsCardsController {
  activeController?.stop()

  let stopped = false
  let previousPage: OzonAnalyticsPage | undefined
  let reconcileTimer: number | undefined
  let frameSequence = 0
  let cardVisibility: OzonCardVisibility = options.initialState
    ? {
        listCardsHidden: options.initialState.listCardsHidden,
        detailCardsVisible: options.initialState.detailCardsVisible,
      }
    : { ...DEFAULT_OZON_CARD_VISIBILITY }
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
      card.querySelector(CARD_OPERATION_SELECTOR)?.remove()
    }
  }

  const removeFramesByType = (type: 'detail' | 'lite'): void => {
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR)) {
      if (iframe.dataset.type === type) iframe.remove()
    }
    if (type === 'lite') {
      for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
        card.classList.remove('has-analytics', 'loading-analytics')
      }
    }
  }

  const injectCardOperation = (card: HTMLElement, context: OzonCardProductContext): void => {
    const existing = card.querySelector<HTMLElement>(CARD_OPERATION_SELECTOR)
    if (existing?.dataset.sku === context.sku && existing.dataset.sourceUrl === context.sourceUrl) return
    existing?.remove()

    const operation = document.createElement('div')
    operation.dataset.ozonboxCardOperation = 'true'
    operation.dataset.sku = context.sku
    operation.dataset.sourceUrl = context.sourceUrl
    operation.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;'
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '一键上架'
    button.style.cssText = 'min-height:30px;padding:4px 14px;border:1px solid #1677ff;border-radius:9999px;background:#1677ff;color:#fff;font:500 13px/20px inherit;cursor:pointer;'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.style.cssText = 'min-width:0;color:#cf1322;font-size:12px;line-height:18px;word-break:break-word;'
    operation.append(button, status)
    card.append(operation)

    button.addEventListener('click', () => {
      if (button.disabled) return
      button.disabled = true
      button.setAttribute('aria-busy', 'true')
      button.textContent = '采集中...'
      status.textContent = ''
      void Promise.resolve(options.onCardListing?.(context))
        .catch((error: unknown) => {
          if (operation.isConnected) status.textContent = errorMessage(error)
        })
        .finally(() => {
          if (!operation.isConnected) return
          button.disabled = false
          button.setAttribute('aria-busy', 'false')
          button.textContent = '一键上架'
        })
    }, { signal: eventAbortController.signal })
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

  const reconcileListCards = (analyticsVisible: boolean): void => {
    let insertionIndex = insertionTimers.size
    for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
      const context = cardProductContext(card)
      if (!context) {
        card.querySelector(CARD_OPERATION_SELECTOR)?.remove()
        continue
      }
      const { sku } = context
      injectCardOperation(card, context)

      const existing = card.querySelector<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR)
      if (!analyticsVisible) {
        existing?.remove()
        card.classList.remove('has-analytics', 'loading-analytics')
        continue
      }
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
        if (
          stopped
          || cardVisibility.listCardsHidden
          || !card.isConnected
          || analyticsPageForUrl(window.location.href).kind !== 'list'
        ) {
          card.classList.remove('loading-analytics')
          return
        }
        const currentContext = cardProductContext(card)
        if (currentContext?.sku !== sku || currentContext.sourceUrl !== context.sourceUrl) {
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

    if (page.kind === 'detail' && cardVisibility.detailCardsVisible) injectDetailAnalytics(page.sku)
    else if (page.kind === 'list') reconcileListCards(!cardVisibility.listCardsHidden)
  }

  function scheduleReconcile(): void {
    if (stopped || reconcileTimer !== undefined) return
    reconcileTimer = schedule(() => {
      reconcileTimer = undefined
      reconcileNow()
    }, RECONCILE_DELAY_MS)
  }

  const observer = new MutationObserver((records) => {
    const page = analyticsPageForUrl(window.location.href)
    const enabled = page.kind === 'list' || (page.kind === 'detail' && cardVisibility.detailCardsVisible)
    if (enabled && mutationsContainTarget(records, page)) scheduleReconcile()
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

  const persistVisibility = async (): Promise<void> => {
    await options.persistCardVisibility?.({ ...cardVisibility })
  }

  const setListCardsHidden = async (hidden: boolean): Promise<void> => {
    cardVisibility = { ...cardVisibility, listCardsHidden: hidden }
    clearInsertionTimers()
    if (hidden) removeFramesByType('lite')
    else reconcileNow()
    await persistVisibility()
  }

  const setDetailCardsVisible = async (visible: boolean): Promise<void> => {
    cardVisibility = { ...cardVisibility, detailCardsVisible: visible }
    if (!visible) removeFramesByType('detail')
    else reconcileNow()
    await persistVisibility()
  }

  controller = {
    reconcile: scheduleReconcile,
    getCardVisibility: () => ({ ...cardVisibility }),
    setListCardsHidden,
    setDetailCardsVisible,
    stop,
  }
  activeController = controller
  observer.observe(document.documentElement, { childList: true, subtree: true })
  reconcileNow()
  return controller
}
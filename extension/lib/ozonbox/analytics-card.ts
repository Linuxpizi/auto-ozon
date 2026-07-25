import {
  createAnalyticsIframe,
  renderAnalyticsItem,
  setAnalyticsStatus,
} from './analytics-view'
import type { PackagePhysicalSnapshot } from '../utils/types'
import {
  requireCardListingPackageFacts,
  requireCompleteCardPackageFacts,
} from './card-listing-product'
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
const LIST_BATCH_SIZE = 4
const LIST_BATCH_DELAY_MS = 300
const OZON_STOREFRONT_HOSTS = new Set(['ozon.ru', 'www.ozon.ru', 'm.ozon.ru'])

export type OzonAnalyticsPage =
  | { kind: 'detail'; sku: string }
  | { kind: 'list' }
  | { kind: 'other' }

export interface OzonAnalyticsCardsController {
  reconcile: () => void
  getCardVisibility: () => OzonCardVisibility
  requireDisplayedPackageFacts: (sku: string, sourceUrl?: string) => PackagePhysicalSnapshot
  setListCardsHidden: (hidden: boolean) => Promise<void>
  setDetailCardsVisible: (visible: boolean) => Promise<void>
  stop: () => void
}

export interface OzonAnalyticsCardsOptions {
  initialState?: OzonPanelState
  persistCardVisibility?: (visibility: OzonCardVisibility) => Promise<void>
  onCardListing?: (context: OzonCardProductContext) => Promise<void>
  onCardProfit?: (context: OzonCardProductContext) => Promise<void>
  onCardPricing?: (context: OzonCardProductContext) => Promise<void>
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

interface PendingListInsertion {
  timer: number
  context: OzonCardProductContext
}

interface DisplayedPackageSnapshot {
  iframe: HTMLIFrameElement
  facts: PackagePhysicalSnapshot
}

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

function loadAnalyticsItem(sku: string, forceRefresh = false): Promise<{
  shopId: string
  item: Awaited<ReturnType<typeof fetchOzonAnalyticsItem>>
}> {
  return resolveSellerId(forceRefresh).then(async (shopId) => ({
    shopId,
    item: await analyticsItemCache.get(
      `${shopId}:${sku}`,
      () => fetchOzonAnalyticsItem(sku, shopId),
      forceRefresh,
    ),
  }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ozon analytics 加载失败'
}

function sameCardProductContext(
  left: OzonCardProductContext | undefined,
  right: OzonCardProductContext | undefined,
): boolean {
  return Boolean(left && right && left.sku === right.sku && left.sourceUrl === right.sourceUrl)
}

function iframeHasCurrentIdentity(iframe: HTMLIFrameElement, sku: string): boolean {
  if (!iframe.isConnected || iframe.dataset.sku !== sku) return false
  if (iframe.dataset.type !== 'lite') return true
  const card = iframe.closest<HTMLElement>(LIST_CARD_SELECTOR)
  const frameContext = iframe.dataset.sourceUrl
    ? { sku: iframe.dataset.sku, sourceUrl: iframe.dataset.sourceUrl }
    : undefined
  return Boolean(card && sameCardProductContext(frameContext, cardProductContext(card)))
}

function updateAnalyticsIframe(
  iframe: HTMLIFrameElement,
  sku: string,
  forceRefresh = false,
  categoryFallback?: () => string | undefined,
  onRendered?: (
    iframe: HTMLIFrameElement,
    sku: string,
    item: NonNullable<Awaited<ReturnType<typeof fetchOzonAnalyticsItem>>>,
  ) => void,
): Promise<void> {
  const activeRequest = iframeRequests.get(iframe)
  if (activeRequest) return activeRequest

  setAnalyticsStatus(iframe, '加载中...')
  const request = loadAnalyticsItem(sku, forceRefresh)
    .then(({ shopId, item }) => {
      if (!iframeHasCurrentIdentity(iframe, sku)) return
      if (!item) {
        setAnalyticsStatus(iframe, `暂无数据（店铺ID: ${shopId}）`)
        return
      }

      const categoryName = analyticsCategoryName(item) ?? categoryFallback?.()
      renderAnalyticsItem(iframe, categoryName ? { ...item, categoryName } : item)
      onRendered?.(iframe, sku, item)
    })
    .catch((error: unknown) => {
      if (iframeHasCurrentIdentity(iframe, sku)) setAnalyticsStatus(iframe, errorMessage(error))
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

function generatedExtensionNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  return node.matches(`${GENERATED_IFRAME_SELECTOR}, ${CARD_OPERATION_SELECTOR}`)
    || Boolean(node.closest(`${GENERATED_IFRAME_SELECTOR}, ${CARD_OPERATION_SELECTOR}`))
}

function mutationsContainTarget(records: MutationRecord[], page: OzonAnalyticsPage): boolean {
  if (page.kind === 'detail') {
    return records.some((record) => (
      Array.from(record.addedNodes).some((node) => nodeContainsSelector(node, DETAIL_PRICE_SELECTOR))
    ))
  }
  if (page.kind !== 'list') return false

  return records.some((record) => {
    if (record.type === 'attributes') {
      return record.attributeName === 'href'
        && record.target instanceof Element
        && record.target.matches('a[href]')
        && Boolean(record.target.closest(LIST_CARD_SELECTOR))
        && !generatedExtensionNode(record.target)
    }
    if (generatedExtensionNode(record.target)) return false
    const changedNodes = [...record.addedNodes, ...record.removedNodes]
    if (changedNodes.some((node) => nodeContainsSelector(node, LIST_CARD_SELECTOR))) return true
    if (!(record.target instanceof Element) || !record.target.closest(LIST_CARD_SELECTOR)) return false
    return changedNodes.some((node) => !generatedExtensionNode(node))
  })
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
      if (
        !sku
        || !/^[1-9]\d*$/.test(sku)
        || !OZON_STOREFRONT_HOSTS.has(url.hostname.toLowerCase())
        || !isOzonProductUrl(url.href)
      ) continue
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
  const insertionTimers = new Map<HTMLElement, PendingListInsertion>()
  const displayedPackageFacts = new Map<string, DisplayedPackageSnapshot>()
  const eventAbortController = new AbortController()

  const displayedFactsKey = (sku: string, sourceUrl?: string): string => (
    sourceUrl ? `list:${sku}:${sourceUrl}` : `detail:${sku}`
  )

  const recordDisplayedPackageFacts = (
    iframe: HTMLIFrameElement,
    sku: string,
    item: NonNullable<Awaited<ReturnType<typeof fetchOzonAnalyticsItem>>>,
  ): void => {
    const sourceUrl = iframe.dataset.type === 'lite' ? iframe.dataset.sourceUrl : undefined
    if (iframe.dataset.type === 'lite' && !sourceUrl) {
      throw new Error(`商品卡片 SKU ${sku} 缺少来源页面身份`)
    }
    displayedPackageFacts.set(
      displayedFactsKey(sku, sourceUrl),
      {
        iframe,
        facts: requireCardListingPackageFacts(item, sku),
      },
    )
  }

  const requireDisplayedPackageFacts = (sku: string, sourceUrl?: string): PackagePhysicalSnapshot => {
    if (!/^[1-9]\d*$/.test(sku)) throw new Error('商品分析卡片缺少有效 SKU')
    const snapshot = displayedPackageFacts.get(displayedFactsKey(sku, sourceUrl))
    if (!snapshot) throw new Error(`商品分析卡片 SKU ${sku} 缺少已展示的包装长宽高重量事实`)

    const { iframe, facts } = snapshot
    const isCurrentFrame = iframeHasCurrentIdentity(iframe, sku)
      && (sourceUrl
        ? iframe.dataset.type === 'lite' && iframe.dataset.sourceUrl === sourceUrl
        : iframe.dataset.type === 'detail')
    if (!isCurrentFrame) throw new Error(`商品分析卡片 SKU ${sku} 尚未成功展示`)
    return requireCompleteCardPackageFacts(facts, sku)
  }

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
    for (const [card, pending] of insertionTimers) {
      cancelTimer(pending.timer)
      card.classList.remove('loading-analytics')
    }
    insertionTimers.clear()
  }

  const cancelListInsertion = (card: HTMLElement): void => {
    const pending = insertionTimers.get(card)
    if (!pending) return
    cancelTimer(pending.timer)
    insertionTimers.delete(card)
    card.classList.remove('loading-analytics')
  }

  const listFrames = (card: HTMLElement): HTMLIFrameElement[] => (
    Array.from(card.querySelectorAll<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR))
  )

  const clearListCard = (card: HTMLElement, removeOperation: boolean): void => {
    cancelListInsertion(card)
    for (const iframe of listFrames(card)) iframe.remove()
    if (removeOperation) {
      for (const operation of card.querySelectorAll(CARD_OPERATION_SELECTOR)) operation.remove()
    }
    card.classList.remove('has-analytics', 'loading-analytics')
  }

  const removeGeneratedFrames = (): void => {
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>(GENERATED_IFRAME_SELECTOR)) {
      iframe.remove()
    }
    for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
      card.classList.remove('has-analytics', 'loading-analytics')
      for (const operation of card.querySelectorAll(CARD_OPERATION_SELECTOR)) operation.remove()
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
    const operations = Array.from(card.querySelectorAll<HTMLElement>(CARD_OPERATION_SELECTOR))
    const existing = operations.find((operation) => (
      operation.dataset.sku === context.sku && operation.dataset.sourceUrl === context.sourceUrl
    ))
    for (const operation of operations) {
      if (operation !== existing) operation.remove()
    }
    if (existing) return

    const operation = document.createElement('div')
    operation.dataset.ozonboxCardOperation = 'true'
    operation.dataset.sku = context.sku
    operation.dataset.sourceUrl = context.sourceUrl
    operation.setAttribute('aria-label', '鲸智 AI 商品操作')
    operation.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0;padding:7px 8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.style.cssText = 'display:none;flex:1 0 100%;min-width:0;color:#cf1322;font-size:12px;line-height:18px;word-break:break-word;'

    const createCardAction = (
      action: 'listing' | 'profit' | 'pricing',
      idleText: string,
      busyText: string,
      color: string,
      callback: ((context: OzonCardProductContext) => Promise<void>) | undefined,
    ): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = action
      button.textContent = idleText
      button.title = idleText
      button.setAttribute('aria-label', idleText)
      button.setAttribute('aria-busy', 'false')
      button.style.cssText = `min-height:28px;padding:3px 10px;border:1px solid ${color};border-radius:9999px;background:${color};color:#fff;font:500 12px/20px inherit;white-space:nowrap;cursor:pointer;transition:filter .2s,opacity .2s;`
      button.addEventListener('click', () => {
        if (button.disabled) return
        button.disabled = true
        button.setAttribute('aria-busy', 'true')
        button.textContent = busyText
        button.style.opacity = '.68'
        status.textContent = ''
        status.style.display = 'none'
        void Promise.resolve(callback?.(context))
          .catch((error: unknown) => {
            if (!operation.isConnected) return
            status.textContent = errorMessage(error)
            status.style.display = 'block'
          })
          .finally(() => {
            if (!operation.isConnected) return
            button.disabled = false
            button.setAttribute('aria-busy', 'false')
            button.textContent = idleText
            button.style.opacity = '1'
          })
      }, { signal: eventAbortController.signal })
      return button
    }

    const listingButton = createCardAction('listing', '一键上架', '采集中...', '#ff4d4f', options.onCardListing)
    const profitButton = createCardAction('profit', '计算利润', '计算中...', '#1677ff', options.onCardProfit)
    const pricingButton = createCardAction('pricing', '定价工具', '加载中...', '#d48806', options.onCardPricing)
    operation.append(listingButton, profitButton, pricingButton, status)
    card.append(operation)
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
      void updateAnalyticsIframe(iframe, sku, false, categoryFallback, recordDisplayedPackageFacts)
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
    for (const card of insertionTimers.keys()) {
      if (!card.isConnected) cancelListInsertion(card)
    }
    let insertionIndex = insertionTimers.size
    for (const card of document.querySelectorAll<HTMLElement>(LIST_CARD_SELECTOR)) {
      const context = cardProductContext(card)
      if (!context) {
        clearListCard(card, true)
        continue
      }
      const { sku } = context
      injectCardOperation(card, context)

      const frames = listFrames(card)
      if (!analyticsVisible) {
        clearListCard(card, false)
        continue
      }
      const existing = frames.find((iframe) => (
        iframe.dataset.type === 'lite'
        && iframe.dataset.sku === sku
        && iframe.dataset.sourceUrl === context.sourceUrl
      ))
      for (const iframe of frames) {
        if (iframe !== existing) iframe.remove()
      }
      if (existing) {
        cancelListInsertion(card)
        card.classList.add('has-analytics')
        card.classList.remove('loading-analytics')
        continue
      }
      card.classList.remove('has-analytics')

      const pending = insertionTimers.get(card)
      if (pending && sameCardProductContext(pending.context, context)) continue
      if (pending) {
        cancelListInsertion(card)
        insertionIndex = insertionTimers.size
      }

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

        const iframe = createAnalyticsIframe(
          `ozon-analytics-lite-${sku}-${++frameSequence}`,
          'lite',
          sku,
          context.sourceUrl,
        )
        card.append(iframe)
        card.classList.add('has-analytics')
        card.classList.remove('loading-analytics')
        initializeIframe(iframe, sku)
      }, Math.floor(insertionIndex / LIST_BATCH_SIZE) * LIST_BATCH_DELAY_MS)
      insertionTimers.set(card, { timer, context })
      insertionIndex += 1
    }
  }

  const reconcileNow = (): void => {
    if (stopped) return
    const page = analyticsPageForUrl(window.location.href)
    if (!samePage(previousPage, page)) {
      clearInsertionTimers()
      removeGeneratedFrames()
      displayedPackageFacts.clear()
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
    displayedPackageFacts.clear()
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
    if (hidden) {
      removeFramesByType('lite')
      displayedPackageFacts.clear()
    }
    else reconcileNow()
    await persistVisibility()
  }

  const setDetailCardsVisible = async (visible: boolean): Promise<void> => {
    cardVisibility = { ...cardVisibility, detailCardsVisible: visible }
    if (!visible) {
      removeFramesByType('detail')
      displayedPackageFacts.clear()
    }
    else reconcileNow()
    await persistVisibility()
  }

  controller = {
    reconcile: scheduleReconcile,
    getCardVisibility: () => ({ ...cardVisibility }),
    requireDisplayedPackageFacts,
    setListCardsHidden,
    setDetailCardsVisible,
    stop,
  }
  activeController = controller
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  })
  reconcileNow()
  return controller
}
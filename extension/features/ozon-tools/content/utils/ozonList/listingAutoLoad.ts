import { isOzonListLikePage, resolveOzonPageType } from './ozonPageContext'
import { shouldBlockListLoad } from '../ozonBatchCrawl/crawlController'

const CARD_SELECTOR = '.mjgd_ozon_sku_card, .e1fbcs, #e1fbcs'
const DEBOUNCE_MS = 100
const MAX_WAIT_MS = 800
const INIT_DELAY_MS = 800

const PRODUCT_CONTAINER_SELECTORS = [
  'div[data-widget="megaPaginator"]',
  'div[data-widget="searchResultsV2"]',
  'div[data-widget="container"]',
  'div[data-widget="shopInShopContainer"]',
  'div[data-widget="infiniteVirtualPaginator"]',
]

export type ListingLoadRunner = (isInitial: boolean) => void

let autoLoadLockToken = 0
let listingAutoLoadPending = false
let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null
let observerMaxWaitTimer: ReturnType<typeof setTimeout> | null = null
let initTimer: ReturnType<typeof setTimeout> | null = null
let followUpTimer4s: ReturnType<typeof setTimeout> | null = null
let followUpTimer6s: ReturnType<typeof setTimeout> | null = null

let mutationObserver: MutationObserver | null = null
let listingIntersectionObserver: IntersectionObserver | null = null
let listingIoObserved = new WeakSet<Element>()
let listingScrollRaf = 0
let listingScrollAncestorsBound = new WeakSet<Element>()
let listingWindowScrollBound = false

let isOzonListIdleRef: () => boolean = () => true
let runListingLoadRef: ListingLoadRunner = () => {}

export function configureListingAutoLoad(options: {
  isIdle: () => boolean
  runLoad: ListingLoadRunner
}) {
  isOzonListIdleRef = options.isIdle
  runListingLoadRef = options.runLoad
}

export function markListingAutoLoadPending() {
  listingAutoLoadPending = true
}

export function flushListingAutoLoadPending() {
  if (!listingAutoLoadPending) return
  if (!isOzonListLikePage(resolveOzonPageType())) return
  if (shouldBlockListLoad()) return
  listingAutoLoadPending = false
  const token = autoLoadLockToken
  runListingLoadRef(false)
  void token
}

function getProductContainer(): Element | null {
  for (const selector of PRODUCT_CONTAINER_SELECTORS) {
    const container = document.querySelector(selector)
    if (container) return container
  }
  return null
}

function isInsideListingPluginCard(el: Element | null): boolean {
  if (!el?.closest) return false
  return !!el.closest(`${CARD_SELECTOR}, #cj_move_page, #bcs-follow-seller-popup`)
}

function findClosestListingScrollRoot(fromEl: Element | null): Element | null {
  let el: Element | null = fromEl
  while (el && el !== document.documentElement) {
    try {
      const st = window.getComputedStyle(el)
      const oy = st.overflowY
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        el.scrollHeight > el.clientHeight + 4
      ) {
        if (el === document.body || el === document.documentElement) return null
        return el
      }
    } catch {
      // ignore
    }
    el = el.parentElement
  }
  return null
}

function collectListingScrollAncestors(fromEl: Element | null): Element[] {
  const out: Element[] = []
  const seen = new WeakSet<Element>()
  let el: Element | null = fromEl
  while (el && el !== document.documentElement) {
    try {
      const st = window.getComputedStyle(el)
      const oy = st.overflowY
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        el.scrollHeight > el.clientHeight + 4
      ) {
        if (!seen.has(el)) {
          seen.add(el)
          out.push(el)
        }
      }
    } catch {
      // ignore
    }
    el = el.parentElement
  }
  return out
}

function elementHasOzonListingProductLink(el: Element): boolean {
  if (el.nodeType !== Node.ELEMENT_NODE) return false
  if (isInsideListingPluginCard(el)) return false
  if (
    el instanceof HTMLAnchorElement &&
    el.href &&
    el.href.includes('product') &&
    el.querySelector('img')
  ) {
    return true
  }
  const links = el.querySelectorAll('a[href*="product"]')
  for (const ln of links) {
    if (isInsideListingPluginCard(ln)) continue
    if (ln.querySelector('img')) return true
  }
  return false
}

function createListingIntersectionObserver(scrollRoot: Element | null) {
  if (listingIntersectionObserver) {
    try {
      listingIntersectionObserver.disconnect()
    } catch {
      // ignore
    }
    listingIoObserved = new WeakSet()
  }
  listingIntersectionObserver = new IntersectionObserver(
    (entries) => {
      let hit = false
      for (const en of entries) {
        if (en.isIntersecting) {
          try {
            listingIntersectionObserver?.unobserve(en.target)
          } catch {
            // ignore
          }
          hit = true
        }
      }
      if (hit) triggerLoadWithDebounce(false)
    },
    {
      root: scrollRoot,
      rootMargin: '480px 0px 360px 0px',
      threshold: 0,
    },
  )
}

function registerListingLinksForIntersection(scopeRoot: Element | null) {
  if (!scopeRoot || scopeRoot.nodeType !== Node.ELEMENT_NODE) return
  if (!listingIntersectionObserver) return
  if (isInsideListingPluginCard(scopeRoot)) return

  let anchors: NodeListOf<HTMLAnchorElement>
  try {
    anchors = scopeRoot.querySelectorAll('a[href*="product"]')
  } catch {
    return
  }

  for (const a of anchors) {
    if (!(a instanceof HTMLAnchorElement)) continue
    if (isInsideListingPluginCard(a)) continue
    const hrefAttr = a.getAttribute('href') || ''
    if (!hrefAttr.includes('product')) continue
    if (!a.querySelector('img')) continue
    if (listingIoObserved.has(a)) continue
    listingIoObserved.add(a)
    try {
      listingIntersectionObserver.observe(a)
    } catch {
      // ignore
    }
  }
}

function runListingAutoLoad(tokenAtSchedule: number, isInitial: boolean) {
  observerDebounceTimer = null
  if (observerMaxWaitTimer) {
    clearTimeout(observerMaxWaitTimer)
    observerMaxWaitTimer = null
  }
  if (tokenAtSchedule !== autoLoadLockToken) return

  if (shouldBlockListLoad()) {
    if (!isInitial) listingAutoLoadPending = true
    return
  }

  const canRun = isInitial || isOzonListIdleRef()

  if (canRun) {
    listingAutoLoadPending = false
    runListingLoadRef(isInitial)
  } else if (!isInitial) {
    listingAutoLoadPending = true
  }
}

function triggerLoadWithDebounce(isInitial: boolean) {
  const tokenAtSchedule = autoLoadLockToken
  if (isInitial) {
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer)
    if (observerMaxWaitTimer) {
      clearTimeout(observerMaxWaitTimer)
      observerMaxWaitTimer = null
    }
    observerDebounceTimer = setTimeout(() => {
      runListingAutoLoad(tokenAtSchedule, true)
    }, DEBOUNCE_MS)
    return
  }

  if (observerMaxWaitTimer == null) {
    observerMaxWaitTimer = setTimeout(() => {
      observerMaxWaitTimer = null
      if (observerDebounceTimer) {
        clearTimeout(observerDebounceTimer)
        observerDebounceTimer = null
      }
      runListingAutoLoad(tokenAtSchedule, false)
    }, MAX_WAIT_MS)
  }

  if (observerDebounceTimer) clearTimeout(observerDebounceTimer)
  observerDebounceTimer = setTimeout(() => {
    if (observerMaxWaitTimer) {
      clearTimeout(observerMaxWaitTimer)
      observerMaxWaitTimer = null
    }
    runListingAutoLoad(tokenAtSchedule, false)
  }, DEBOUNCE_MS)
}

function bumpListingOnScroll() {
  if (listingScrollRaf) return
  listingScrollRaf = requestAnimationFrame(() => {
    listingScrollRaf = 0
    const container = getProductContainer()
    if (container) registerListingLinksForIntersection(container)
    registerListingLinksForIntersection(document.body)
    triggerLoadWithDebounce(false)
  })
}

function bindListingScrollBumps(container: Element | null) {
  if (!listingWindowScrollBound) {
    listingWindowScrollBound = true
    window.addEventListener('scroll', bumpListingOnScroll, { passive: true })
  }
  const ancestors = container ? collectListingScrollAncestors(container) : []
  for (const node of ancestors) {
    if (listingScrollAncestorsBound.has(node)) continue
    listingScrollAncestorsBound.add(node)
    node.addEventListener('scroll', bumpListingOnScroll, { passive: true })
  }
}

function clearListingAutoLoadTimers() {
  if (observerDebounceTimer) {
    clearTimeout(observerDebounceTimer)
    observerDebounceTimer = null
  }
  if (observerMaxWaitTimer) {
    clearTimeout(observerMaxWaitTimer)
    observerMaxWaitTimer = null
  }
  if (initTimer) {
    clearTimeout(initTimer)
    initTimer = null
  }
  if (followUpTimer4s) {
    clearTimeout(followUpTimer4s)
    followUpTimer4s = null
  }
  if (followUpTimer6s) {
    clearTimeout(followUpTimer6s)
    followUpTimer6s = null
  }
}

/** 启动列表自动加载（对齐旧版 Mutation + IO + scroll + debounce） */
export function startListingAutoLoad() {
  if (mutationObserver) return
  if (!isOzonListLikePage(resolveOzonPageType())) return

  autoLoadLockToken += 1

  mutationObserver = new MutationObserver((mutations) => {
    let hasNewProducts = false
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const el = node as Element
        if (
          (el.classList?.contains('e1fbcs') || el.classList?.contains('mjgd_ozon_sku_card')) ||
          el.id === 'e1fbcs'
        ) {
          continue
        }
        registerListingLinksForIntersection(el)
        if (elementHasOzonListingProductLink(el)) hasNewProducts = true
      }
      if (hasNewProducts) break
    }
    if (hasNewProducts) triggerLoadWithDebounce(false)
  })

  initTimer = setTimeout(() => {
    initTimer = null
    const container = getProductContainer()
    const scrollRoot = findClosestListingScrollRoot(container || document.body)
    createListingIntersectionObserver(scrollRoot)

    mutationObserver?.observe(document.body, { childList: true, subtree: true })
    if (container) {
      registerListingLinksForIntersection(container)
      bindListingScrollBumps(container)
    } else {
      bindListingScrollBumps(null)
    }
    registerListingLinksForIntersection(document.body)
    bumpListingOnScroll()
    triggerLoadWithDebounce(true)
    followUpTimer4s = setTimeout(() => triggerLoadWithDebounce(true), 4000)
    followUpTimer6s = setTimeout(() => triggerLoadWithDebounce(true), 6000)
  }, INIT_DELAY_MS)
}

export function stopListingAutoLoad() {
  autoLoadLockToken += 1
  clearListingAutoLoadTimers()
  mutationObserver?.disconnect()
  mutationObserver = null
  if (listingIntersectionObserver) {
    try {
      listingIntersectionObserver.disconnect()
    } catch {
      // ignore
    }
    listingIntersectionObserver = null
  }
  listingIoObserved = new WeakSet()
  listingAutoLoadPending = false
}

/** 手动触发一次 debounced 加载（供菜单「加载更多」在 probe 通过后调用） */
export function triggerListingManualLoad() {
  triggerLoadWithDebounce(true)
}

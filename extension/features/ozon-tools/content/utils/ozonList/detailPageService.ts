import { applyCardFieldLayout } from '../ozonCardSettings/cardFieldStore'
import { applySelectionTagForCard, setCardGoodsData, setCardListPriceText } from '../ozonSelectionRules'
import { handleSkuLoadRestriction } from './freeMemberCard'
import { loadCardExtraData } from './loadCardExtraData'
import { loadCardFollowData } from './loadCardFollowData'
import { loadSkuData, OzonSkuLoadError } from './loadSkuData'
import { syncDetailPageRealPrice } from '../ozonProfitCalc/wiring'
import {
  insertOzonRealPriceBox,
  removeOzonRealPriceBox,
} from '../ozonProfitCalc/realPriceFloatBox'
import {
  extractDetailPageSku,
  extractDetailProductImage,
  findDetailCardHost,
  readDetailPriceText,
} from './detailPageContext'
import {
  bindCardCopyActions,
  fillCardWithData,
  markCardFillFailed,
  renderPlaceholderCard,
} from './skuCardRenderer'
import { clearSellerInfoCache, loadSellerInfoToCard, watchSellerInfoForCard } from './sellerInfo'
import { cacheSkuData } from './skuDataCache'
import type { OzonSkuCardData } from './types'

const HOST_RETRY_MS = 500
const HOST_RETRY_MAX = 40

let hostObserver: MutationObserver | null = null
let hostRetryTimer: ReturnType<typeof setInterval> | null = null
let activeSku: string | null = null
let cachedData: OzonSkuCardData | null = null
let loadToken = 0

function clearHostRetry() {
  if (hostRetryTimer) {
    clearInterval(hostRetryTimer)
    hostRetryTimer = null
  }
}

function disconnectHostObserver() {
  hostObserver?.disconnect()
  hostObserver = null
}

export function stopDetailPageCard() {
  clearHostRetry()
  disconnectHostObserver()
  removeOzonRealPriceBox()
  activeSku = null
  cachedData = null
  clearSellerInfoCache()
  loadToken += 1
}

async function loadAndFillCard(card: HTMLElement, sku: string, token: number) {
  setCardListPriceText(card, readDetailPriceText())
  if (cachedData && activeSku === sku) {
    fillCardWithData(card, cachedData)
    setCardGoodsData(card, cachedData)
    applySelectionTagForCard(card)
    void loadCardFollowData(card, sku)
    void loadCardExtraData(card, sku)
    return
  }

  try {
    const data = await loadSkuData(sku)
    if (token !== loadToken || !card.isConnected) return
    cachedData = data
    activeSku = sku
    // 对齐旧版 C.goodsSaleData.push(res.data)：详情主 SKU 也缓存，急速上架时间列能取到
    cacheSkuData(sku, data)
    fillCardWithData(card, cachedData)
    setCardGoodsData(card, cachedData)
    applySelectionTagForCard(card)
    void loadCardFollowData(card, sku)
    void loadCardExtraData(card, sku)
  } catch (e) {
    if (e instanceof OzonSkuLoadError && e.code === 403) throw e
    if (handleSkuLoadRestriction(card, e)) return
    markCardFillFailed(card)
    console.warn('[mjgd][ozonDetail] SKU 加载失败', sku, e)
  }
}

function ensureCardOnHost(host: HTMLElement, sku: string): HTMLElement | null {
  let card = host.querySelector<HTMLElement>('.mjgd_ozon_sku_card')
  if (card) return card

  const wrap = document.createElement('div')
  wrap.innerHTML = renderPlaceholderCard(sku, extractDetailProductImage(), { isDetail: true })
  card = wrap.firstElementChild as HTMLElement
  if (!card) return null

  host.appendChild(card)
  card.classList.add('mjgd_ozon_detail_card')
  setCardListPriceText(card, readDetailPriceText())
  bindCardCopyActions(card)
  applyCardFieldLayout(card)
  void loadSellerInfoToCard(card).then((filled) => {
    if (!filled && card.isConnected) watchSellerInfoForCard(card)
  })
  return card
}

async function injectDetailCard(sku: string): Promise<boolean> {
  const host = findDetailCardHost()
  if (!host) return false

  const card = ensureCardOnHost(host, sku)
  if (!card) return false

  const token = loadToken
  await loadAndFillCard(card, sku, token)
  // 详情页：反推绿/黑标真实价（卢布或人民币）同步给内嵌利润计算器
  syncDetailPageRealPrice(sku)
  // 对齐旧版 crawler.js getProduct 回调中的 insertOzonRealPriceBox：
  // setTimeout 0 推到下一个宏任务，避免抛错阻断主流程
  setTimeout(() => {
    try {
      insertOzonRealPriceBox()
    } catch (e) {
      console.warn('[mjgd][ozonDetail] insertOzonRealPriceBox 异常:', e)
    }
  }, 0)
  return true
}

function setupHostObserver(sku: string) {
  disconnectHostObserver()

  const webSale = document.querySelector('div[data-widget="webSale"]')
  const observeTarget = webSale?.parentElement?.parentElement || document.body

  hostObserver = new MutationObserver(() => {
    const host = findDetailCardHost()
    if (!host) return
    if (!host.querySelector('.mjgd_ozon_sku_card')) {
      void injectDetailCard(sku)
    }
  })

  hostObserver.observe(observeTarget, { childList: true, subtree: true })
}

function scheduleHostRetry(sku: string) {
  clearHostRetry()
  let attempts = 0
  hostRetryTimer = setInterval(() => {
    attempts += 1
    void injectDetailCard(sku).then((ok) => {
      if (ok) {
        clearHostRetry()
        setupHostObserver(sku)
      } else if (attempts >= HOST_RETRY_MAX) {
        clearHostRetry()
      }
    })
  }, HOST_RETRY_MS)
}

/** 详情页注入 SKU 数据卡片并监听 SPA 重渲染 */
function scheduleSkuWaitRetry() {
  clearHostRetry()
  let attempts = 0
  hostRetryTimer = setInterval(() => {
    attempts += 1
    const sku = extractDetailPageSku()
    if (!sku) {
      if (attempts >= HOST_RETRY_MAX) clearHostRetry()
      return
    }
    clearHostRetry()
    void startDetailPageCard()
  }, HOST_RETRY_MS)
}

export async function startDetailPageCard(): Promise<void> {
  const sku = extractDetailPageSku()
  if (!sku) {
    scheduleSkuWaitRetry()
    return
  }

  if (sku !== activeSku) {
    cachedData = null
    activeSku = sku
    clearSellerInfoCache()
  }

  const ok = await injectDetailCard(sku)
  if (ok) {
    setupHostObserver(sku)
    return
  }
  scheduleHostRetry(sku)
}

/** 供急速上架等读取详情页现价 */
export function getDetailPagePriceText(): string {
  return readDetailPriceText()
}

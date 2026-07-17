/** 详情页店铺 ID / 公司名称（对齐旧版 runSellerInfoFill） */

import { API_CONFIG } from '../../../utils/api-config'
import { apiService } from '../../../utils/api'

export interface CachedSellerInfo {
  id: string | null
  name: string | null
}

let cachedSellerInfo: CachedSellerInfo | null = null
const sellerInfoWaiters = new Set<(info: CachedSellerInfo | null) => void>()

function extractSellerNumber(href: string): string | null {
  const m = String(href || '').match(/seller\/(\d+)/i)
  return m?.[1] || null
}

/** 从 webCurrentSeller widget state 解析店铺 ID（对齐旧版 getSellerIdFromState） */
export function extractSellerIdFromWidgetState(): string | null {
  try {
    const sellerState = document.querySelector('[id*="state-webCurrentSeller"]') as HTMLElement | null
    if (!sellerState) return null

    const rawState = sellerState.dataset.state
    if (!rawState) return null

    let parsed: Record<string, unknown> | string = rawState
    if (typeof rawState === 'string') {
      try {
        parsed = JSON.parse(rawState) as Record<string, unknown>
      } catch {
        const match = rawState.match(/user_id=(\d+)/)
        if (match?.[1]) return match[1]
        return null
      }
    }

    if (typeof parsed === 'object' && parsed) {
      const chat = parsed.chat as { action?: { link?: string } } | undefined
      const chatMatch = chat?.action?.link?.match(/[&?]user_id=(\d+)/)
      if (chatMatch?.[1]) return chatMatch[1]

      const sellerCell = parsed.sellerCell as { common?: { action?: { link?: string } } } | undefined
      const cellMatch = sellerCell?.common?.action?.link?.match(/\/seller\/(\d+)/)
      if (cellMatch?.[1]) return cellMatch[1]
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 从页面 seller 链接解析店铺 ID */
export function extractSellerIdFromPage(): string | null {
  const fromState = extractSellerIdFromWidgetState()
  if (fromState) return fromState

  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/seller/"]')
  for (const a of links) {
    const id = extractSellerNumber(a.getAttribute('href') || '')
    if (id) return id
  }
  return null
}

/** 从 Ozon entrypoint widgetStates 解析公司名 */
export function parseCompanyNameFromWidgetStates(widgetStates: Record<string, string> | undefined): string | null {
  if (!widgetStates) return null
  for (const key of Object.keys(widgetStates)) {
    try {
      const widget = JSON.parse(widgetStates[key])
      if (widget?.body && Array.isArray(widget.body)) {
        for (const item of widget.body) {
          if (item?.type === 'textAtom' && item?.textAtom?.textStyle === 'tsBodyM') {
            const raw = String(item.textAtom.text || '').trim()
            if (raw) return raw.split('<br>')[0]
          }
        }
      }
    } catch {
      /* ignore malformed widget */
    }
  }
  return null
}

/** 拉取卖家公司名称（同域 fetch，复用页面 Cookie） */
export async function fetchSellerCompanyName(sellerId: string): Promise<string | null> {
  const host = window.location.hostname.includes('ozon.kz') ? 'https://ozon.kz' : 'https://www.ozon.ru'
  const path = `/modal/shop-in-shop-info?seller_id=${encodeURIComponent(sellerId)}&page_changed=true`
  const url = `${host}/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(path)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return parseCompanyNameFromWidgetStates(json?.widgetStates)
  } catch {
    return null
  }
}

/** 查看店铺商品流量：跳转本地管理端选品专区并按店铺过滤。 */
function buildShopTrafficUrl(shopId: string): string {
  const sid = encodeURIComponent(String(shopId || ''))
  let base = String(API_CONFIG.LOCAL_FRONTEND_URL || '').trim()
  try {
    // 仅取域名前缀，兼容 pcUrl 写成 https://xx.com/xxx
    base = new URL(base).origin
  } catch {
    base = base.replace(/\/+$/, '')
  }
  return `${base}/selectionZone/hotGoods?tab=Ozon官方&filterShopId=${sid}`
}

function resetCorpTranslateBtn(corpRow: Element | null) {
  const btn = corpRow?.querySelector<HTMLElement>('.corp-translate-btn')
  if (!btn) return
  btn.dataset.original = ''
  btn.dataset.translated = ''
  btn.dataset.state = 'original'
  delete btn.dataset.loading
  btn.style.opacity = ''
}

function applySellerInfoToCard(card: HTMLElement, info: CachedSellerInfo) {
  const shopIdEl = card.querySelector('.mjgd_ozon_field_shop_id')
  const corpEl = card.querySelector('.mjgd_ozon_field_corp_name')
  const trafficLink = card.querySelector<HTMLAnchorElement>('.mjgd_ozon_shop_traffic_link')
  const corpRow = card.querySelector('[data-field-key="corpName"]')

  if (shopIdEl) {
    shopIdEl.textContent = info.id || '--'
  }
  if (trafficLink) {
    if (info.id) {
      trafficLink.href = buildShopTrafficUrl(info.id)
      trafficLink.style.opacity = '1'
      trafficLink.style.pointerEvents = 'auto'
    } else {
      trafficLink.href = '#'
      trafficLink.style.opacity = '0.65'
      trafficLink.style.pointerEvents = 'none'
    }
  }
  if (corpEl) {
    corpEl.textContent = info.name || '--'
    resetCorpTranslateBtn(corpRow)
  }
}

function markSellerInfoFailed(card: HTMLElement) {
  const shopIdEl = card.querySelector('.mjgd_ozon_field_shop_id')
  const corpEl = card.querySelector('.mjgd_ozon_field_corp_name')
  const trafficLink = card.querySelector<HTMLAnchorElement>('.mjgd_ozon_shop_traffic_link')

  if (shopIdEl?.textContent?.includes('加载中')) shopIdEl.textContent = '--'
  if (corpEl?.textContent?.includes('加载中')) corpEl.textContent = '--'
  if (trafficLink) {
    trafficLink.href = '#'
    trafficLink.style.opacity = '0.65'
    trafficLink.style.pointerEvents = 'none'
  }
}

function notifySellerInfoWaiters(info: CachedSellerInfo | null) {
  sellerInfoWaiters.forEach((cb) => cb(info))
  sellerInfoWaiters.clear()
}

async function resolveSellerInfo(): Promise<CachedSellerInfo | null> {
  if (cachedSellerInfo?.id && cachedSellerInfo.name) {
    return cachedSellerInfo
  }

  const sellerId = extractSellerIdFromPage()
  if (!sellerId) return null

  if (cachedSellerInfo?.id === sellerId && cachedSellerInfo.name) {
    return cachedSellerInfo
  }

  cachedSellerInfo = { id: sellerId, name: cachedSellerInfo?.id === sellerId ? cachedSellerInfo.name : null }
  if (cachedSellerInfo.name) return cachedSellerInfo

  const name = await fetchSellerCompanyName(sellerId)
  cachedSellerInfo = { id: sellerId, name: name || null }
  return cachedSellerInfo
}

let sellerWatchObserver: MutationObserver | null = null
let sellerWatchTimer: ReturnType<typeof setTimeout> | null = null

/** 详情页 seller 信息晚于卡片注入时，监听 DOM 变化后重试填充 */
export function watchSellerInfoForCard(card: HTMLElement) {
  if (sellerWatchObserver) {
    sellerWatchObserver.disconnect()
    sellerWatchObserver = null
  }
  if (sellerWatchTimer) {
    clearTimeout(sellerWatchTimer)
    sellerWatchTimer = null
  }

  const tryFill = () => {
    if (!card.isConnected) {
      sellerWatchObserver?.disconnect()
      sellerWatchObserver = null
      return
    }
    void loadSellerInfoToCard(card).then((filled) => {
      if (filled || !card.isConnected) {
        sellerWatchObserver?.disconnect()
        sellerWatchObserver = null
      }
    })
  }

  sellerWatchObserver = new MutationObserver(() => {
    if (sellerWatchTimer) clearTimeout(sellerWatchTimer)
    sellerWatchTimer = setTimeout(tryFill, 300)
  })
  sellerWatchObserver.observe(document.body, { childList: true, subtree: true })

  // 最多等待 30 秒后停止监听
  setTimeout(() => {
    sellerWatchObserver?.disconnect()
    sellerWatchObserver = null
    if (!card.isConnected) return
    const shopIdEl = card.querySelector('.mjgd_ozon_field_shop_id')
    const corpEl = card.querySelector('.mjgd_ozon_field_corp_name')
    if (shopIdEl?.textContent?.includes('加载中') || corpEl?.textContent?.includes('加载中')) {
      markSellerInfoFailed(card)
    }
  }, 30000)
}

/** 填充卡片上的店铺 ID / 公司名称行；成功返回 true */
export async function loadSellerInfoToCard(card: HTMLElement): Promise<boolean> {
  if (!card.isConnected) return false

  const shopRow = card.querySelector('[data-field-key="shopId"]')
  const corpRow = card.querySelector('[data-field-key="corpName"]')
  if (!shopRow && !corpRow) return false

  if (cachedSellerInfo?.id && cachedSellerInfo.name) {
    applySellerInfoToCard(card, cachedSellerInfo)
    return true
  }

  const info = await resolveSellerInfo()
  if (!card.isConnected) return false

  if (!info?.id) {
    if (shopRow || corpRow) markSellerInfoFailed(card)
    return false
  }

  applySellerInfoToCard(card, info)
  if (!info.name) {
    markSellerInfoFailed(card)
    return false
  }

  notifySellerInfoWaiters(info)
  return true
}

/** 清除缓存（详情页 SKU 切换时调用） */
export function clearSellerInfoCache() {
  cachedSellerInfo = null
}

async function translateCompanyName(englishName: string): Promise<string | null> {
  try {
    const res = await apiService.request<{ code: number; msg?: string }>(
      '/system/ozonRecord/englishNameToChineseName',
      {
        method: 'GET',
        baseURL: API_CONFIG.LOCAL_API_BASE_URL,
        params: { englishName },
      },
    )
    if (res?.code !== 200) return null
    const val = String(res.msg || '').trim()
    return val || null
  } catch {
    return null
  }
}

let corpTranslateBound = false

/** 公司名称「译」按钮：英译中切换（对齐旧版 .corp-translate-btn） */
export function initCorpTranslateOnce() {
  if (corpTranslateBound) return
  corpTranslateBound = true

  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest?.('.corp-translate-btn') as HTMLElement | null
    if (!btn) return

    e.preventDefault()
    e.stopPropagation()

    if (btn.dataset.loading === '1') return

    const corpRow = btn.closest('[data-field-key="corpName"]')
    const corpEl = corpRow?.querySelector('.mjgd_ozon_field_corp_name')
    if (!corpEl) return

    const rawText = (corpEl.textContent || '').trim()
    if (!rawText || rawText === '暂无' || rawText === '--' || rawText.includes('加载中')) return

    let original = btn.dataset.original || ''
    let translated = btn.dataset.translated || ''
    let state = btn.dataset.state || 'original'

    if (rawText !== original && rawText !== translated) {
      original = rawText
      translated = ''
      state = 'original'
      btn.dataset.original = original
      btn.dataset.translated = ''
      btn.dataset.state = 'original'
    }

    if (state === 'translated') {
      corpEl.textContent = original
      btn.dataset.state = 'original'
      return
    }

    if (translated) {
      corpEl.textContent = translated
      btn.dataset.state = 'translated'
      return
    }

    btn.dataset.loading = '1'
    btn.style.opacity = '0.5'
    void translateCompanyName(original).then((val) => {
      btn.dataset.loading = '0'
      btn.style.opacity = '1'
      if (!val) return
      btn.dataset.translated = val
      corpEl.textContent = val
      btn.dataset.state = 'translated'
    })
  })
}

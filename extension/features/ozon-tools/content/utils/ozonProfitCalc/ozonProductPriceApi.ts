// 列表页：调 Ozon 商品详情 API 拿 webPrice 的 cardPrice / price / originalPrice
// 与旧插件 ozon_old/src/ozon/ozon/crawler.js 的 fetchSkuProductDetail + parseWebPriceFromWidgetStates 对齐：
//   - 绿标 = cardPrice（OZON Card 价）
//   - 黑标 = price（次档售价，不是 originalPrice 划线原价）
// 反推真实价后与详情页保持一致。

import { calculateOzonRealPrice, extractPriceUnit } from './realPriceCalc'
import { getCalcLocalPrefs } from './calcLocalPrefs'
import { notifyInlineProfitRealPrice } from './inlineProfitCalc'

function parsePriceNumber(text: string): number {
  if (text == null) return NaN
  let s = String(text)
    .trim()
    .replace(/[    ⁠]/g, '')
    .replace(/\s+/g, '')
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(?:,\d{3})+$/.test(s) || /^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '')
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

function pickWebPriceFieldValue(field: any): string {
  if (field == null || field === '') return ''
  if (typeof field === 'object') {
    if (field.price != null && field.price !== '') return String(field.price)
    if (field.text != null && field.text !== '') return String(field.text)
    if (field.value != null && field.value !== '') return String(field.value)
    return ''
  }
  return String(field)
}

/**
 * 与详情页 webSale 对齐：绿标=OZON 卡价(cardPrice)；黑标=次档售价(price)，不用划线原价(originalPrice)。
 */
export function parseGreenBlackFromWebPriceState(st: any): { greenText: string; blackText: string } {
  let greenText = ''
  let blackText = ''
  if (!st || typeof st !== 'object') return { greenText, blackText }

  const cardText = pickWebPriceFieldValue(st.cardPrice)
  const priceText = pickWebPriceFieldValue(st.price)
  const originalText = pickWebPriceFieldValue(st.originalPrice)
  const cardNum = parsePriceNumber(cardText) || 0
  const priceNum = parsePriceNumber(priceText) || 0
  const originalNum = parsePriceNumber(originalText) || 0

  if (cardNum > 0) {
    greenText = cardText
    if (priceNum > cardNum) {
      blackText = priceText
    }
  } else if (priceNum > 0) {
    greenText = priceText
    if (originalNum > priceNum) {
      blackText = originalText
    }
  } else if (originalNum > 0) {
    greenText = originalText
  }

  return { greenText, blackText }
}

function parseWebPriceFromWidgetStates(
  widgetStates: Record<string, string | object>,
): { greenText: string; blackText: string; webPriceState: any } {
  let greenText = ''
  let blackText = ''
  let webPriceState: any = null
  if (!widgetStates) return { greenText, blackText, webPriceState }

  const keys = Object.keys(widgetStates)
  // 优先选同时有绿标+黑标的完整 widget
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('webPrice') === -1) continue
    try {
      const raw = widgetStates[keys[i]]
      const st = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!st) continue
      const pair = parseGreenBlackFromWebPriceState(st)
      if (pair.greenText && pair.blackText) {
        greenText = pair.greenText
        blackText = pair.blackText
        webPriceState = st
        break
      }
      if (pair.greenText && !greenText) {
        greenText = pair.greenText
        blackText = pair.blackText
        webPriceState = st
      }
    } catch {
      /* ignore */
    }
  }
  return { greenText, blackText, webPriceState }
}

function mapCurrencyCodeToUnit(code: any): string {
  if (code == null || code === '') return ''
  const c = String(code).trim()
  if (/^₽|руб/i.test(c)) return '₽'
  if (/^¥|￥/.test(c)) return '¥'
  if (/^\$|＄|﹩/.test(c)) return '$'
  if (/^€/.test(c)) return '€'
  const upper = c.toUpperCase()
  if (upper === 'RUB' || upper === 'RUR') return '₽'
  if (upper === 'CNY' || upper === 'RMB') return '¥'
  if (upper === 'USD') return '$'
  if (upper === 'EUR') return '€'
  if (upper === 'KZT') return '₸'
  if (upper === 'BYN') return 'Br'
  return ''
}

function resolveUnitFromWebPriceState(st: any): string {
  if (!st || typeof st !== 'object') return ''
  const fields = [
    st.currency,
    st.currencyCode,
    st.priceCurrency,
    st.currencySign,
    st.currencySymbol,
    st.symbol,
    st.localCurrency,
    st.currencyName,
  ]
  for (let fi = 0; fi < fields.length; fi++) {
    const mapped = mapCurrencyCodeToUnit(fields[fi])
    if (mapped) return mapped
    const fromText = extractPriceUnit(String(fields[fi] == null ? '' : fields[fi]))
    if (fromText) return fromText
  }
  if (st.cardPrice && typeof st.cardPrice === 'object') {
    const nested = resolveUnitFromWebPriceState(st.cardPrice)
    if (nested) return nested
  }
  if (st.price && typeof st.price === 'object') {
    const nested = resolveUnitFromWebPriceState(st.price)
    if (nested) return nested
  }
  return ''
}

function resolveListPriceUnit(greenText: string, blackText: string, webPriceState: any): string {
  let unit = extractPriceUnit(greenText) || extractPriceUnit(blackText)
  if (unit) return unit
  if (webPriceState) {
    unit =
      extractPriceUnit(pickWebPriceFieldValue(webPriceState.cardPrice)) ||
      extractPriceUnit(pickWebPriceFieldValue(webPriceState.price)) ||
      extractPriceUnit(pickWebPriceFieldValue(webPriceState.originalPrice))
    if (unit) return unit
  }
  unit = resolveUnitFromWebPriceState(webPriceState)
  if (unit) return unit
  return '₽'
}

// ---------- 公开入口 ----------

const _listSkuDetailCache = new Map<string, Promise<boolean>>()
const _greenBlackPairCache = new Map<
  string,
  Promise<{ greenText: string; blackText: string } | null>
>()
const _webPriceBundleCache = new Map<
  string,
  Promise<{ greenText: string; blackText: string; strikeText: string } | null>
>()

function fetchSkuGreenBlackFromApi(
  sku: string,
): Promise<{ greenText: string; blackText: string; webPriceState: any } | null> {
  const origin = /ozon\.kz/i.test(window.location.hostname)
    ? 'https://ozon.kz'
    : 'https://www.ozon.ru'
  const page1Url =
    origin +
    '/api/entrypoint-api.bx/page/json/v2?url=' +
    encodeURIComponent('/product/' + sku + '/')

  return fetch(page1Url, { credentials: 'include' })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      if (!json || !json.widgetStates) return null
      const { greenText, blackText, webPriceState } = parseWebPriceFromWidgetStates(
        json.widgetStates,
      )
      if (!greenText && !blackText) return null
      return { greenText, blackText, webPriceState }
    })
    .catch(() => null)
}

/** 详情页 DOM webPrice 解析绿黑价 + 划线原价 */
export function extractGreenBlackFromDetailDomWebPrice(): {
  greenText: string
  blackText: string
  strikeText: string
} | null {
  const priceEl = document.querySelector("[id^='state-webPrice-']")
  if (!priceEl) return null
  try {
    const raw = priceEl.getAttribute('data-state') || '{}'
    const st = JSON.parse(raw)
    const pair = parseGreenBlackFromWebPriceState(st)
    if (pair.greenText && pair.blackText) {
      return { ...pair, strikeText: pickWebPriceFieldValue(st.originalPrice) }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 拉 Ozon 商品 API 取绿黑价 + 划线原价（供急速上架四宫格）；与利润计算器同源并带缓存 */
export function fetchSkuWebPriceBundle(
  sku: string,
): Promise<{ greenText: string; blackText: string; strikeText: string } | null> {
  const key = String(sku || '').trim()
  if (!key) return Promise.resolve(null)
  const existing = _webPriceBundleCache.get(key)
  if (existing) return existing
  const promise = fetchSkuGreenBlackFromApi(key).then((res) => {
    if (!res) return null
    const greenText = res.greenText || ''
    const blackText = res.blackText || ''
    if (!greenText && !blackText) return null
    return {
      greenText,
      blackText,
      strikeText: pickWebPriceFieldValue(res.webPriceState?.originalPrice),
    }
  })
  _webPriceBundleCache.set(key, promise)
  return promise
}

/** 拉 Ozon 商品 API 取绿黑价对（供急速上架四宫格） */
export function fetchSkuGreenBlackPair(
  sku: string,
): Promise<{ greenText: string; blackText: string } | null> {
  const key = String(sku || '').trim()
  if (!key) return Promise.resolve(null)
  const existing = _greenBlackPairCache.get(key)
  if (existing) return existing
  const promise = fetchSkuGreenBlackFromApi(key).then((res) => {
    if (!res || !res.greenText || !res.blackText) return null
    return { greenText: res.greenText, blackText: res.blackText }
  })
  _greenBlackPairCache.set(key, promise)
  return promise
}

/** 拉 Ozon 商品 API → 反推 realPrice 并通知内嵌面板。返回是否同步成功。 */
function fetchAndSyncListSkuRealPrice(sku: string): Promise<boolean> {
  return fetchSkuGreenBlackFromApi(sku).then((res) => {
    if (!res) return false
    const { greenText, blackText, webPriceState } = res
    const greenVal = parsePriceNumber(greenText) || 0
    const blackVal = parsePriceNumber(blackText) || 0
    if (!(greenVal > 0) && !(blackVal > 0)) return false
    let realPrice = 0
    try {
      const prefs = getCalcLocalPrefs()
      realPrice = calculateOzonRealPrice(greenVal, blackVal, { coeff: prefs.realPriceCoeff })
    } catch {
      return false
    }
    if (!(realPrice > 0)) return false
    const unit = resolveListPriceUnit(greenText, blackText, webPriceState)
    notifyInlineProfitRealPrice(sku, realPrice, unit, { green: greenVal, black: blackVal })
    return true
  })
}

/**
 * 缓存版本：同一个 SKU 重复展开只发一次请求；与旧插件 ensureListSkuDetailCached 等价。
 * @returns Promise<boolean> true=已成功同步 realPrice；false=API 失败或未拿到价
 */
export function ensureListSkuRealPrice(sku: string): Promise<boolean> {
  const key = String(sku || '').trim()
  if (!key) return Promise.resolve(false)
  const existing = _listSkuDetailCache.get(key)
  if (existing) return existing
  const promise = fetchAndSyncListSkuRealPrice(key)
  _listSkuDetailCache.set(key, promise)
  return promise
}

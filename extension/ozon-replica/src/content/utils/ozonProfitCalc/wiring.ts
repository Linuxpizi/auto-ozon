// 内嵌利润计算器与新插件其他模块的对接层：
//   - 初始化 initInlineProfitCalc()
//   - 注册「一键上架」「配置计算器」按钮回调
//   - 列表展开时反推真实价（calculateOzonRealPrice）

import {
  extractPriceUnit,
  parseOzonPriceNumber,
} from '../ozonBatchCrawl/exportPriceUtils'
import { calculateOzonRealPrice } from './realPriceCalc'
import { getCalcLocalPrefs } from './calcLocalPrefs'
import { getCardListPriceText } from '../ozonSelectionRules/cardData'
import {
  initInlineProfitCalc,
  notifyInlineProfitRealPrice,
  setInlineProfitActionCallbacks,
  setListPanelExpandCallbacks,
} from './inlineProfitCalc'
import { handleEditUploadDataClick } from '../ozonEditUpload/editUploadController'
import { ensureListSkuRealPrice } from './ozonProductPriceApi'
import { openSettings } from '../ozonCardSettings/settingsController'

function cssEscapeAttr(value: string): string {
  return String(value).replace(/"/g, '\\"')
}

/**
 * 从列表 tile 容器解析绿标（现价）文本。
 *   - 优先 listPageScanner 同款选择器
 *   - 兜底用 card.dataset.listPriceText
 * 注意：不要尝试从 tile DOM 找黑标，tile 的划线价是 originalPrice（>>cardPrice），
 *      用它当 black 会把 (black-green)*2.25+black 算成 5w+ 的离谱值。
 */
function pickListGreenText(host: HTMLElement, card: HTMLElement): string {
  const candidates: Array<HTMLElement | null> = [
    host.querySelector<HTMLElement>('span.pdp_fb1 .tsHeadline500Medium'),
    host.querySelector<HTMLElement>('.tsHeadline500Medium'),
    host.querySelector<HTMLElement>('.tsHeadline600Large'),
  ]
  for (const el of candidates) {
    const t = el?.textContent?.trim() || ''
    if (t) return t
  }
  return getCardListPriceText(card)
}

/**
 * 列表卡片：仅 DOM 兜底（API 失败时用）。
 * 列表 tile 通常拿不到 cardPrice+price 的完整对，黑标用划线 originalPrice 会把 realPrice 算错。
 * 与旧插件 bcsFallbackListSkuRealPriceFromDom 一致：只用绿标，黑标传 0，让 calculateOzonRealPrice 走「仅绿标 / 0.83」分支。
 */
function fallbackListSkuRealPriceFromDom(sku: string, host: HTMLElement | null): void {
  if (!sku) return
  const card = host?.querySelector?.<HTMLElement>(
    `.e1fbcs.bcs-list-card[data-sku="${cssEscapeAttr(sku)}"]`,
  )
  if (!card || !host) return

  const greenText = pickListGreenText(host, card)
  const greenValue = parseOzonPriceNumber(greenText)
  if (!Number.isFinite(greenValue) || greenValue <= 0) return

  let realPrice = 0
  try {
    const prefs = getCalcLocalPrefs()
    realPrice = calculateOzonRealPrice(greenValue, 0, { coeff: prefs.realPriceCoeff })
  } catch {
    return
  }
  if (!(realPrice > 0)) return
  const unit = extractPriceUnit(greenText) || '₽'
  notifyInlineProfitRealPrice(sku, realPrice, unit, { green: greenValue, black: 0 })
}

/**
 * 列表卡片展开时：拉 Ozon 商品 API 取 webPrice cardPrice+price，与详情页 webSale 同源；
 * 与旧插件 bcsAwaitListSkuDetailPrice → ensureListSkuDetailCached → fetchSkuProductDetail 等价。
 */
function awaitListSkuDetailPrice(sku: string): Promise<unknown> {
  return ensureListSkuRealPrice(sku)
}

/** 内嵌面板「一键上架」点击：触发编辑上架（current 模式），用面板「实际售价」人民币价格覆盖采集价（对齐旧版 ipc-one-click-upload） */
function onOneClickUpload(sku: string, priceCny: string): void {
  if (!sku) return
  const priceOverrides: Record<string, string> = {}
  if (priceCny) priceOverrides[sku] = priceCny
  void handleEditUploadDataClick(sku, 'current', { priceOverrides })
}

/** 内嵌面板「配置计算器」点击：打开偏好弹窗并切到「计算器配置」tab */
function onOpenCalcConfig(): void {
  void openSettings({ tab: 'calcConfig' })
}

let _wired = false

/** content script 启动时调用一次：初始化内嵌面板 + 注册回调 */
export function initInlineProfitCalcWiring(): void {
  if (_wired) return
  _wired = true
  setInlineProfitActionCallbacks({
    onOneClickUpload,
    onOpenCalcConfig,
  })
  setListPanelExpandCallbacks({
    awaitListSkuDetailPrice,
    fallbackListSkuRealPriceFromDom,
  })
  initInlineProfitCalc()
}

/** 详情页：从 webSale 解析绿/黑标反推真实价并写入对应 SKU */
export function syncDetailPageRealPrice(sku: string): void {
  if (!sku) return
  const webSaleEl = document.querySelector('div[data-widget="webSale"]')
  if (!webSaleEl) return

  const greenEl = webSaleEl.querySelector<HTMLElement>('span.tsHeadline600Large')
  const greenText = greenEl ? (greenEl.textContent || '').trim() : ''

  let blackText = ''
  let blackNum = NaN
  const allSpans = webSaleEl.querySelectorAll<HTMLElement>('span')
  for (let i = 0; i < allSpans.length; i++) {
    const sp = allSpans[i]
    if (greenEl && (sp === greenEl || greenEl.contains(sp) || sp.contains(greenEl))) continue
    const txt = (sp.textContent || '').trim()
    if (!txt || !/[₽$¥￥]/.test(txt)) continue
    const cls = sp.className || ''
    const hasHeadlineToken = /tsHeadline5\d{2}(Medium|Large)/.test(cls)
    let isStrike = false
    try {
      isStrike = window.getComputedStyle(sp).textDecorationLine.indexOf('line-through') !== -1
    } catch {}
    if (!hasHeadlineToken && !isStrike) continue
    const n = parseOzonPriceNumber(txt)
    if (!Number.isFinite(n) || n <= 0) continue
    if (!Number.isFinite(blackNum) || n > blackNum) {
      blackNum = n
      blackText = txt
    }
  }

  const greenNum = parseOzonPriceNumber(greenText)
  const greenValue = Number.isFinite(greenNum) && greenNum > 0 ? greenNum : 0
  const blackValue = Number.isFinite(blackNum) && blackNum > 0 ? blackNum : 0

  if (greenValue <= 0 && blackValue <= 0) return

  let realPrice = 0
  try {
    const prefs = getCalcLocalPrefs()
    realPrice = calculateOzonRealPrice(greenValue, blackValue, { coeff: prefs.realPriceCoeff })
  } catch {
    return
  }
  if (!Number.isFinite(realPrice) || realPrice <= 0) return
  const unit = extractPriceUnit(greenText) || extractPriceUnit(blackText) || '₽'
  notifyInlineProfitRealPrice(sku, realPrice, unit, { green: greenValue, black: blackValue })
}

/**
 * 列表页：贴卡完成时预拉 Ozon 商品 API（webPrice cardPrice+price），
 * 反推真实价并同步给内嵌面板。这样用户展开「计算利润」时面板已 ready，
 * 且与详情页 webSale 同源 → 实际售价/计算后实际售价两边一致。
 */
export function syncListPageRealPriceFromHost(
  sku: string,
  _host: HTMLElement | null,
  _card: HTMLElement | null,
): void {
  if (!sku) return
  void ensureListSkuRealPrice(sku)
}

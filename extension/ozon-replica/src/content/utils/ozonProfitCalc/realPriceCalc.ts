// 绿标/黑标反推 Ozon 真实售价
// 移植自旧插件 ozon_old/src/ozon/ozon/crawler.js 中的 calculateOzonRealPrice / extractPriceUnit

import { getCalcLocalPrefs } from './calcLocalPrefs'

const RULES = {
  BLACK_K_MIN: 0.82,
  BLACK_K_MAX: 0.92,
  GREEN_K_MIN: 0.78,
  GREEN_K_MAX: 0.88,
  BLACK_WEIGHT: 0.7,
  GREEN_WEIGHT: 0.3,
}

const DECIMAL_MULTIPLIER = 100

function formatPrice(price: any): number {
  if (price === null || price === undefined) return 0
  const strPrice = String(price).replace(',', '.')
  const numPrice = Number(strPrice)
  return isNaN(numPrice) || numPrice <= 0 ? 0 : numPrice
}

/**
 * 给定绿标（现价）与黑标（原价）反推真实售价（用于计算佣金的卢布参考价）。
 * 与旧插件 calculateOzonRealPrice 完全等价。
 * @param opts.coeff 双价场景 (黑-绿)×coeff + 黑，默认 2.25
 */
export function calculateOzonRealPrice(
  greenPrice: any,
  blackPrice: any,
  opts?: { coeff?: number },
): number {
  let coeff = Number(opts && opts.coeff)
  if (!isFinite(coeff) || coeff <= 0) coeff = 2.25
  const validG = formatPrice(greenPrice)
  const validB = formatPrice(blackPrice)
  let realPrice = 0
  const { BLACK_K_MIN, BLACK_K_MAX, GREEN_K_MIN, GREEN_K_MAX } = RULES

  if (validB > 0 && validG > 0) {
    if (validG < validB) {
      realPrice = (validB - validG) * coeff + validB
    } else {
      const midKBlack = (BLACK_K_MIN + BLACK_K_MAX) / 2
      realPrice = validB / midKBlack
    }
  } else if (validB > 0 && validG <= 0) {
    if (validB <= 80) {
      realPrice = validB / 1.0715
    } else {
      const midKBlack = (BLACK_K_MIN + BLACK_K_MAX) / 2
      realPrice = validB / midKBlack
    }
  } else if (validG > 0 && validB <= 0) {
    const midKGreen = (GREEN_K_MIN + GREEN_K_MAX) / 2
    realPrice = validG / midKGreen
  } else {
    throw new Error('请传入有效的绿色价格或黑标价格')
  }

  return Math.round(realPrice * DECIMAL_MULTIPLIER) / DECIMAL_MULTIPLIER
}

/** 从价格文本里提取单位符号（₽/¥/$ 等，非数字/空格字符） */
export function extractPriceUnit(text: string): string {
  if (!text) return ''
  const m = String(text).match(/[^\d\s   .,\-]+/)
  return m ? m[0].trim() : ''
}

/**
 * 详情页 webSale 内反推真实价 + 单位（按当前可见绿/黑标 span 解析）。
 * 与旧插件 insertOzonRealPriceBox 提取价格的部分等价；只返回 realPrice 和 unit，不绘制浮窗。
 */
export function extractRealPriceFromWebSale(): { realPrice: number; unit: string } | null {
  const webSaleEl = document.querySelector('div[data-widget="webSale"]')
  if (!webSaleEl) return null

  const greenEl = webSaleEl.querySelector('span.tsHeadline600Large')
  const greenText = greenEl ? (greenEl.textContent || '').trim() : ''

  let blackText = ''
  let blackNum = NaN
  const allSpans = webSaleEl.querySelectorAll('span')
  for (let i = 0; i < allSpans.length; i++) {
    const sp = allSpans[i]
    if (greenEl && (sp === greenEl || greenEl.contains(sp) || sp.contains(greenEl))) continue
    const txt = (sp.textContent || '').trim()
    if (!txt || !/[₽$¥￥]/.test(txt)) continue
    const cls = sp.className || ''
    const hasHeadlineToken = /tsHeadline5\d{2}(Medium|Large)/.test(cls)
    let isStrike = false
    try {
      isStrike =
        window.getComputedStyle(sp).textDecorationLine.indexOf('line-through') !== -1
    } catch (_e) {}
    if (!hasHeadlineToken && !isStrike) continue
    const n = parsePriceNumber(txt)
    if (!isFinite(n) || n <= 0) continue
    if (!isFinite(blackNum) || n > blackNum) {
      blackNum = n
      blackText = txt
    }
  }

  const greenNum = parsePriceNumber(greenText)
  const greenValue = isFinite(greenNum) && greenNum > 0 ? greenNum : 0
  const blackValue = isFinite(blackNum) && blackNum > 0 ? blackNum : 0

  if (greenValue <= 0 && blackValue <= 0) return null

  let realPrice = 0
  try {
    // 用用户配置的反推系数（原先漏传 → 一直用默认 2.25，改系数/后端返回后浮窗不变）
    realPrice = calculateOzonRealPrice(greenValue, blackValue, {
      coeff: getCalcLocalPrefs().realPriceCoeff,
    })
  } catch {
    return null
  }
  const unit = extractPriceUnit(greenText) || extractPriceUnit(blackText) || '₽'
  return { realPrice, unit }
}

function parsePriceNumber(text: string): number {
  if (text == null) return NaN
  let s = String(text)
    .trim()
    .replace(/[    ⁠]/g, '')
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
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

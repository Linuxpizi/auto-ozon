// 详情页 webSale 右侧「反推真实价格」浮窗
// 对齐旧版 ozon_old/src/ozon/ozon/crawler.js 中的 insertOzonRealPriceBox /
// updateRealPriceBoxPosition / setupRealPriceBoxWatcher 三段。

import { resolveAssetUrl } from '../../../utils/runtime'
import fallbackLogo from '../../../assets/img/newlogo.png'
import { extractRealPriceFromWebSale } from './realPriceCalc'

const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogo)

const BOX_ID = 'bcs-real-price-box'
const STYLE_ID = 'bcs-real-price-shine-style'

let watchersOn = false
let scrollListener: ((e: Event) => void) | null = null
let resizeListener: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function ensureShineStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const styleEl = document.createElement('style')
  styleEl.id = STYLE_ID
  styleEl.textContent =
    '@keyframes bcs-shine-sweep {' +
    '  0% { left: -160px; }' +
    '  55% { left: 100%; }' +
    '  100% { left: 100%; }' +
    '}'
  document.head.appendChild(styleEl)
}

function buildInnerHtml(realPrice: number, unit: string): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(realPrice)
  const shineHtml =
    '<div style="position:absolute;top:0;left:-160px;height:100%;width:160px;' +
    'pointer-events:none;filter:blur(2px);mix-blend-mode:screen;' +
    'background:linear-gradient(105deg, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0.85) 35%, hsla(0,0%,100%,1) 50%, hsla(0,0%,100%,0.85) 65%, hsla(0,0%,100%,0) 100%);' +
    'animation:bcs-shine-sweep 2.2s linear infinite;"></div>'
  return (
    shineHtml +
    '<div style="position:relative;font-size:18px;font-weight:600;color:#1a4d8f;line-height:1.2;margin-bottom:6px;">' +
    formatted +
    ' ' +
    unit +
    '</div>' +
    '<div style="position:relative;display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:12px;color:#5c5c5c;line-height:1.2;">' +
    `<img src="${logoUrl}" width="18" height="18" style="display:block;" />` +
    '<span>Auto Ozon</span>' +
    '</div>'
  )
}

function ensureBox(): HTMLElement {
  let box = document.getElementById(BOX_ID)
  if (box && box.parentNode === document.body) return box
  if (box?.parentNode) box.parentNode.removeChild(box)
  box = document.createElement('div')
  box.id = BOX_ID
  box.style.cssText =
    'position:fixed;top:0;left:0;' +
    'background:linear-gradient(135deg, #e6f7ff, #ffffff);' +
    'border:1px solid #c7dcf5;border-radius:6px;' +
    'padding:10px 16px;display:inline-flex;' +
    'flex-direction:column;align-items:stretch;justify-content:center;' +
    'white-space:nowrap;z-index:2147483646;pointer-events:none;' +
    'visibility:hidden;overflow:hidden;'
  document.body.appendChild(box)
  return box
}

function updateBoxPosition(): void {
  const box = document.getElementById(BOX_ID) as HTMLElement | null
  if (!box) return
  const webSaleEl = document.querySelector<HTMLElement>('div[data-widget="webSale"]')
  if (!webSaleEl) {
    box.style.visibility = 'hidden'
    return
  }
  const rect = webSaleEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    box.style.visibility = 'hidden'
    return
  }
  const GAP = 12
  let left = rect.right + GAP
  let top = rect.top
  const vw = window.innerWidth
  // 右侧空间不够 → 贴到右边缘内
  if (left + box.offsetWidth > vw - 8) {
    left = Math.max(8, vw - box.offsetWidth - 8)
  }
  if (top < 8) top = 8
  box.style.left = left + 'px'
  box.style.top = top + 'px'
  box.style.visibility = 'visible'
}

function setupWatchers(): void {
  if (watchersOn) return
  watchersOn = true

  let rafPending = false
  const schedule = (): void => {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      try {
        updateBoxPosition()
      } catch {
        /* ignore */
      }
    })
  }
  scrollListener = schedule
  resizeListener = schedule
  // capture = 监听所有可滚动祖先
  window.addEventListener('scroll', scrollListener, true)
  window.addEventListener('resize', resizeListener)

  // 与旧版一致：500ms 轻量兜底同步位置，覆盖 SPA 内容重排
  pollTimer = setInterval(() => {
    try {
      updateBoxPosition()
    } catch {
      /* ignore */
    }
  }, 500)
}

function teardownWatchers(): void {
  if (!watchersOn) return
  watchersOn = false
  if (scrollListener) window.removeEventListener('scroll', scrollListener, true)
  if (resizeListener) window.removeEventListener('resize', resizeListener)
  scrollListener = null
  resizeListener = null
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

/**
 * 在 webSale 右侧渲染/刷新「反推真实价格」浮窗。
 * 提取失败（webSale 未渲染 / 双价都为 0）时静默返回，不创建空 box。
 */
export function insertOzonRealPriceBox(): void {
  const result = extractRealPriceFromWebSale()
  if (!result || !(result.realPrice > 0)) return

  ensureShineStyle()
  const box = ensureBox()
  box.innerHTML = buildInnerHtml(result.realPrice, result.unit)
  updateBoxPosition()
  setupWatchers()
}

/** 详情页离开/登出时调用：移除浮窗 + 解绑监听 */
export function removeOzonRealPriceBox(): void {
  teardownWatchers()
  const box = document.getElementById(BOX_ID)
  if (box?.parentNode) box.parentNode.removeChild(box)
}

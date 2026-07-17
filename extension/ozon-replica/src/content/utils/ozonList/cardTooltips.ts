let bodyTooltipEl: HTMLDivElement | null = null
let commissionTooltipEl: HTMLDivElement | null = null
let initialized = false

function ensureBodyTooltip(): HTMLDivElement {
  if (!bodyTooltipEl) {
    bodyTooltipEl = document.createElement('div')
    bodyTooltipEl.className = 'bcs-body-tooltip'
    document.body.appendChild(bodyTooltipEl)
  }
  return bodyTooltipEl
}

function ensureCommissionTooltip(): HTMLDivElement {
  if (!commissionTooltipEl) {
    commissionTooltipEl = document.createElement('div')
    commissionTooltipEl.id = 'bcs-commission-tooltip'
    commissionTooltipEl.className = 'bcs-commission-tooltip'
    document.body.appendChild(commissionTooltipEl)
  }
  return commissionTooltipEl
}

function positionCommissionTip(clientX: number, clientY: number) {
  const tip = ensureCommissionTooltip()
  const offset = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tw = tip.offsetWidth
  const th = tip.offsetHeight
  let left = clientX + offset
  let top = clientY + offset
  if (left + tw > vw - 8) left = clientX - tw - offset
  if (top + th > vh - 8) top = clientY - th - offset
  if (left < 8) left = 8
  if (top < 8) top = 8
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
}

function tipTextForHoverTarget(el: HTMLElement): string {
  if (el.classList.contains('commission-tip') || el.classList.contains('bcs-copy-price-tip')) {
    return el.getAttribute('data-tip') || ''
  }
  const nested = el.querySelector<HTMLElement>('.bcs-copy-price-tip')
  return nested?.getAttribute('data-tip') || ''
}

/** jQuery 委托 mouseenter 的 relatedTarget 判定：从元素外部进入 */
function isEnteringFromOutside(el: HTMLElement, related: EventTarget | null): boolean {
  if (!related || !(related instanceof Node)) return true
  return !el.contains(related)
}

/** jQuery 委托 mouseleave 的 relatedTarget 判定：离开到元素外部 */
function isLeavingToOutside(el: HTMLElement, related: EventTarget | null): boolean {
  if (!related || !(related instanceof Node)) return true
  return !el.contains(related)
}

/**
 * 解析卡片头部按钮 tooltip 目标。
 * 窄卡时 profit 按钮 pointer-events:none，事件落在 wrap 上；禁用时 tip 在 wrap，
 * 未同步时 tip 仍可能在内部 btn，需向下查找（对齐旧版 index.js + inline-profit-calc.js）。
 */
function resolveBtnTooltipTarget(from: HTMLElement): HTMLElement | null {
  const direct = from.closest<HTMLElement>(
    '.bcs-card-circle-btn[data-tooltip], .bcs-card-profit-btn-wrap[data-tooltip]',
  )
  if (direct) return direct
  const wrap = from.closest<HTMLElement>('.bcs-card-profit-btn-wrap')
  if (!wrap) return null
  return wrap.querySelector<HTMLElement>('.bcs-card-profit-btn[data-tooltip]')
}

function hideBodyTooltip(bodyTip: HTMLDivElement) {
  bodyTip.classList.remove('is-visible')
}

function hideCommissionTooltip(tip: HTMLDivElement) {
  tip.style.display = 'none'
}

/** 滚动时 DOM 移走但不一定触发 mouseout，需主动收起浮层 */
function dismissCardTooltips(bodyTip: HTMLDivElement, commissionTip: HTMLDivElement) {
  hideBodyTooltip(bodyTip)
  hideCommissionTooltip(commissionTip)
}

function showBodyTooltip(bodyTip: HTMLDivElement, target: HTMLElement) {
  const text = target.getAttribute('data-tooltip')
  if (!text) return
  bodyTip.textContent = text
  const rect = target.getBoundingClientRect()
  bodyTip.classList.add('is-visible')
  const tw = bodyTip.offsetWidth
  const th = bodyTip.offsetHeight
  let left = rect.left + rect.width / 2 - tw / 2
  let top = rect.top - th - 6
  if (left < 2) left = 2
  if (left + tw > window.innerWidth - 2) left = window.innerWidth - tw - 2
  bodyTip.style.left = `${left}px`
  bodyTip.style.top = `${top}px`
}

/** body 级 tooltip + 佣金/复制价格 data-tip 浮层（对齐旧版 crawler.js / index.js） */
export function initCardTooltipsOnce() {
  if (initialized) return
  initialized = true

  const bodyTip = ensureBodyTooltip()

  // 旧版 index.js 用 jQuery.on('mouseenter', selector) 委托，底层是 mouseover + relatedTarget
  document.body.addEventListener('mouseover', (e) => {
    const target = resolveBtnTooltipTarget(e.target as HTMLElement)
    if (!target || !isEnteringFromOutside(target, e.relatedTarget)) return
    showBodyTooltip(bodyTip, target)
  }, true)

  document.body.addEventListener('mouseout', (e) => {
    const target = resolveBtnTooltipTarget(e.target as HTMLElement)
    if (!target || !isLeavingToOutside(target, e.relatedTarget)) return
    hideBodyTooltip(bodyTip)
  }, true)

  const commissionTip = ensureCommissionTooltip()
  const tipSelector = '.commission-tip, .bcs-copy-price-tip, .one_prices, #copy'

  const onScrollDismiss = () => dismissCardTooltips(bodyTip, commissionTip)
  window.addEventListener('scroll', onScrollDismiss, true)
  window.addEventListener('wheel', onScrollDismiss, { capture: true, passive: true })

  document.body.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(tipSelector)
    if (!target || !target.closest('.mjgd_ozon_sku_card, .e1fbcs')) return
    if (!isEnteringFromOutside(target, e.relatedTarget)) return
    const text = tipTextForHoverTarget(target)
    if (!text) return
    commissionTip.textContent = text.replace(/；/g, '\n').replace(/;/g, '\n')
    commissionTip.style.display = 'block'
    positionCommissionTip(e.clientX, e.clientY)
  }, true)

  document.body.addEventListener('mousemove', (e) => {
    if (commissionTip.style.display !== 'block') return
    const target = (e.target as HTMLElement).closest<HTMLElement>(tipSelector)
    if (!target || !target.closest('.mjgd_ozon_sku_card, .e1fbcs')) return
    positionCommissionTip(e.clientX, e.clientY)
  }, true)

  document.body.addEventListener('mouseout', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(tipSelector)
    if (!target || !target.closest('.mjgd_ozon_sku_card, .e1fbcs')) return
    if (!isLeavingToOutside(target, e.relatedTarget)) return
    hideCommissionTooltip(commissionTip)
  }, true)
}

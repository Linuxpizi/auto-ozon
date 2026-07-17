import type { OzonSellerOffer } from '../ozonBatchCrawl/crawlSkuApi'
import { fetchOtherOffersSellers } from '../ozonBatchCrawl/crawlSkuApi'
import { getCardFollowSellers, setCardFollowSellers } from './followSellerCache'
import { loadCardFollowData } from './loadCardFollowData'

const POPUP_ID = 'mjgd_ozon_follow_popup'

let popupEl: HTMLElement | null = null
let anchorEl: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let listenersBound = false

function escapeHtml(s: unknown): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatStars(rating: unknown): string {
  if (rating == null || rating === '' || (typeof rating === 'number' && !Number.isFinite(rating))) {
    return '<span class="mjgd_ozon_follow_score_missing">—</span>'
  }
  const num = Number(rating)
  if (!Number.isFinite(num)) return formatStars(null)
  const r = Math.max(0, Math.min(5, Math.round(num)))
  const label = num.toFixed(1)
  let filled = ''
  let empty = ''
  for (let i = 0; i < r; i += 1) filled += '★'
  for (let i = 0; i < 5 - r; i += 1) empty += '☆'
  return (
    `<span class="mjgd_ozon_follow_score_number">${escapeHtml(label)}</span> `
    + `<span class="mjgd_ozon_follow_star">${filled}</span>`
    + `<span class="mjgd_ozon_follow_star_empty">${empty}</span>`
  )
}

function pickSellerName(seller: OzonSellerOffer): string {
  const s = seller.seller
  return (
    seller.name
    || seller.sellerName
    || seller.shopName
    || (s && (s.name || s.sellerName))
    || '—'
  )
}

function pickAvatarLetter(name: string): string {
  const t = String(name || '').trim()
  return t ? t.charAt(0).toUpperCase() : '?'
}

function pickAvatarUrl(seller: OzonSellerOffer): string {
  const s = seller.seller
  const u =
    seller.logoImageUrl
    || seller.logo
    || seller.logoUrl
    || seller.image
    || (s && (s.logoImageUrl || s.logo || s.logoUrl || s.image))
    || ''
  return typeof u === 'string' ? u : ''
}

function pickRating(seller: OzonSellerOffer): number | null {
  if (seller.rating != null && typeof seller.rating === 'object' && seller.rating.totalScore != null) {
    const ts = Number(seller.rating.totalScore)
    if (Number.isFinite(ts)) return ts
  }
  const s = seller.seller
  const r =
    (typeof seller.rating === 'number' ? seller.rating : null)
    || seller.starRating
    || seller.feedback?.rating
    || (s && s.rating)
  return r == null ? null : Number(r)
}

const COUNTRY_PREFIX: Record<string, string> = {
  CN: '中国',
  RU: '俄罗斯',
  BY: '白俄罗斯',
  KZ: '哈萨克斯坦',
  UA: '乌克兰',
}

function pickRegion(seller: OzonSellerOffer): string {
  const creds = seller.credentials
  if (Array.isArray(creds)) {
    const re = /^(CN|RU|BY|KZ|UA)\s*,/i
    for (const line of creds) {
      if (typeof line !== 'string') continue
      const m = line.trim().match(re)
      if (m) return COUNTRY_PREFIX[m[1].toUpperCase()] || m[1].toUpperCase()
    }
  }
  const s = seller.seller
  return (
    seller.warehouseName
    || seller.countryName
    || seller.country
    || seller.regionName
    || seller.warehouse?.name
    || (s && (s.country || s.countryName))
    || '—'
  )
}

/** 俄语「15 апреля」等 -> 「4月15日」，已是「M月D日」则规范化（对齐旧版 bcsFollowFormatDeliveryCn） */
const RU_MONTH_TO_NUM: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
}

function formatDeliveryCn(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const normCn = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日$/)
  if (normCn) {
    return `${parseInt(normCn[1], 10)}月${parseInt(normCn[2], 10)}日`
  }
  const reRu =
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i
  const m = s.match(reRu)
  if (m) {
    const day = parseInt(m[1], 10)
    const monthNum = RU_MONTH_TO_NUM[m[2].toLowerCase()]
    if (monthNum && day >= 1 && day <= 31) {
      return `${monthNum}月${day}日`
    }
  }
  return s
}

function pickDeliveryFromAdvantages(seller: OzonSellerOffer): string {
  const adv = seller.advantages
  if (!Array.isArray(adv)) return ''
  for (const a of adv) {
    const head = a?.contentRs?.headRs
    if (!Array.isArray(head)) continue
    for (const h of head) {
      if (h?.type === 'text' && h.content) return String(h.content).trim()
    }
  }
  return ''
}

function pickDelivery(seller: OzonSellerOffer): string {
  let raw = pickDeliveryFromAdvantages(seller)
  if (!raw) {
    raw =
      seller.deliverySchema?.text
      || seller.deliveryText
      || seller.timeSlot
      || seller.delivery?.text
      || seller.deliveryTime?.text
      || seller.estimatedDeliveryDateText
      || ''
  }
  if (!raw) return '—'
  const formatted = formatDeliveryCn(raw)
  return formatted || '—'
}

function pickPrice(seller: OzonSellerOffer): string {
  const p = seller.price?.cardPrice?.price ?? seller.price?.price
  if (p == null) return '—'
  const str = String(p).trim()
  if (/[₽¥￥$€]/.test(str)) return str
  return `${str} ₽`
}

function productOrigin(): string {
  return /ozon\.kz/i.test(window.location.hostname) ? 'https://www.ozon.kz' : 'https://www.ozon.ru'
}

function pickHref(seller: OzonSellerOffer): string {
  if (typeof seller.link === 'string' && seller.link.trim()) return seller.link.trim()
  if (typeof seller.productLink === 'string' && seller.productLink.trim()) return seller.productLink.trim()
  if (seller.sku == null || String(seller.sku).trim() === '') return ''
  return `${productOrigin()}/product/${encodeURIComponent(String(seller.sku).trim())}`
}

function renderRows(sellers: OzonSellerOffer[]) {
  const body = popupEl?.querySelector('#mjgd_ozon_follow_list_body')
  if (!body) return
  if (!sellers.length) {
    body.innerHTML = '<div class="mjgd_ozon_follow_list_empty">暂无跟卖数据</div>'
    return
  }
  const origin = productOrigin()
  const rows = sellers.map((seller) => {
    const name = pickSellerName(seller)
    const href = pickHref(seller)
    const avatarUrl = pickAvatarUrl(seller)
    const letter = pickAvatarLetter(name)
    const avatarInner = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="" class="mjgd_ozon_follow_avatar_img" loading="lazy" />`
      : escapeHtml(letter)
    const nameInner = href
      ? `<a class="mjgd_ozon_follow_seller_name_link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
      : `<span class="mjgd_ozon_follow_seller_name_txt">${escapeHtml(name)}</span>`
    const skuLink = seller.sku
      ? `<a class="mjgd_ozon_follow_sku_link" href="${origin}/product/${escapeHtml(String(seller.sku))}" target="_blank" rel="noopener">${escapeHtml(String(seller.sku))}</a>`
      : '—'
    return (
      `<div class="mjgd_ozon_follow_list_row">`
      + `<div class="mjgd_ozon_follow_seller_info">`
      + `<div class="mjgd_ozon_follow_avatar">${avatarInner}</div>`
      + `<div class="mjgd_ozon_follow_seller_name_wrap">${nameInner}</div>`
      + `</div>`
      + `<div class="mjgd_ozon_follow_store_score">${formatStars(pickRating(seller))}</div>`
      + `<div class="mjgd_ozon_follow_region">${escapeHtml(pickRegion(seller))}</div>`
      + `<div class="mjgd_ozon_follow_sku_col">${skuLink}</div>`
      + `<div class="mjgd_ozon_follow_delivery_time">${escapeHtml(pickDelivery(seller))}</div>`
      + `<div class="mjgd_ozon_follow_price">${escapeHtml(pickPrice(seller))}</div>`
      + `</div>`
    )
  })
  body.innerHTML = rows.join('')
}

function updatePosition() {
  if (!popupEl || !anchorEl) return
  const triggerRect = anchorEl.getBoundingClientRect()
  const popupWidth = popupEl.offsetWidth
  const popupHeight = popupEl.offsetHeight
  if (popupWidth === 0 || popupHeight === 0) {
    requestAnimationFrame(updatePosition)
    return
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = triggerRect.right - popupWidth
  let top = triggerRect.top - popupHeight - 6
  if (left < 8) {
    left = triggerRect.left
    if (left < 8) left = 8
  }
  if (left + popupWidth > vw - 8) left = vw - popupWidth - 8
  if (top < 8) {
    top = triggerRect.bottom + 6
    if (top + popupHeight > vh - 8) top = vh - popupHeight - 8
  }
  if (top < 4) top = 4
  if (left < 4) left = 4
  popupEl.style.top = `${top}px`
  popupEl.style.left = `${left}px`
}

function closePopup() {
  popupEl?.classList.remove('is_active')
  popupEl?.setAttribute('aria-hidden', 'true')
  anchorEl = null
}

function ensurePopup() {
  if (popupEl) return
  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div id="${POPUP_ID}" class="mjgd_ozon_follow_popup" aria-hidden="true">
      <div class="mjgd_ozon_follow_seller_list">
        <div class="mjgd_ozon_follow_list_header">
          <div>卖家</div><div>店铺评分</div><div>地区</div><div>SKU</div><div>预计交付时间</div><div>价格</div>
        </div>
        <div class="mjgd_ozon_follow_list_body" id="mjgd_ozon_follow_list_body"></div>
      </div>
    </div>
  `
  popupEl = wrap.firstElementChild as HTMLElement
  document.body.appendChild(popupEl)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (popupEl?.classList.contains('is_active')) updatePosition()
    })
    resizeObserver.observe(popupEl)
  }
}

function showPopup(chip: HTMLElement, card: HTMLElement, sku: string) {
  ensurePopup()
  if (!popupEl) return

  if (popupEl.classList.contains('is_active') && anchorEl === chip) {
    closePopup()
    return
  }

  anchorEl = chip
  popupEl.classList.add('is_active')
  popupEl.setAttribute('aria-hidden', 'false')

  const cached = getCardFollowSellers(card)
  if (cached?.length) {
    renderRows(cached)
    updatePosition()
    return
  }

  const body = popupEl.querySelector('#mjgd_ozon_follow_list_body')
  if (body) body.innerHTML = '<div class="mjgd_ozon_follow_list_loading">加载中…</div>'
  updatePosition()

  const anchor = chip
  void fetchOtherOffersSellers(sku).then(async (sellers) => {
    if (anchorEl !== anchor) return
    setCardFollowSellers(card, sellers || [])
    if (sellers?.length) {
      await loadCardFollowData(card, sku)
    }
    if (anchorEl !== anchor) return
    renderRows(sellers || [])
    updatePosition()
  })
}

/** 全局绑定跟卖列表点击（对齐旧版 .bcs-gnumber-clickable） */
export function initFollowSellerPopupOnce() {
  if (listenersBound) return
  listenersBound = true

  document.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest?.('.bcs-gnumber-clickable') as HTMLElement | null
    if (chip) {
      e.preventDefault()
      e.stopPropagation()
      const wrap = chip.closest('.mjgd_ozon_field_gnumber_wrap, .bcs-gnumber-row') as HTMLElement | null
      const card = chip.closest('.mjgd_ozon_sku_card') as HTMLElement | null
      const sku = wrap?.getAttribute('data-sku') || card?.dataset.sku || ''
      if (!sku || !card) return
      showPopup(chip, card, sku)
      return
    }

    if (popupEl?.classList.contains('is_active')) {
      if (popupEl.contains(e.target as Node)) return
      closePopup()
    }
  }, true)

  document.addEventListener('scroll', () => {
    if (popupEl?.classList.contains('is_active')) updatePosition()
  }, true)

  window.addEventListener('resize', () => {
    if (popupEl?.classList.contains('is_active')) updatePosition()
  })
}

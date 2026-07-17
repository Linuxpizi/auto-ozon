/**
 * 商品图下载 — 按钮/菜单注入（列表缩略图 + 详情主轮播右下角）
 *
 * 借鉴参考页「下载图片.html」：磨砂玻璃圆钮 + 气泡下拉菜单，默认向上展开、右对齐。
 * 菜单为按钮容器的子节点（position:absolute），随页面/按钮一起滚动——不会因页面滚动而漂移。
 * MutationObserver 去抖重扫 + SPA URL 轮询重绑；进度遮罩由 Vue 组件负责（订阅 controller）。
 */
import { showToast } from '../../../utils/toast'
import { resolveOzonPageType, isOzonListLikePage } from './ozonPageContext'
import { findListingProductLinks, extractSkuFromProductHref } from './listPageScanner'
import {
  collectDetailVariants,
  extractDetailPageSku,
  extractDetailProductImage,
} from './detailPageContext'
import {
  downloadAllVariantsZip,
  downloadCurrentImage,
  downloadCurrentVariantZip,
  type ImageDownloadContext,
} from './imageDownloadActions'

// 下载图标
const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3v11"/><path d="M8 11l4 3 4-3"/><path d="M5 20h14"/></svg>'

// 当前图片图标
const ICON_CURRENT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="M8 10l4 3 4-3"/><path d="M5 19h14"/></svg>'

// 当前变体图片图标
const ICON_VARIANT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>'

// 全部图片图标
const ICON_ALL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/>' +
  '<rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>' +
  '<rect x="14" y="14" width="7" height="7" rx="1"/></svg>'

// 菜单 HTML
const MENU_HTML =
  `<div class="mjgd_img_dl_menu_item" data-key="current"><span class="mjgd_img_dl_ico">${ICON_CURRENT}</span><span>当前图片</span></div>` +
  `<div class="mjgd_img_dl_menu_item" data-key="variant"><span class="mjgd_img_dl_ico">${ICON_VARIANT}</span><span>当前变体图片</span></div>` +
  `<div class="mjgd_img_dl_menu_item" data-key="all"><span class="mjgd_img_dl_ico">${ICON_ALL}</span><span>全部图片</span></div>`

type CtxResolver = () => ImageDownloadContext

let started = false
let observer: MutationObserver | null = null
let rescanTimer: number | null = null
let navTimer: number | null = null
let lastHref = ''

/** 当前展开的菜单（同一时刻仅一个） */
let openMenu: HTMLElement | null = null

/** 关闭当前展开的菜单 */
function closeOpenMenu() {
  if (openMenu) {
    openMenu.classList.remove('mjgd_img_dl_menu_open')
    openMenu = null
  }
}

/** 点击空白处关闭菜单 */
function onDocClickClose() {
  closeOpenMenu()
}

// ── 控件注入（wrapper + 按钮 + 菜单）────────────────────────
function runAction(key: string, resolver: CtxResolver) {
  const ctx = resolver()
  if (!ctx.sku && !ctx.currentImageUrl) {
    showToast('未找到商品信息', 2500)
    return
  }
  if (key === 'current') void downloadCurrentImage(ctx)
  else if (key === 'variant') void downloadCurrentVariantZip(ctx)
  else if (key === 'all') void downloadAllVariantsZip(ctx)
}

/** 添加下载按钮和菜单 */
function attachControl(container: HTMLElement, resolver: CtxResolver) {
  if (hasControl(container)) return
  const pos = window.getComputedStyle(container).position
  if (pos === 'static' || !pos) {
    container.style.position = 'relative'
  }

  const wrap = document.createElement('div')
  wrap.className = 'mjgd_img_dl_wrap'

  const btn = document.createElement('div')
  btn.className = 'mjgd_img_dl_btn'
  btn.setAttribute('role', 'button')
  btn.setAttribute('title', '下载商品图')
  btn.innerHTML = DOWNLOAD_ICON
 
  const menu = document.createElement('div')
  menu.className = 'mjgd_img_dl_menu'
  menu.innerHTML = MENU_HTML

  // 阻断冒泡：控件位于 <a> 内，按下/点击都不得触发商品跳转
  wrap.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const willOpen = !menu.classList.contains('mjgd_img_dl_menu_open')
    closeOpenMenu()
    if (willOpen) {
      menu.classList.add('mjgd_img_dl_menu_open')
      openMenu = menu
    }
  })

  menu.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const item = (e.target as HTMLElement).closest('.mjgd_img_dl_menu_item') as HTMLElement | null
    if (!item) return
    closeOpenMenu()
    runAction(item.getAttribute('data-key') || '', resolver)
  })

  wrap.appendChild(btn)
  wrap.appendChild(menu)
  container.appendChild(wrap)
}

/** 容器已有直接子控件则跳过（去重 + 抗虚拟列表复用） */
function hasControl(container: HTMLElement): boolean {
  return Array.from(container.children).some((c) =>
    (c as HTMLElement).classList?.contains('mjgd_img_dl_wrap'),
  )
}

/** 构建列表上下文 */
function buildListCtx(anchor: HTMLAnchorElement): ImageDownloadContext {
  const sku = extractSkuFromProductHref(anchor.href) || ''
  const img = anchor.querySelector('img')
  const currentImageUrl = img?.currentSrc || img?.getAttribute('src') || ''
  return { scene: 'list', sku, mainSku: sku, currentImageUrl, variantSkus: [] }
}

/** 详情轮播当前展示的主图（取画廊内渲染面积最大、非视频的图） */
function resolveDetailMainImageUrl(galleryEl: HTMLElement): string {
  let best = ''
  let bestArea = 0
  galleryEl.querySelectorAll('img').forEach((img) => {
    const src = img.currentSrc || img.getAttribute('src') || ''
    if (!src || src.includes('video')) return
    const r = img.getBoundingClientRect()
    const area = r.width * r.height
    if (area > bestArea) {
      bestArea = area
      best = src
    }
  })
  return best || extractDetailProductImage() || ''
}

/** 构建详情上下文 */
function buildDetailCtx(galleryEl: HTMLElement): ImageDownloadContext {
  const sku = extractDetailPageSku() || (window.location.pathname.match(/(\d{7,})/) || [])[1] || ''
  const currentImageUrl = resolveDetailMainImageUrl(galleryEl)
  const variantSkus = collectDetailVariants().map((v) => v.sku)
  return { scene: 'detail', sku, mainSku: sku, currentImageUrl, variantSkus }
}

/** 扫描列表按钮 */
function scanListButtons() {
  findListingProductLinks().forEach((anchor) => {
    if (anchor.closest('#mjgd-extension-app')) return
    const img = anchor.querySelector('img')
    if (!img) return
    // 贴在图片容器（img 的父节点）右下角，而非整个 a（a 常含标题/价格，底部会偏到文字下方）
    const parent = img.parentElement as HTMLElement | null
    const container = parent && parent !== anchor ? parent : (anchor as HTMLElement)
    attachControl(container, () => buildListCtx(anchor))
  })
}

/** 扫描详情按钮 */
function scanDetailButton() {
  const gallery = document.querySelector('[data-widget="webGallery"]') as HTMLElement | null
  if (!gallery) return
  attachControl(gallery, () => buildDetailCtx(gallery))
}

/** 扫描页面 */
function scan() {
  const pageType = resolveOzonPageType()
  if (pageType === 'detail') {
    scanDetailButton()
  } else if (isOzonListLikePage(pageType)) {
    scanListButtons()
  }
}

/** 调度扫描 */
function scheduleScan() {
  if (rescanTimer != null) return
  rescanTimer = window.setTimeout(() => {
    rescanTimer = null
    scan()
  }, 400)
}

/** 移除所有控件 */
function removeAllControls() {
  document.querySelectorAll('.mjgd_img_dl_wrap').forEach((el) => el.remove())
}

/** 启动下载按钮 */
export function startImageDownloadButtons() {
  if (started) {
    scan()
    return
  }
  started = true
  lastHref = window.location.href
  scan()

  observer = new MutationObserver(() => scheduleScan())
  observer.observe(document.body, { childList: true, subtree: true })

  // 点击空白处关闭菜单（按钮/菜单自身已 stopPropagation，不会触发此关闭）
  document.addEventListener('click', onDocClickClose)

  // SPA 导航：URL 变化重扫并关菜单（Ozon 切商品/翻页不整页刷新）
  navTimer = window.setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href
      closeOpenMenu()
      scan()
    }
  }, 1000)
}

/** 停止下载按钮 */
export function stopImageDownloadButtons() {
  if (!started) return
  started = false
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (rescanTimer != null) {
    window.clearTimeout(rescanTimer)
    rescanTimer = null
  }
  if (navTimer != null) {
    window.clearInterval(navTimer)
    navTimer = null
  }
  document.removeEventListener('click', onDocClickClose)
  closeOpenMenu()
  removeAllControls()
}

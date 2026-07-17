// 「选择编辑上架方式」弹窗
// 移植旧版 src/ozon/index.js 中 .edit_upload_data 点击逻辑：弹出 当前变体 / 全部变体 两个选项，
// 弹窗结构、内联样式、定位、外点关闭与旧版逐字保持一致。

import { handleEditUploadDataClick } from './editUploadController'
import { hideGlobalLoading } from './editUploadLoading'

const POPUP_CLASS = 'bcs-edit-upload-popup'

/** 卡片触发：低于 Widget 浮层，避免遮挡右侧功能菜单 */
const POPUP_Z_CARD = '809900'
/** 侧边栏触发：略高于 Widget 浮层，弹窗显示在菜单按钮下方 */
const POPUP_Z_SIDEBAR = '810015'

let dismissListener: ((e: MouseEvent) => void) | null = null
let scrollDismissListener: (() => void) | null = null

function cancelDismissListener(): void {
  if (dismissListener) {
    document.removeEventListener('click', dismissListener, true)
    dismissListener = null
  }
  if (scrollDismissListener) {
    window.removeEventListener('scroll', scrollDismissListener, true)
    scrollDismissListener = null
  }
}

function removeExistingPopup(): void {
  cancelDismissListener()
  document.querySelectorAll('.' + POPUP_CLASS).forEach((el) => el.remove())
}

/** 从按钮读取 SKU，无 data-sku 时从页面 DOM 兜底（菜单栏按钮） */
function resolveSkuFromButton(btn: HTMLElement): string {
  let sku = String(btn.getAttribute('data-sku') || '').trim()
  if (!sku) {
    const skuText = document.querySelector('[data-widget="webDetailSKU"]')?.textContent || ''
    const m = skuText.match(/\d+/)
    sku = m ? String(m[0]) : ''
  }
  return sku
}

function bindDismissListener(popup: HTMLElement): void {
  cancelDismissListener()
  dismissListener = (e: MouseEvent) => {
    const target = e.target
    if (!(target instanceof Node)) return
    if (popup.contains(target)) return
    removeExistingPopup()
  }
  // 滚动即关闭：卡片场景弹窗是 absolute 定位，下滑会随文档上移到 Ozon 吸顶导航区域，
  // 而插件 z-index 远高于宿主 header，不关闭会出现盖穿吸顶的「穿模」。capture=true 以捕获页面内滚动容器。
  scrollDismissListener = () => removeExistingPopup()
  setTimeout(() => {
    if (dismissListener) document.addEventListener('click', dismissListener, true)
    if (scrollDismissListener) {
      window.addEventListener('scroll', scrollDismissListener, { capture: true, passive: true })
    }
  }, 0)
}

/**
 * 打开「选择编辑上架方式」弹窗（移植旧版 $("body").delegate(".edit_upload_data", ...)）。
 * @param btn 触发按钮（卡片按钮或功能菜单项），用于定位弹窗
 * @param opts.fixed 是否用 fixed 定位（功能菜单在悬浮面板内，等价旧版 #cj_move_page）
 */
export function openEditUploadPopup(btn: HTMLElement, opts?: { fixed?: boolean }): void {
  removeExistingPopup()
  hideGlobalLoading()

  const sku = resolveSkuFromButton(btn)
  const isInFixedPanel =
    opts?.fixed ??
    !!(btn.closest('#cj_move_page') || btn.closest('#mjgd-widget-container'))
  const posType = isInFixedPanel ? 'fixed' : 'absolute'
  const popupZ = isInFixedPanel ? POPUP_Z_SIDEBAR : POPUP_Z_CARD

  const popup = document.createElement('div')
  popup.className = POPUP_CLASS
  popup.style.cssText = `position:${posType};z-index:${popupZ};background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.2);padding:12px;display:flex;flex-direction:column;gap:8px;min-width:160px;`
  popup.innerHTML = `
      <div style="font-size:13px;color:#666;margin-bottom:4px;text-align:center;">选择编辑上架方式</div>
      <button class="bcs-edit-upload-current-variant" data-sku="${sku}" style="height:34px;display:flex;align-items:center;justify-content:center;border:none;border-radius:6px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;background:linear-gradient(135deg,#4085FB 0%,#36B0FD 100%);">当前变体</button>
      <button class="bcs-edit-upload-all-variants" data-sku="${sku}" style="height:34px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;background:#e8eff7;border:1px solid #c9d8ea;color:#5e7fa8;">全部变体</button>
  `
  document.body.appendChild(popup)

  const popW = popup.offsetWidth
  let left: number
  let top: number
  if (isInFixedPanel) {
    const r = btn.getBoundingClientRect()
    left = r.left + r.width / 2 - popW / 2
    top = r.bottom + 6
  } else {
    const r = btn.getBoundingClientRect()
    left = r.left + window.scrollX + btn.offsetWidth / 2 - popW / 2
    top = r.top + window.scrollY + btn.offsetHeight + 6
  }
  if (left < 0) left = 10
  popup.style.left = left + 'px'
  popup.style.top = top + 'px'

  popup.querySelector('.bcs-edit-upload-current-variant')?.addEventListener('click', (e) => {
    e.stopPropagation()
    removeExistingPopup()
    void handleEditUploadDataClick(sku, 'current')
  })
  popup.querySelector('.bcs-edit-upload-all-variants')?.addEventListener('click', (e) => {
    e.stopPropagation()
    removeExistingPopup()
    void handleEditUploadDataClick(sku, 'all')
  })

  bindDismissListener(popup)
}

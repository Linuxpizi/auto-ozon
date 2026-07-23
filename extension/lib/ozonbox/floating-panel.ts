import { analyticsPageForUrl } from './analytics-card'
import type { OzonboxCollectAndSaveResult } from './contract'
import { isRecord } from './contract'
import { createFloatingPanelTools } from './floating-panel-tools'
import {
  clampOzonPanelPosition,
  DEFAULT_OZON_PANEL_STATE,
  snapOzonPanelPositionToNearestEdge,
  type OzonCardVisibility,
  type OzonPanelPosition,
  type OzonPanelState,
} from './panel-storage'
import { readOzonSellerId } from './seller-analytics'
import {
  OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE,
  OZON_SELLER_DASHBOARD_URL,
} from './seller-session'

export const OZON_FLOATING_PANEL_HOST_ID = 'jingzhi-ai-ozon-floating-panel'
export const OZON_SELLER_RECHECK_DELAY_MS = 5_000
export const OZON_PANEL_DRAG_THRESHOLD_PX = 5

export interface OzonFloatingPanelController {
  reconcile: () => void
  stop: () => void
}

export interface OzonFloatingPanelOptions {
  initialState?: OzonPanelState
  getCardVisibility?: () => OzonCardVisibility
  setListCardsHidden?: (hidden: boolean) => Promise<void>
  setDetailCardsVisible?: (visible: boolean) => Promise<void>
  persistLauncherPosition?: (position: OzonPanelPosition) => Promise<void>
  collectAndSaveCurrentProduct?: () => Promise<OzonboxCollectAndSaveResult>
}

export interface SellerInteractionErrorState {
  message: string
  showCookieFailure: boolean
}

interface DialogOptions {
  title: string
  content: string
  confirmText: string
  cancelText?: string
  onConfirm?: () => void | Promise<void>
}

interface DragStart {
  clientX: number
  clientY: number
  position: OzonPanelPosition
}

let activeController: OzonFloatingPanelController | undefined

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ozon Seller 检测失败'
}

function samePosition(left: OzonPanelPosition, right: OzonPanelPosition): boolean {
  return left.right === right.right && left.bottom === right.bottom
}

export function sellerInteractionErrorState(
  error: unknown,
  explicitCookieBinding: boolean,
): SellerInteractionErrorState {
  const message = errorMessage(error)
  return {
    message,
    showCookieFailure: explicitCookieBinding && message === OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE,
  }
}

export function parseCollectAndSaveResult(value: unknown): OzonboxCollectAndSaveResult {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    throw new Error('采集服务返回了无效响应')
  }
  if (!value.success) {
    if (typeof value.error !== 'string' || !value.error.trim()) {
      throw new Error('采集失败，但服务未返回原因')
    }
    return { success: false, error: value.error.trim() }
  }
  if (!Number.isInteger(value.created) || Number(value.created) < 0
    || !Number.isInteger(value.skipped) || Number(value.skipped) < 0) {
    throw new Error('采集服务返回了无效的保存数量')
  }
  return {
    success: true,
    created: Number(value.created),
    skipped: Number(value.skipped),
  }
}

export function buildOzonFloatingPanelShadow(logoUrl: string): string {
  return `<style>
    :host{all:initial}
    *,*::before,*::after{box-sizing:border-box}
    [hidden]{display:none!important}
    button{font:inherit}
    .panel,.launcher,.modal-backdrop{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
    .panel{position:fixed;right:20px;bottom:20px;width:144px;padding:0 0 8px;background:#fff;border:1px solid #f3f4f6;border-radius:12px;box-shadow:0 0 16px 4px rgba(238,19,27,.2);color:#20242c;pointer-events:auto;transition:all 300ms ease}
    .header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0}
    .brand{display:flex;align-items:center;min-width:0;flex-wrap:nowrap}
    .brand-logo{display:block;width:20px;height:20px;margin-right:8px;flex:0 0 auto;border-radius:4px;object-fit:contain}
    .brand-name{overflow:hidden;color:#24262c;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;text-overflow:ellipsis}
    .collapse{display:flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;flex:0 0 auto;border:0;border-radius:999px;background:#eab308;color:#fef08a;font-size:12px;font-weight:800;line-height:14px;cursor:pointer}
    .collapse:hover{background:#ca8a04}
    .actions{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:8px;padding:8px 20px 0}
    .action{min-height:28px;padding:4px 7px;border-radius:999px;font-size:12px;font-weight:600;line-height:18px;text-align:center;white-space:nowrap;cursor:pointer}
    .action.link{border:1px solid transparent;background:transparent;color:#1677ff}
    .action.link:hover{background:#f0f6ff}
    .action.danger{border:1px solid #ee131b;background:#ee131b;color:#fff;box-shadow:0 3px 8px rgba(238,19,27,.22)}
    .action.danger:hover{border-color:#c91017;background:#c91017}
    .action.primary{border:1px solid #1677ff;background:#1677ff;color:#fff;box-shadow:0 3px 8px rgba(22,119,255,.22)}
    .action.primary:hover{border-color:#0958d9;background:#0958d9}
    .action.amber{border:1px solid #f59e0b;background:#f59e0b;color:#fff;box-shadow:0 3px 8px rgba(245,158,11,.2)}
    .action.amber:hover{border-color:#d97706;background:#d97706}
    .action.default{border:1px solid #d1d5db;background:#fff;color:#374151}
    .action.default:hover{background:#f9fafb}
    .action.entry{border:1px solid transparent;background:transparent;color:#ee131b}
    .action.entry:hover{background:#fff1f2}
    .action:disabled{cursor:not-allowed;opacity:.58;box-shadow:none}
    .switch-row{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:24px;color:#4b5563;font-size:12px;line-height:18px;white-space:nowrap}
    .switch{position:relative;width:28px;height:16px;padding:0;flex:0 0 auto;border:0;border-radius:999px;background:#d1d5db;cursor:pointer;transition:background-color 160ms ease}
    .switch::after{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22);content:"";transition:transform 160ms ease}
    .switch[aria-checked="true"]{background:#1677ff}
    .switch[aria-checked="true"]::after{transform:translateX(12px)}
    .switch:disabled{cursor:not-allowed;opacity:.58}
    .status{display:flex;align-items:flex-start;gap:6px;margin:8px 20px 0;color:#6b7280;font-size:10px;line-height:1.4;word-break:break-word}
    .status-dot{width:6px;height:6px;margin-top:4px;flex:0 0 auto;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.12)}
    .status.connected .status-dot{background:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.12)}
    .action:focus-visible,.collapse:focus-visible,.launcher:focus-visible,.switch:focus-visible,.modal-button:focus-visible{outline:3px solid rgba(22,119,255,.28);outline-offset:2px}
    .launcher{position:fixed;width:64px;height:64px;padding:12px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 16px 4px rgba(238,19,27,.6);pointer-events:auto;cursor:move;transition:all 300ms ease;touch-action:none}
    .launcher img{display:block;width:40px;height:40px;border-radius:8px;object-fit:contain;pointer-events:none;user-select:none}
    .modal-backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.38);pointer-events:auto}
    .modal{width:min(420px,calc(100vw - 48px));padding:22px;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(15,23,42,.28);color:#20242c}
    .modal-title{margin:0;color:#1f2937;font-size:18px;font-weight:700;line-height:1.4}
    .modal-content{margin:11px 0 0;color:#5f6672;font-size:14px;line-height:1.65;white-space:pre-line}
    .modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
    .modal-button{min-height:34px;padding:6px 15px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
    .modal-button.cancel{border:1px solid #d9d9d9;background:#fff;color:#3f4650}
    .modal-button.confirm{border:1px solid #1677ff;background:#1677ff;color:#fff}
    .modal-button:disabled{cursor:not-allowed;opacity:.58}
    @media (max-width:480px){.modal-backdrop{padding:16px}.modal{width:calc(100vw - 32px)}}
  </style>
  <section class="panel" id="ozon-floating-panel" aria-label="鲸智 AI Ozon 工具">
    <header class="header">
      <div class="brand"><img class="brand-logo" src="${logoUrl}" width="20" height="20" alt=""><span class="brand-name">鲸智 AI</span></div>
      <button class="collapse" id="ozon-panel-collapse" type="button" aria-label="收起鲸智 AI 浮窗">−</button>
    </header>
    <div class="actions" id="ozon-panel-actions">
      <button class="action link" id="ozon-open-seller" type="button">打开OZON后台</button>
      <button class="action danger" id="ozon-one-click-listing" type="button" data-page="detail">一键上架</button>
      <button class="action primary" id="ozon-profit-calculator" type="button">计算利润</button>
      <button class="action amber" id="ozon-pricing-tool" type="button">定价工具</button>
      <button class="action primary" id="ozon-bind-cookie" type="button" aria-busy="false">绑定Cookie</button>
      <button class="action default" id="ozon-selection-settings" type="button">设置选品</button>
      <div class="switch-row" id="ozon-list-card-control" data-page="list"><span>隐藏卡片</span><button class="switch" id="ozon-list-card-switch" type="button" role="switch" aria-label="隐藏列表分析卡片" aria-checked="false"></button></div>
      <div class="switch-row" id="ozon-detail-card-control" data-page="detail"><span>其它卡片</span><button class="switch" id="ozon-detail-card-switch" type="button" role="switch" aria-label="显示商品详情分析卡片" aria-checked="true"></button></div>
      <button class="action entry" id="ozon-enter-erp" type="button">进入ERP</button>
    </div>
    <div class="status" id="ozon-seller-status" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="ozon-seller-status-text">正在检测 Ozon Seller...</span></div>
  </section>
  <button class="launcher" id="ozon-panel-launcher" type="button" aria-label="展开鲸智 AI 浮窗" hidden><img src="${logoUrl}" width="40" draggable="false" alt="鲸智 AI" style="pointer-events:none;user-select:none"></button>
  <div class="modal-backdrop" id="ozon-tool-dialog-backdrop" hidden>
    <section class="modal" id="ozon-tool-dialog" role="dialog" aria-modal="true" aria-labelledby="ozon-tool-dialog-title" aria-describedby="ozon-tool-dialog-content">
      <h2 class="modal-title" id="ozon-tool-dialog-title"></h2>
      <p class="modal-content" id="ozon-tool-dialog-content"></p>
      <div class="modal-actions">
        <button class="modal-button cancel" id="ozon-tool-dialog-cancel" type="button">取消</button>
        <button class="modal-button confirm" id="ozon-tool-dialog-confirm" type="button" aria-busy="false">确定</button>
      </div>
    </section>
  </div>`
}

function requiredElement<T extends Element>(root: ShadowRoot, id: string): T {
  const element = root.querySelector<T>(`#${id}`)
  if (!element) throw new Error(`Ozon 浮窗缺少元素：${id}`)
  return element
}

/** Mount one isolated, fixed bottom-right Ozon panel. */
export function startOzonFloatingPanel(options: OzonFloatingPanelOptions = {}): OzonFloatingPanelController {
  activeController?.stop()
  document.getElementById(OZON_FLOATING_PANEL_HOST_ID)?.remove()

  const host = document.createElement('div')
  host.id = OZON_FLOATING_PANEL_HOST_ID
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = buildOzonFloatingPanelShadow(browser.runtime.getURL('/brand-logo.png'))
  document.documentElement.append(host)

  const panel = requiredElement<HTMLElement>(shadow, 'ozon-floating-panel')
  const launcher = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-launcher')
  const collapseButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-collapse')
  const status = requiredElement<HTMLElement>(shadow, 'ozon-seller-status')
  const statusText = requiredElement<HTMLElement>(shadow, 'ozon-seller-status-text')
  const openSellerButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-open-seller')
  const listingButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-one-click-listing')
  const profitButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-profit-calculator')
  const pricingButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-pricing-tool')
  const bindCookieButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-bind-cookie')
  const selectionButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-selection-settings')
  const listCardControl = requiredElement<HTMLElement>(shadow, 'ozon-list-card-control')
  const detailCardControl = requiredElement<HTMLElement>(shadow, 'ozon-detail-card-control')
  const listCardSwitch = requiredElement<HTMLButtonElement>(shadow, 'ozon-list-card-switch')
  const detailCardSwitch = requiredElement<HTMLButtonElement>(shadow, 'ozon-detail-card-switch')
  const enterErpButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-enter-erp')
  const dialogBackdrop = requiredElement<HTMLElement>(shadow, 'ozon-tool-dialog-backdrop')
  const dialogTitle = requiredElement<HTMLElement>(shadow, 'ozon-tool-dialog-title')
  const dialogContent = requiredElement<HTMLElement>(shadow, 'ozon-tool-dialog-content')
  const dialogCancelButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-tool-dialog-cancel')
  const dialogConfirmButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-tool-dialog-confirm')
  const eventAbortController = new AbortController()
  const { signal } = eventAbortController
  const initialState = options.initialState ?? DEFAULT_OZON_PANEL_STATE
  let launcherPosition = clampOzonPanelPosition(
    initialState.launcherPosition,
    window.innerWidth,
    window.innerHeight,
  )
  let fallbackVisibility: OzonCardVisibility = {
    listCardsHidden: initialState.listCardsHidden,
    detailCardsVisible: initialState.detailCardsVisible,
  }
  let stopped = false
  let requestSequence = 0
  let dialogSequence = 0
  let sellerRecheckTimer: number | undefined
  let dialogReturnFocus: HTMLElement | null = null
  let dialogConfirmAction: (() => void | Promise<void>) | undefined
  let dialogBusy = false
  let dragStart: DragStart | undefined
  let dragging = false
  let suppressLauncherClick = false

  const setExpanded = (expanded: boolean): void => {
    panel.hidden = !expanded
    launcher.hidden = expanded
    if (expanded) collapseButton.focus()
  }

  const setConnected = (connected: boolean): void => {
    status.classList.toggle('connected', connected)
    openSellerButton.hidden = connected
  }

  const setStatus = (text: string): void => {
    statusText.textContent = text
  }

  const panelTools = createFloatingPanelTools({ shadow, signal, setStatus })

  const setBinding = (busy: boolean): void => {
    bindCookieButton.disabled = busy
    bindCookieButton.textContent = busy ? '绑定中...' : '绑定Cookie'
    bindCookieButton.setAttribute('aria-busy', String(busy))
  }

  const setDialogBusy = (busy: boolean): void => {
    dialogBusy = busy
    dialogCancelButton.disabled = busy
    dialogConfirmButton.disabled = busy
    dialogConfirmButton.setAttribute('aria-busy', String(busy))
  }

  const closeDialog = (returnFocus = true): void => {
    if (dialogBackdrop.hidden || dialogBusy) return
    dialogSequence += 1
    dialogBackdrop.hidden = true
    dialogConfirmAction = undefined
    if (returnFocus) dialogReturnFocus?.focus()
    dialogReturnFocus = null
  }

  const showDialog = (dialogOptions: DialogOptions): void => {
    dialogSequence += 1
    dialogReturnFocus = shadow.activeElement instanceof HTMLElement
      ? shadow.activeElement
      : collapseButton
    dialogTitle.textContent = dialogOptions.title
    dialogContent.textContent = dialogOptions.content
    dialogCancelButton.textContent = dialogOptions.cancelText ?? '取消'
    dialogCancelButton.hidden = dialogOptions.cancelText === undefined && dialogOptions.onConfirm === undefined
    dialogConfirmButton.textContent = dialogOptions.confirmText
    dialogConfirmAction = dialogOptions.onConfirm
    setDialogBusy(false)
    dialogBackdrop.hidden = false
    ;(dialogCancelButton.hidden ? dialogConfirmButton : dialogCancelButton).focus()
  }

  const showCookieFailure = (): void => {
    showDialog({
      title: '获取Cookie失败',
      content: '请登录 Ozon Seller 后，再点击“绑定Cookie”。当前扩展只读取 sc_company_id，不会上传或持久化原始 Cookie。',
      cancelText: '取消',
      confirmText: '立即前往Ozon Seller',
      onConfirm: () => openSeller(),
    })
  }

  const checkSeller = async (explicitCookieBinding: boolean, successMessage: string): Promise<void> => {
    const sequence = ++requestSequence
    if (explicitCookieBinding) {
      closeDialog(false)
      setBinding(true)
      setStatus('正在绑定 Cookie...')
    } else {
      setStatus('正在检测 Ozon Seller...')
    }

    try {
      await readOzonSellerId()
      if (stopped || sequence !== requestSequence) return
      setConnected(true)
      setStatus(successMessage)
      closeDialog(false)
    } catch (error: unknown) {
      if (stopped || sequence !== requestSequence) return
      const state = sellerInteractionErrorState(error, explicitCookieBinding)
      setConnected(false)
      setStatus(state.message)
      if (state.showCookieFailure) showCookieFailure()
    } finally {
      if (!stopped && sequence === requestSequence && explicitCookieBinding) setBinding(false)
    }
  }

  const openSeller = (): void => {
    if (!dialogBusy) closeDialog(false)
    window.open(OZON_SELLER_DASHBOARD_URL, '_blank', 'noopener,noreferrer')
    setStatus('已打开 Ozon Seller，登录后将自动重新检测')
    if (sellerRecheckTimer !== undefined) window.clearTimeout(sellerRecheckTimer)
    sellerRecheckTimer = window.setTimeout(() => {
      sellerRecheckTimer = undefined
      if (!stopped && host.isConnected) void checkSeller(false, 'Ozon Seller 已连接')
    }, OZON_SELLER_RECHECK_DELAY_MS)
  }

  const cardVisibility = (): OzonCardVisibility => options.getCardVisibility?.() ?? fallbackVisibility

  const syncCardSwitches = (): void => {
    const visibility = cardVisibility()
    fallbackVisibility = { ...visibility }
    listCardSwitch.setAttribute('aria-checked', String(visibility.listCardsHidden))
    detailCardSwitch.setAttribute('aria-checked', String(visibility.detailCardsVisible))
  }

  const reconcile = (): void => {
    if (stopped) return
    const page = analyticsPageForUrl(window.location.href)
    listingButton.hidden = page.kind !== 'detail'
    detailCardControl.hidden = page.kind !== 'detail'
    listCardControl.hidden = page.kind !== 'list'
    syncCardSwitches()
  }

  const persistPosition = (position: OzonPanelPosition): void => {
    void options.persistLauncherPosition?.({ ...position }).catch((error: unknown) => {
      if (!stopped) setStatus(`浮窗位置保存失败：${errorMessage(error)}`)
    })
  }

  const applyLauncherPosition = (position: OzonPanelPosition, persist: boolean): void => {
    launcherPosition = { ...position }
    launcher.style.right = `${position.right}px`
    launcher.style.bottom = `${position.bottom}px`
    if (persist) persistPosition(position)
  }

  const toggleListCards = async (): Promise<void> => {
    const hidden = !cardVisibility().listCardsHidden
    listCardSwitch.disabled = true
    try {
      await options.setListCardsHidden?.(hidden)
      fallbackVisibility = { ...fallbackVisibility, listCardsHidden: hidden }
      syncCardSwitches()
      setStatus(hidden ? '已隐藏列表分析卡片' : '已显示列表分析卡片')
    } catch (error: unknown) {
      syncCardSwitches()
      setStatus(`列表卡片设置失败：${errorMessage(error)}`)
    } finally {
      if (!stopped) listCardSwitch.disabled = false
    }
  }

  const toggleDetailCards = async (): Promise<void> => {
    const visible = !cardVisibility().detailCardsVisible
    detailCardSwitch.disabled = true
    try {
      await options.setDetailCardsVisible?.(visible)
      fallbackVisibility = { ...fallbackVisibility, detailCardsVisible: visible }
      syncCardSwitches()
      setStatus(visible ? '已显示商品详情分析卡片' : '已隐藏商品详情分析卡片')
    } catch (error: unknown) {
      syncCardSwitches()
      setStatus(`详情卡片设置失败：${errorMessage(error)}`)
    } finally {
      if (!stopped) detailCardSwitch.disabled = false
    }
  }

  collapseButton.addEventListener('click', () => setExpanded(false), { signal })
  launcher.addEventListener('click', () => {
    if (suppressLauncherClick) {
      suppressLauncherClick = false
      return
    }
    setExpanded(true)
  }, { signal })
  launcher.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      position: { ...launcherPosition },
    }
    dragging = false
  }, { signal })
  document.addEventListener('mousemove', (event) => {
    if (!dragStart) return
    const deltaX = event.clientX - dragStart.clientX
    const deltaY = event.clientY - dragStart.clientY
    if (!dragging && Math.hypot(deltaX, deltaY) <= OZON_PANEL_DRAG_THRESHOLD_PX) return
    dragging = true
    event.preventDefault()
    applyLauncherPosition(clampOzonPanelPosition({
      right: dragStart.position.right - deltaX,
      bottom: dragStart.position.bottom - deltaY,
    }, window.innerWidth, window.innerHeight), true)
  }, { signal })
  document.addEventListener('mouseup', () => {
    if (!dragStart) return
    if (dragging) {
      const snapped = snapOzonPanelPositionToNearestEdge(
        launcherPosition,
        window.innerWidth,
        window.innerHeight,
      )
      applyLauncherPosition(snapped, true)
      suppressLauncherClick = true
    }
    dragStart = undefined
    dragging = false
  }, { signal })
  window.addEventListener('resize', () => {
    const clamped = clampOzonPanelPosition(launcherPosition, window.innerWidth, window.innerHeight)
    if (!samePosition(clamped, launcherPosition)) applyLauncherPosition(clamped, true)
  }, { signal })
  openSellerButton.addEventListener('click', openSeller, { signal })
  bindCookieButton.addEventListener('click', () => {
    void checkSeller(true, 'Cookie 已绑定')
  }, { signal })
  listingButton.addEventListener('click', () => panelTools.openListing(listingButton), { signal })
  profitButton.addEventListener('click', () => panelTools.openPricing('calculate2', profitButton), { signal })
  pricingButton.addEventListener('click', () => panelTools.openPricing('calculate', pricingButton), { signal })
  selectionButton.addEventListener('click', () => panelTools.openSelection(selectionButton), { signal })
  enterErpButton.addEventListener('click', () => panelTools.openErp(enterErpButton), { signal })
  listCardSwitch.addEventListener('click', () => {
    void toggleListCards()
  }, { signal })
  detailCardSwitch.addEventListener('click', () => {
    void toggleDetailCards()
  }, { signal })
  dialogCancelButton.addEventListener('click', () => closeDialog(), { signal })
  dialogConfirmButton.addEventListener('click', () => {
    if (dialogBusy) return
    if (!dialogConfirmAction) {
      closeDialog()
      return
    }
    void dialogConfirmAction()
  }, { signal })
  dialogBackdrop.addEventListener('click', (event) => {
    if (event.target === dialogBackdrop) closeDialog()
  }, { signal })
  shadow.addEventListener('keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Escape' && !dialogBackdrop.hidden) closeDialog()
  }, { signal })

  applyLauncherPosition(launcherPosition, !samePosition(launcherPosition, initialState.launcherPosition))
  reconcile()

  const controller: OzonFloatingPanelController = {
    reconcile,
    stop: () => {
      if (stopped) return
      stopped = true
      requestSequence += 1
      dialogSequence += 1
      panelTools.stop()
      eventAbortController.abort()
      if (sellerRecheckTimer !== undefined) window.clearTimeout(sellerRecheckTimer)
      host.remove()
      if (activeController === controller) activeController = undefined
    },
  }
  activeController = controller
  void checkSeller(false, 'Ozon Seller 已连接')
  return controller
}
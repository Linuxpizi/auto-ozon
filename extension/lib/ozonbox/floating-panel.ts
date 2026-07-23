import { analyticsPageForUrl } from './analytics-card'
import type {
  OzonboxCollectAndSaveResult,
  OzonboxCollectedProduct,
  OzonboxSellerCookie,
  OzonboxSellerCookiesResponse,
} from './contract'
import { isRecord } from './contract'
import { createFloatingPanelTools } from './floating-panel-tools'
import { requirePanelToolData, type PanelToolRequest } from './panel-tools-contract'
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
import { getAuthSession } from '../utils/storage'

export const OZON_FLOATING_PANEL_HOST_ID = 'jingzhi-ai-ozon-floating-panel'
export const OZON_SELLER_RECHECK_DELAY_MS = 5_000
export const OZON_AUTH_POLL_INTERVAL_MS = 2_000
export const OZON_AUTH_POLL_TIMEOUT_MS = 30_000
export const OZON_PANEL_DRAG_THRESHOLD_PX = 5
export const OZON_PANEL_DRAG_RELEASE_DELAY_MS = 100

export interface OzonFloatingPanelController {
  reconcile: () => void
  openListingForProduct: (product: OzonboxCollectedProduct) => void
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
  offsetX: number
  offsetY: number
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

export function parseSellerCookiesResponse(value: unknown): OzonboxSellerCookie[] {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    throw new Error(value.error.trim())
  }
  if (!isRecord(value) || !Array.isArray(value.cookies) || !value.cookies.every(isRecord)) {
    throw new Error('Cookie 服务返回了无效响应')
  }
  return (value as unknown as OzonboxSellerCookiesResponse).cookies
}

export function buildOzonFloatingPanelShadow(logoUrl: string): string {
  return `<style>
    :host{all:initial}
    *,*::before,*::after{box-sizing:border-box}
    [hidden]{display:none!important}
    button{font:inherit}
    .sidebar,.launcher,.ant-modal-root,.ant-tooltip{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
    .sidebar{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;width:144px;flex-direction:column;align-items:stretch;padding-bottom:8px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px oklch(96.7% .003 264.542),0 0 16px 4px rgba(238,19,27,.2);color:#000000e0;pointer-events:auto;transition:all .3s}
    .sidebar-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0}
    .sidebar-brand{display:flex;align-items:center;flex-wrap:nowrap}
    .brand-logo{display:block;width:20px;height:20px;margin-right:8px;object-fit:contain}
    .brand-name{font-size:14px;line-height:20px;white-space:nowrap}
    .collapse{display:flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;border:1px solid #eab308;border-radius:9999px;background:#eab308;color:#facc15;cursor:pointer;box-shadow:0 1px 2px 0 #0000000d;transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}
    .collapse:hover{background:#facc15}
    .collapse-icon{display:inline-flex;font-size:7px;line-height:0}
    .collapse-icon svg{display:inline-block;width:1em;height:1em;fill:currentColor}
    .authenticated-actions{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px 20px 0}
    .ant-btn{outline:none;position:relative;display:inline-block;font-weight:400;white-space:nowrap;text-align:center;background-image:none;background-color:transparent;border:1px solid transparent;cursor:pointer;transition:all .2s cubic-bezier(.645,.045,.355,1);user-select:none;touch-action:manipulation;line-height:1.5714285714285714;color:#000000e0;font-size:14px;height:32px;padding:4px 15px;border-radius:6px}
    .ant-btn.ant-btn-round{border-radius:32px;padding-inline-start:16px;padding-inline-end:16px}
    .ant-btn.ant-btn-block{width:100%}
    .ant-btn-default{background:#fff;border-color:#d9d9d9;box-shadow:0 2px #00000005}
    .ant-btn-default:not(:disabled):hover{color:#4096ff;border-color:#4096ff}
    .ant-btn-primary{color:#fff;background:#1677ff;box-shadow:0 2px #0591ff1a}
    .ant-btn-primary:not(:disabled):hover{color:#fff;background:#4096ff}
    .ant-btn-primary:not(:disabled):active{color:#fff;background:#0958d9}
    .ant-btn-primary.ant-btn-dangerous{background:#ff4d4f;box-shadow:0 2px #ff4d4f17}
    .ant-btn-primary.ant-btn-dangerous:not(:disabled):hover{background:#ff7875}
    .ant-btn-primary.ant-btn-dangerous:not(:disabled):active{background:#d9363e}
    .ant-btn-link{color:#1677ff;background:transparent;box-shadow:none}
    .ant-btn-link:not(:disabled):hover{color:#69b1ff}
    .ant-btn-link:not(:disabled):active{color:#0958d9}
    .ant-btn-sm{height:24px;padding:0 7px;border-radius:4px;font-size:14px}
    .ant-btn-amber{color:#fff!important;background:#f59e0b!important;border-color:#f59e0b!important;box-shadow:none!important}
    .ant-btn-amber:not(:disabled):hover{color:#fff!important;background:#fbbf24!important;border-color:#fbbf24!important}
    .ant-btn-amber:not(:disabled):active{background:#d97706!important;border-color:#d97706!important}
    .ant-btn:disabled{cursor:not-allowed;color:#00000040;border-color:#d9d9d9;background:#0000000a;box-shadow:none}
    .switch-control{display:flex;align-items:center;justify-content:center}
    .ant-switch{position:relative;display:inline-block;box-sizing:border-box;min-width:44px;height:22px;padding:0;overflow:hidden;color:#fff;font-size:14px;line-height:22px;vertical-align:middle;background:#00000040;border:0;border-radius:100px;cursor:pointer;transition:all .2s}
    .ant-switch-handle{position:absolute;top:2px;inset-inline-start:2px;width:18px;height:18px;transition:all .2s ease-in-out}
    .ant-switch-handle::before{position:absolute;inset:0;background:#fff;border-radius:9px;box-shadow:0 2px 4px #00230b33;content:""}
    .ant-switch-inner{display:block;overflow:hidden;border-radius:100px;height:100%;padding-inline-start:24px;padding-inline-end:9px;transition:padding-inline-start .2s ease-in-out,padding-inline-end .2s ease-in-out}
    .ant-switch-inner-checked,.ant-switch-inner-unchecked{display:block;color:#fff;font-size:12px;transition:margin-inline-start .2s ease-in-out,margin-inline-end .2s ease-in-out}
    .ant-switch[aria-checked="true"]{background:#1677ff}
    .ant-switch[aria-checked="true"] .ant-switch-handle{inset-inline-start:calc(100% - 20px)}
    .ant-switch[aria-checked="true"] .ant-switch-inner{padding-inline-start:9px;padding-inline-end:24px}
    .ant-switch:disabled{cursor:not-allowed;opacity:.65}
    .login-actions{padding:20px}
    .login-help{position:relative;margin-top:8px}
    .ant-tooltip{position:absolute;right:calc(100% + 8px);top:50%;z-index:999999;width:max-content;max-width:250px;padding:6px 8px;border-radius:6px;background:#000000d9;color:#fff;font-size:14px;line-height:1.5714285714285714;opacity:0;pointer-events:none;transform:translateY(-50%);transition:opacity .2s}
    .login-help:hover .ant-tooltip,.login-help:focus-within .ant-tooltip{opacity:1}
    .launcher{position:fixed;z-index:9999;width:64px;height:64px;padding:12px;border:0;border-radius:9999px;background:#fff;box-shadow:0 0 16px 4px rgba(238,19,27,.6);pointer-events:auto;cursor:move;transition:all .3s;touch-action:none}
    .launcher img{display:block;width:40px;height:40px;object-fit:contain;pointer-events:none;user-select:none}
    .ant-modal-root{position:fixed;inset:0;z-index:2147483647;pointer-events:auto}
    .ant-modal-mask{position:absolute;inset:0;background:#00000073}
    .ant-modal-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:auto;outline:0}
    .ant-modal{position:relative;width:416px;max-width:calc(100vw - 32px);padding-bottom:0;color:#000000e0;font-size:14px;line-height:1.5714285714285714}
    .ant-modal-content{position:relative;padding:20px 24px;border-radius:8px;background:#fff;box-shadow:0 6px 16px 0 #00000014,0 3px 6px -4px #0000001f,0 9px 28px 8px #0000000d}
    .ant-modal-confirm-title{display:block;overflow:hidden;color:#000000e0;font-size:16px;line-height:1.5}
    .ant-modal-confirm-content{margin-top:8px;color:#000000e0;font-size:14px;line-height:1.5714285714285714;white-space:pre-line}
    .ant-modal-confirm-btns{display:flex;flex-direction:row-reverse;gap:8px;margin-top:24px}
  </style>
  <section class="sidebar fixed bottom-5 right-5 bg-white rounded-xl z-[2147483647] flex flex-col items-stretch shadow-[0_0_16px_4px_rgba(238,19,27,0.2)] ring ring-gray-100 w-36 transition-all duration-300 pb-2" id="ozon-floating-panel" aria-label="鲸智 AI Ozon 工具">
    <header class="sidebar-header flex items-center justify-between px-3 pt-2">
      <div class="sidebar-brand flex items-center flex-nowrap"><img class="brand-logo w-5 h-5 mr-2" src="${logoUrl}" width="20" height="20" alt=""><span class="brand-name text-sm">鲸智 AI</span></div>
      <button class="collapse" id="ozon-panel-collapse" type="button" aria-label="收起鲸智 AI 浮窗"><span class="collapse-icon" aria-hidden="true"><svg viewBox="64 64 896 896" focusable="false"><path fill="currentColor" d="M872 474H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h720c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z"></path></svg></span></button>
    </header>
    <div class="authenticated-actions px-5 pt-2 flex flex-col items-center justify-center gap-2" id="ozon-panel-actions" hidden>
      <button class="ant-btn ant-btn-link ant-btn-block ant-btn-round" id="ozon-open-seller" type="button">打开OZON后台</button>
      <button class="ant-btn ant-btn-primary ant-btn-dangerous ant-btn-block ant-btn-round" id="ozon-one-click-listing" type="button" data-page="detail">一键上架</button>
      <button class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-profit-calculator" type="button">计算利润</button>
      <button class="ant-btn ant-btn-default ant-btn-amber ant-btn-block ant-btn-round" id="ozon-pricing-tool" type="button">定价工具</button>
      <button class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-bind-cookie" type="button" aria-busy="false">绑定Cookie</button>
      <button class="ant-btn ant-btn-default ant-btn-block ant-btn-round" id="ozon-selection-settings" type="button">设置选品</button>
      <div class="switch-control" id="ozon-list-card-control" data-page="list"><button class="ant-switch" id="ozon-list-card-switch" type="button" role="switch" aria-label="隐藏列表分析卡片" aria-checked="false"><span class="ant-switch-handle"></span><span class="ant-switch-inner"><span class="ant-switch-inner-checked">隐藏卡片</span></span></button></div>
      <div class="switch-control" id="ozon-detail-card-control" data-page="detail"><button class="ant-switch" id="ozon-detail-card-switch" type="button" role="switch" aria-label="显示商品详情分析卡片" aria-checked="true"><span class="ant-switch-handle"></span><span class="ant-switch-inner"><span class="ant-switch-inner-checked">其它卡片</span></span></button></div>
      <button class="ant-btn ant-btn-link ant-btn-sm" id="ozon-enter-erp" type="button">进入ERP</button>
    </div>
    <div class="login-actions p-5" id="ozon-panel-login-actions" hidden>
      <button class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" id="ozon-panel-login" type="button">请登录</button>
      <div class="login-help"><button class="ant-btn ant-btn-link ant-btn-block ant-btn-round" id="ozon-panel-login-help" type="button" aria-describedby="ozon-panel-login-tooltip">登录有问题？</button><div class="ant-tooltip" id="ozon-panel-login-tooltip" role="tooltip">1.关闭浏览器重新打开<br>2.卸载插件重新安装<br>3.仍然无法登录请联系客服</div></div>
    </div>
  </section>
  <button class="launcher fixed bg-white rounded-full shadow-[0_0_16px_4px_rgba(238,19,27,0.6)] z-[9999] p-3 flex items-center justify-center transition-all duration-300 cursor-move" id="ozon-panel-launcher" type="button" aria-label="展开鲸智 AI 浮窗" hidden><img src="${logoUrl}" width="40px" draggable="false" alt="鲸智 AI" style="pointer-events:none;user-select:none"></button>
  <div class="ant-modal-root" id="ozon-tool-dialog-backdrop" hidden>
    <div class="ant-modal-mask"></div>
    <div class="ant-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="ozon-tool-dialog-title" aria-describedby="ozon-tool-dialog-content">
      <div class="ant-modal"><div class="ant-modal-content"><div class="ant-modal-confirm-body-wrapper">
        <div class="ant-modal-confirm-title" id="ozon-tool-dialog-title"></div>
        <div class="ant-modal-confirm-content" id="ozon-tool-dialog-content"></div>
        <div class="ant-modal-confirm-btns">
          <button class="ant-btn ant-btn-primary" id="ozon-tool-dialog-confirm" type="button" aria-busy="false">确定</button>
          <button class="ant-btn ant-btn-default" id="ozon-tool-dialog-cancel" type="button">取消</button>
        </div>
      </div></div></div>
    </div>
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
  const actions = requiredElement<HTMLElement>(shadow, 'ozon-panel-actions')
  const loginActions = requiredElement<HTMLElement>(shadow, 'ozon-panel-login-actions')
  const loginButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-login')
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
  let sellerRequestSequence = 0
  let cookieRequestSequence = 0
  let authSequence = 0
  let dialogSequence = 0
  let sellerRecheckTimer: number | undefined
  let authPollTimer: number | undefined
  let authPollStartedAt: number | undefined
  let dragReleaseTimer: number | undefined
  let dialogReturnFocus: HTMLElement | null = null
  let dialogConfirmAction: (() => void | Promise<void>) | undefined
  let dialogBusy = false
  let dragStart: DragStart | undefined
  let dragging = false
  let suppressLauncherClick = false
  let expanded = true
  let pageSupported = true

  const syncPanelVisibility = (): void => {
    panel.hidden = !pageSupported || !expanded
    launcher.hidden = !pageSupported || expanded
  }

  const setExpanded = (nextExpanded: boolean): void => {
    expanded = nextExpanded
    syncPanelVisibility()
    if (nextExpanded && pageSupported) collapseButton.focus()
  }

  const setConnected = (connected: boolean): void => {
    openSellerButton.hidden = connected
  }

  // The reference sidebar has no status region. Existing tool adapters still
  // accept this callback, so keep it deliberately non-visual.
  const setStatus = (_text: string): void => undefined

  const syncAuthentication = async (showLoading = true): Promise<boolean> => {
    const sequence = ++authSequence
    if (showLoading) {
      actions.hidden = true
      loginActions.hidden = true
    }
    try {
      const session = await getAuthSession()
      if (stopped || sequence !== authSequence) return false
      const authenticated = Boolean(session?.access_token)
      actions.hidden = !authenticated
      loginActions.hidden = authenticated
      return authenticated
    } catch (error: unknown) {
      if (!stopped && sequence === authSequence) {
        console.error('登录状态读取失败:', error)
      }
      return false
    }
  }

  const panelTools = createFloatingPanelTools({ shadow, signal, setStatus })

  const setBinding = (busy: boolean): void => {
    bindCookieButton.disabled = busy
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
      content: '请登录ozon后台后,再点击获取Cookie,请至少一个店铺有有效Cookie,否则无法上架产品和查看销量关键信息',
      cancelText: '取消',
      confirmText: '立即前往Ozon Seller',
      onConfirm: () => openSeller(),
    })
  }

  const showFailure = (title: string, error: unknown): void => {
    showDialog({
      title,
      content: errorMessage(error),
      confirmText: '确定',
    })
  }

  const openErpRoot = async (): Promise<void> => {
    const request: PanelToolRequest = { type: 'PANEL_ERP_OPEN', route: '/' }
    requirePanelToolData(await browser.runtime.sendMessage(request))
  }

  const stopAuthPolling = (): void => {
    if (authPollTimer !== undefined) window.clearTimeout(authPollTimer)
    authPollTimer = undefined
    authPollStartedAt = undefined
  }

  const scheduleAuthPoll = (): void => {
    if (stopped || authPollStartedAt === undefined) return
    if (Date.now() - authPollStartedAt >= OZON_AUTH_POLL_TIMEOUT_MS) {
      stopAuthPolling()
      return
    }
    if (authPollTimer !== undefined) window.clearTimeout(authPollTimer)
    authPollTimer = window.setTimeout(() => {
      authPollTimer = undefined
      void syncAuthentication(false).then((authenticated) => {
        if (authenticated) stopAuthPolling()
        else scheduleAuthPoll()
      })
    }, OZON_AUTH_POLL_INTERVAL_MS)
  }

  const startAuthPolling = (): void => {
    stopAuthPolling()
    authPollStartedAt = Date.now()
    scheduleAuthPoll()
  }

  const checkSeller = async (): Promise<void> => {
    const sequence = ++sellerRequestSequence
    try {
      await readOzonSellerId()
      if (stopped || sequence !== sellerRequestSequence) return
      setConnected(true)
    } catch (error: unknown) {
      if (stopped || sequence !== sellerRequestSequence) return
      setConnected(false)
      console.error('检查seller tab失败:', error)
    }
  }

  const bindSellerCookies = async (): Promise<void> => {
    const sequence = ++cookieRequestSequence
    closeDialog(false)
    setBinding(true)
    try {
      const cookies = parseSellerCookiesResponse(await browser.runtime.sendMessage({
        type: 'OZONBOX_GET_SELLER_COOKIES',
      }))
      if (stopped || sequence !== cookieRequestSequence) return
      if (cookies.length === 0) {
        showCookieFailure()
        return
      }
      showDialog({
        title: '绑定Cookie失败',
        content: `已获取 ${cookies.length} 个 Ozon Seller Cookie，但当前项目未提供 Cookie 绑定接口，未执行绑定。`,
        confirmText: '确定',
      })
    } catch (error: unknown) {
      if (stopped || sequence !== cookieRequestSequence) return
      showFailure('获取Cookie失败', error)
    } finally {
      if (!stopped && sequence === cookieRequestSequence) setBinding(false)
    }
  }

  const openSeller = (): void => {
    if (!dialogBusy) closeDialog(false)
    window.open(OZON_SELLER_DASHBOARD_URL, '_blank', 'noopener,noreferrer')
    if (sellerRecheckTimer !== undefined) window.clearTimeout(sellerRecheckTimer)
    sellerRecheckTimer = window.setTimeout(() => {
      sellerRecheckTimer = undefined
      if (!stopped && host.isConnected) void checkSeller()
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
    pageSupported = page.kind !== 'other'
    syncPanelVisibility()
    if (!pageSupported && !dialogBackdrop.hidden) closeDialog(false)
    listingButton.hidden = page.kind !== 'detail'
    detailCardControl.hidden = page.kind !== 'detail'
    listCardControl.hidden = page.kind !== 'list'
    syncCardSwitches()
  }

  const persistPosition = (position: OzonPanelPosition): void => {
    void options.persistLauncherPosition?.({ ...position }).catch((error: unknown) => {
      if (!stopped) console.error('浮窗位置保存失败:', error)
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
      window.location.reload()
    } catch (error: unknown) {
      syncCardSwitches()
      console.error('列表卡片设置失败:', error)
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
      window.location.reload()
    } catch (error: unknown) {
      syncCardSwitches()
      console.error('详情卡片设置失败:', error)
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
    if (dragReleaseTimer !== undefined) {
      window.clearTimeout(dragReleaseTimer)
      dragReleaseTimer = undefined
    }
    const rect = launcher.getBoundingClientRect()
    dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    dragging = false
    suppressLauncherClick = false
  }, { signal })
  document.addEventListener('mousemove', (event) => {
    if (!dragStart) return
    const deltaX = event.clientX - dragStart.clientX
    const deltaY = event.clientY - dragStart.clientY
    if (!dragging && Math.hypot(deltaX, deltaY) <= OZON_PANEL_DRAG_THRESHOLD_PX) return
    dragging = true
    event.preventDefault()
    applyLauncherPosition(clampOzonPanelPosition({
      right: window.innerWidth - (event.clientX - dragStart.offsetX) - launcher.offsetWidth,
      bottom: window.innerHeight - (event.clientY - dragStart.offsetY) - launcher.offsetHeight,
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
    if (dragReleaseTimer !== undefined) window.clearTimeout(dragReleaseTimer)
    dragReleaseTimer = window.setTimeout(() => {
      dragReleaseTimer = undefined
      dragStart = undefined
      dragging = false
      suppressLauncherClick = false
    }, OZON_PANEL_DRAG_RELEASE_DELAY_MS)
  }, { signal })
  window.addEventListener('resize', () => {
    const clamped = clampOzonPanelPosition(launcherPosition, window.innerWidth, window.innerHeight)
    if (!samePosition(clamped, launcherPosition)) applyLauncherPosition(clamped, true)
  }, { signal })
  openSellerButton.addEventListener('click', openSeller, { signal })
  loginButton.addEventListener('click', () => {
    loginButton.disabled = true
    void openErpRoot().then(() => {
      if (!stopped) startAuthPolling()
    }).catch((error: unknown) => {
      if (!stopped) showFailure('登录页面打开失败', error)
    }).finally(() => {
      if (!stopped) loginButton.disabled = false
    })
  }, { signal })
  bindCookieButton.addEventListener('click', () => {
    void bindSellerCookies()
  }, { signal })
  listingButton.addEventListener('click', () => panelTools.openListing({ source: listingButton }), { signal })
  profitButton.addEventListener('click', () => panelTools.openPricing('calculate2', profitButton), { signal })
  pricingButton.addEventListener('click', () => panelTools.openPricing('calculate', pricingButton), { signal })
  selectionButton.addEventListener('click', () => panelTools.openSelection(selectionButton), { signal })
  enterErpButton.addEventListener('click', () => {
    enterErpButton.disabled = true
    void openErpRoot().catch((error: unknown) => {
      if (!stopped) showFailure('ERP 打开失败', error)
    }).finally(() => {
      if (!stopped) enterErpButton.disabled = false
    })
  }, { signal })
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

  const handleStorageChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    areaName,
  ) => {
    if (areaName === 'local' && 'plugin_auth' in changes) {
      void syncAuthentication().then((authenticated) => {
        if (authenticated) stopAuthPolling()
      })
    }
  }
  browser.storage.onChanged.addListener(handleStorageChange)

  applyLauncherPosition(launcherPosition, !samePosition(launcherPosition, initialState.launcherPosition))
  reconcile()
  void syncAuthentication()

  const controller: OzonFloatingPanelController = {
    reconcile,
    openListingForProduct: (product) => panelTools.openListing({ product }),
    stop: () => {
      if (stopped) return
      stopped = true
      sellerRequestSequence += 1
      cookieRequestSequence += 1
      authSequence += 1
      dialogSequence += 1
      panelTools.stop()
      eventAbortController.abort()
      browser.storage.onChanged.removeListener(handleStorageChange)
      if (sellerRecheckTimer !== undefined) window.clearTimeout(sellerRecheckTimer)
      stopAuthPolling()
      if (dragReleaseTimer !== undefined) window.clearTimeout(dragReleaseTimer)
      host.remove()
      if (activeController === controller) activeController = undefined
    },
  }
  activeController = controller
  void checkSeller()
  return controller
}
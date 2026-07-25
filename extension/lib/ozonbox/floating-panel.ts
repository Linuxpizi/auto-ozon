import { createApp } from 'vue'
import OzonFloatingPanel from '../../components/ozonbox/OzonFloatingPanel.vue'
import floatingPanelStyles from '../../components/ozonbox/ozon-floating-panel.css?inline'
import { analyticsPageForUrl } from './analytics-card'
import type {
  OzonboxCollectAndSaveResult,
  OzonboxBindSellerCookiesResponse,
  OzonboxCollectedProduct,
  OzonboxSellerCookie,
  OzonboxSellerCookiesResponse,
} from './contract'
import { isRecord } from './contract'
import { createFloatingPanelTools } from './floating-panel-tools'
import type { OzonListCrawlStartConfig } from './list-crawl-contract'
import { requirePanelToolData, type PanelPricingRoute, type PanelToolRequest } from './panel-tools-contract'
import {
  clampOzonPanelPosition,
  DEFAULT_OZON_PANEL_STATE,
  snapOzonPanelPositionToNearestEdge,
  type OzonCardVisibility,
  type OzonPanelPosition,
  type OzonPanelState,
} from './panel-storage'
import {
  OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE,
  OZON_SELLER_DASHBOARD_URL,
} from './seller-session'
import { getAuthSession } from '../utils/storage'

export const OZON_FLOATING_PANEL_HOST_ID = 'jingzhi-ai-ozon-floating-panel'
export const OZON_AUTH_POLL_INTERVAL_MS = 2_000
export const OZON_AUTH_POLL_TIMEOUT_MS = 30_000
export const OZON_PANEL_DRAG_THRESHOLD_PX = 5
export const OZON_PANEL_DRAG_RELEASE_DELAY_MS = 100

export interface OzonFloatingPanelController {
  reconcile: () => void
  openListingForProduct: (product: OzonboxCollectedProduct) => void
  openPricingForProduct: (route: PanelPricingRoute, product: OzonboxCollectedProduct) => void
  stop: () => void
}

export interface OzonFloatingPanelOptions {
  initialState?: OzonPanelState
  getCardVisibility?: () => OzonCardVisibility
  setListCardsHidden?: (hidden: boolean) => Promise<void>
  setDetailCardsVisible?: (visible: boolean) => Promise<void>
  persistLauncherPosition?: (position: OzonPanelPosition) => Promise<void>
  collectAndSaveCurrentProduct?: () => Promise<OzonboxCollectAndSaveResult>
  onStartListCrawl?: (config: OzonListCrawlStartConfig) => void | Promise<void>
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

export function parseSellerCookieBindResponse(value: unknown): OzonboxBindSellerCookiesResponse {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    throw new Error(value.error.trim())
  }
  if (!isRecord(value)
    || value.success !== true
    || typeof value.clientId !== 'string'
    || !value.clientId.trim()
    || !Number.isInteger(value.cookieCount)
    || Number(value.cookieCount) < 0) {
    throw new Error('Cookie 绑定服务返回了无效响应')
  }
  return {
    success: true,
    clientId: value.clientId.trim(),
    cookieCount: Number(value.cookieCount),
  }
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
  const style = document.createElement('style')
  style.id = 'jingzhi-ozon-floating-panel-style'
  style.textContent = floatingPanelStyles
  const mountElement = document.createElement('div')
  mountElement.id = 'jingzhi-ozon-floating-panel-root'
  shadow.append(style, mountElement)
  document.documentElement.append(host)
  const app = createApp(OzonFloatingPanel, {
    logoUrl: browser.runtime.getURL('/brand-logo.png'),
  })
  app.mount(mountElement)

  const panel = requiredElement<HTMLElement>(shadow, 'ozon-floating-panel')
  const launcher = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-launcher')
  const collapseButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-collapse')
  const actions = requiredElement<HTMLElement>(shadow, 'ozon-panel-actions')
  const loginActions = requiredElement<HTMLElement>(shadow, 'ozon-panel-login-actions')
  const loginButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-panel-login')
  const listingButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-one-click-listing')
  const profitButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-profit-calculator')
  const pricingButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-pricing-tool')
  const bindCookieButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-bind-cookie')
  const startListCrawlButton = requiredElement<HTMLButtonElement>(shadow, 'ozon-start-list-crawl')
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
  let cookieRequestSequence = 0
  let authSequence = 0
  let dialogSequence = 0
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

  const bindSellerCookies = async (): Promise<void> => {
    const sequence = ++cookieRequestSequence
    closeDialog(false)
    setBinding(true)
    try {
      const result = parseSellerCookieBindResponse(await browser.runtime.sendMessage({
        type: 'OZONBOX_BIND_SELLER_COOKIES',
      }))
      if (stopped || sequence !== cookieRequestSequence) return
      showDialog({
        title: 'Cookie 已绑定',
        content: `店铺 ${result.clientId} 已安全绑定 ${result.cookieCount} 个 Cookie。`,
        confirmText: '确定',
      })
    } catch (error: unknown) {
      if (stopped || sequence !== cookieRequestSequence) return
      if (errorMessage(error) === OZON_COMPANY_ID_COOKIE_MISSING_MESSAGE) showCookieFailure()
      else showFailure('绑定Cookie失败', error)
    } finally {
      if (!stopped && sequence === cookieRequestSequence) setBinding(false)
    }
  }

  const openSeller = (): void => {
    if (!dialogBusy) closeDialog(false)
    window.open(OZON_SELLER_DASHBOARD_URL, '_blank', 'noopener,noreferrer')
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
    startListCrawlButton.hidden = page.kind !== 'list'
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
  profitButton.addEventListener('click', () => panelTools.openPricing('calculate2', { source: profitButton }), { signal })
  pricingButton.addEventListener('click', () => panelTools.openPricing('calculate', { source: pricingButton }), { signal })
  startListCrawlButton.addEventListener('click', () => {
    if (options.onStartListCrawl) {
      panelTools.openListCrawl(startListCrawlButton, options.onStartListCrawl)
    }
  }, { signal })
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
    openPricingForProduct: (route, product) => panelTools.openPricing(route, { product }),
    stop: () => {
      if (stopped) return
      stopped = true
      cookieRequestSequence += 1
      authSequence += 1
      dialogSequence += 1
      panelTools.stop()
      eventAbortController.abort()
      browser.storage.onChanged.removeListener(handleStorageChange)
      stopAuthPolling()
      if (dragReleaseTimer !== undefined) window.clearTimeout(dragReleaseTimer)
      app.unmount()
      host.remove()
      if (activeController === controller) activeController = undefined
    },
  }
  activeController = controller
  return controller
}
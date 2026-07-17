import { API_CONFIG } from '../../../utils/api-config'
import { proxyFetch } from '../../../utils/proxyFetch'
import { getMpChartVisible, setMpChartVisible } from './mpChartPreference'
import {
  buildMpChartHeadOnlyHtml,
  buildMpChartsRowHtml,
} from './mpChartRenderer'
import { initMpChartTooltipsOnce } from './mpChartTooltips'
import type { MpChartApiResponse, MpChartItem } from './types'

let pendingAbort: AbortController | null = null
let insertGen = 0
let cachedItem: MpChartItem | null = null
let cachedEmptyMessage: string | null = null
let currentSku: string | null = null
let watchObserver: MutationObserver | null = null
let reinsertTimer: ReturnType<typeof setTimeout> | null = null
let toggleBound = false
let toggleLoading = false
let containerRetryTimer: ReturnType<typeof setInterval> | null = null

const CONTAINER_RETRY_MS = 500
const CONTAINER_RETRY_MAX = 40

function findInjectTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.container.c')
}

function removeAllMpChartWraps(container: ParentNode) {
  container.querySelectorAll('.mjgd_ozon_mp_chart_wrap').forEach((el) => el.remove())
}

function prependHtml(container: HTMLElement, html: string) {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const node = wrap.firstElementChild
  if (node) container.prepend(node)
}

function clearContainerRetry() {
  if (containerRetryTimer) {
    clearInterval(containerRetryTimer)
    containerRetryTimer = null
  }
}

function injectEmptyChart(sku: string, message = '数据接口暂不可用') {
  const container = findInjectTarget()
  if (!container) return false
  cachedItem = null
  cachedEmptyMessage = message
  removeAllMpChartWraps(container)
  prependHtml(container, buildMpChartsRowHtml(null, message))
  ensureWatchdog(sku)
  return true
}

/** 容器未就绪时短间隔重试注入 */
function scheduleContainerRetry(sku: string, onReady: (container: HTMLElement) => void) {
  if (containerRetryTimer) return
  let attempts = 0
  containerRetryTimer = setInterval(() => {
    attempts += 1
    const container = findInjectTarget()
    if (container) {
      clearContainerRetry()
      onReady(container)
      return
    }
    if (attempts >= CONTAINER_RETRY_MAX) {
      clearContainerRetry()
    }
  }, CONTAINER_RETRY_MS)
}

function setToggleLoading(loading: boolean) {
  toggleLoading = loading
  document.querySelectorAll<HTMLElement>('.mjgd_ozon_mp_toggle').forEach((btn) => {
    if (loading) {
      btn.classList.add('is_loading')
      btn.setAttribute('aria-busy', 'true')
    } else {
      btn.classList.remove('is_loading')
      btn.removeAttribute('aria-busy')
    }
  })
}

function scheduleReinsert() {
  if (reinsertTimer) return
  reinsertTimer = setTimeout(() => {
    reinsertTimer = null
    try {
      reinsertMpChartIfNeeded()
    } catch {
      /* ignore */
    }
  }, 150)
}

function reinsertMpChartIfNeeded() {
  if (!currentSku) return
  const container = findInjectTarget()
  if (!container) return
  if (container.querySelector('.mjgd_ozon_mp_chart_wrap')) return

  if (!getMpChartVisible()) {
    prependHtml(container, buildMpChartHeadOnlyHtml())
    return
  }
  if (cachedItem) {
    prependHtml(container, buildMpChartsRowHtml(cachedItem))
  } else if (cachedEmptyMessage) {
    prependHtml(container, buildMpChartsRowHtml(null, cachedEmptyMessage))
  }
}

function ensureWatchdog(sku: string) {
  currentSku = sku
  if (watchObserver) return
  watchObserver = new MutationObserver(() => {
    scheduleReinsert()
  })
  watchObserver.observe(document.body, { childList: true, subtree: true })
}

function initMpChartToggleOnce() {
  if (toggleBound) return
  toggleBound = true
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest?.('.mjgd_ozon_mp_toggle') as HTMLElement | null
    if (!btn) return
    e.preventDefault()
    e.stopPropagation()
    if (toggleLoading) return
    const next = !getMpChartVisible()
    setMpChartVisible(next, true)
    refreshMpChartByConfig()
  })
}

async function fetchMpChartData(sku: string, signal: AbortSignal): Promise<MpChartApiResponse> {
  if (signal.aborted) throw new DOMException('请求已取消', 'AbortError')
  const url = `${API_CONFIG.LOCAL_API_BASE_URL}/mp/getMpChartData?sku=${encodeURIComponent(sku)}`
  const result = await proxyFetch(url, {
    method: 'GET',
    preset: 'local_auth',
    responseType: 'json',
  })
  if (signal.aborted) throw new DOMException('请求已取消', 'AbortError')
  const body = (result.body && typeof result.body === 'object'
    ? result.body
    : {}) as MpChartApiResponse
  if (!result.ok) {
    const error = new Error(result.error || `HTTP ${result.status}`) as Error & {
      status?: number
      code?: number
    }
    error.status = result.status
    error.code = body.code
    throw error
  }
  return body
}

function applyChartResponse(sku: string, res: MpChartApiResponse) {
  const doInject = (container: HTMLElement) => {
    removeAllMpChartWraps(container)
    if (res.code !== 200) {
      const message = res.msg || '数据接口暂不可用'
      cachedItem = null
      cachedEmptyMessage = message
      prependHtml(container, buildMpChartsRowHtml(null, message))
      ensureWatchdog(sku)
      return
    }
    const items = res.data?.items
    if (!items || typeof items !== 'object') {
      const message = '暂无图表数据'
      cachedItem = null
      cachedEmptyMessage = message
      prependHtml(container, buildMpChartsRowHtml(null, message))
      ensureWatchdog(sku)
      return
    }
    const keys = Object.keys(items)
    if (!keys.length) {
      const message = '暂无图表数据'
      cachedItem = null
      cachedEmptyMessage = message
      prependHtml(container, buildMpChartsRowHtml(null, message))
      ensureWatchdog(sku)
      return
    }
    const firstItem = items[keys[0]]
    cachedItem = firstItem
    cachedEmptyMessage = null
    prependHtml(container, buildMpChartsRowHtml(firstItem))
    ensureWatchdog(sku)
  }

  const container = findInjectTarget()
  if (container) {
    doInject(container)
    return
  }
  scheduleContainerRetry(sku, doInject)
}

function loadMpChartData(sku: string) {
  if (currentSku && currentSku !== sku) {
    cachedItem = null
    cachedEmptyMessage = null
  }
  currentSku = sku

  if (!getMpChartVisible()) {
    currentSku = sku
    const injectHead = (container: HTMLElement) => {
      if (!container.querySelector('.mjgd_ozon_mp_chart_wrap')) {
        prependHtml(container, buildMpChartHeadOnlyHtml())
      }
      ensureWatchdog(sku)
    }
    const container = findInjectTarget()
    if (container) {
      injectHead(container)
    } else {
      scheduleContainerRetry(sku, injectHead)
    }
    return
  }

  const gen = ++insertGen
  pendingAbort?.abort()
  const ac = new AbortController()
  pendingAbort = ac
  setToggleLoading(true)

  void fetchMpChartData(sku, ac.signal)
    .then((res) => {
      if (gen !== insertGen) return
      pendingAbort = null
      applyChartResponse(sku, res)
    })
    .catch((err: Error) => {
      if (err?.name === 'AbortError') return
      if (gen !== insertGen) return
      pendingAbort = null
      injectEmptyChart(sku, err.message || '数据接口暂不可用')
    })
    .finally(() => {
      if (gen === insertGen) setToggleLoading(false)
    })
}

/** 展开/收起后同步页面图表 DOM */
export function refreshMpChartByConfig() {
  const visible = getMpChartVisible()
  if (!visible) {
    insertGen += 1
    pendingAbort?.abort()
    pendingAbort = null
    const container = findInjectTarget()
    if (container) {
      removeAllMpChartWraps(container)
      prependHtml(container, buildMpChartHeadOnlyHtml())
      if (currentSku) ensureWatchdog(currentSku)
    }
    return
  }
  if (!currentSku) return

  const container = findInjectTarget()
  if (!container) return

  if (cachedItem) {
    removeAllMpChartWraps(container)
    prependHtml(container, buildMpChartsRowHtml(cachedItem))
    ensureWatchdog(currentSku)
    return
  }
  if (cachedEmptyMessage) {
    removeAllMpChartWraps(container)
    prependHtml(container, buildMpChartsRowHtml(null, cachedEmptyMessage))
    ensureWatchdog(currentSku)
    return
  }
  loadMpChartData(currentSku)
}

/** 详情页注入 MP 图表（对齐旧版 addBlueBox） */
export function startMpChart(sku: string) {
  initMpChartTooltipsOnce()
  initMpChartToggleOnce()
  loadMpChartData(sku)
}

export function stopMpChart() {
  insertGen += 1
  pendingAbort?.abort()
  pendingAbort = null
  clearContainerRetry()
  currentSku = null
  cachedItem = null
  cachedEmptyMessage = null
  watchObserver?.disconnect()
  watchObserver = null
  if (reinsertTimer) {
    clearTimeout(reinsertTimer)
    reinsertTimer = null
  }
  const container = findInjectTarget()
  if (container) removeAllMpChartWraps(container)
}

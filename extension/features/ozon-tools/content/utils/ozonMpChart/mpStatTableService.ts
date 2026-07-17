import { API_CONFIG } from '../../../utils/api-config'
import { proxyFetch } from '../../../utils/proxyFetch'
import { collectAllListSkuRefs } from '../ozonList/listPageScanner'
import { isOzonSearchByImagePage } from '../ozonList/ozonPageContext'
import { buildMpStatTableHtml } from './mpStatTableRenderer'

const ROOT_ID = 'mjgd_ozon_mpstat_root'
const DEBOUNCE_MS = 650

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let ajaxGen = 0

function findInjectTarget(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('.container.c')
  if (!all.length) return null
  for (const el of all) {
    if (
      el.querySelector(
        '[data-widget="searchResultsV2"],[data-widget="megaPaginator"],[data-widget="infiniteVirtualPaginator"],[data-widget="shopInShopContainer"]',
      )
    ) {
      return el
    }
  }
  return all[0]
}

function removeMpStatRoot() {
  document.getElementById(ROOT_ID)?.remove()
}

function injectHtml(target: HTMLElement, html: string) {
  const existing = target.querySelector(`#${ROOT_ID}`)
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const node = wrap.firstElementChild
  if (!node) return
  if (existing) {
    existing.replaceWith(node)
  } else {
    target.prepend(node)
  }
}

function buildImgMap(): Map<string, string> {
  const map = new Map<string, string>()
  collectAllListSkuRefs().forEach(({ sku, img }) => {
    if (img) map.set(sku, img)
  })
  return map
}

async function fetchMpTableData(skus: string[]): Promise<{ code?: number; data?: unknown }> {
  const url = `${API_CONFIG.LOCAL_API_BASE_URL}/mp/getMpTableData?skus=${encodeURIComponent(JSON.stringify(skus))}`
  const result = await proxyFetch(url, {
    method: 'GET',
    preset: 'local_auth',
    responseType: 'json',
  })
  const body = (result.body && typeof result.body === 'object'
    ? result.body
    : {}) as { code?: number; data?: unknown }
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

async function runRefreshNow() {
  if (!isOzonSearchByImagePage()) {
    removeMpStatRoot()
    return
  }

  const skuRefs = collectAllListSkuRefs()
  const target = findInjectTarget()
  if (!target) return

  if (!skuRefs.length) {
    removeMpStatRoot()
    return
  }

  const skus = skuRefs.map((r) => r.sku)
  const imgMap = buildImgMap()
  const gen = ++ajaxGen

  try {
    const res = await fetchMpTableData(skus)
    if (gen !== ajaxGen) return

    if (res.code !== 200) {
      removeMpStatRoot()
      return
    }
    injectHtml(target, buildMpStatTableHtml(res, imgMap))
  } catch {
    if (gen !== ajaxGen) return
    // 本地统计服务不可用时不阻塞 Ozon 列表页，也不展示会员门禁。
    removeMpStatRoot()
  }
}

/** 防抖刷新 MP 表格（列表贴卡批次完成后调用） */
export function scheduleRefreshMpStatTable() {
  if (!isOzonSearchByImagePage()) {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    removeMpStatRoot()
    return
  }
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void runRefreshNow()
  }, DEBOUNCE_MS)
}

export function clearMpStatTable() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  ajaxGen += 1
  removeMpStatRoot()
}

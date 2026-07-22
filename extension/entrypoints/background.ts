import type { ScrapedProduct } from '@/lib/utils/types'
import type {
  OzonboxCollectedProduct,
  OzonboxRuntimeMessage,
  OzonboxSellerApiResponse,
} from '@/lib/ozonbox/contract'
import { isRecord } from '@/lib/ozonbox/contract'
import {
  collectedProductAnalyticsSku,
  mergeExactSkuAnalyticsBrand,
} from '@/lib/ozonbox/seller-analytics'
import { isOzonProductUrl, isOzonUrl } from '@/lib/ozonbox/url'
import { getAuthSession, getSettings } from '@/lib/utils/storage'
import {
  syncProducts,
  fetchBackendProducts,
  deleteBackendProduct,
  checkBackendHealth,
  queryOzonboxPackageFacts,
} from '@/lib/utils/api'

const OZON_CONTENT_SCRIPT = '/content-scripts/ozon.js'
const SELLER_URL_PATTERN = 'https://seller.ozon.ru/*'

function isSellerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'seller.ozon.ru'
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function collectedOzonProduct(response: unknown): OzonboxCollectedProduct {
  if (isRecord(response) && typeof response.error === 'string' && response.error.trim()) {
    throw new Error(response.error.trim())
  }
  return response as OzonboxCollectedProduct
}

function requirePositiveIntegerString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`${field} 必须是真实的正整数`)
  }
  return value.trim()
}

/** 更新 badge 显示后端未匹配数量 */
async function updateBadge() {
  try {
    const resp = await fetchBackendProducts(undefined, 1)
    // badge 只在有数据时显示总数
    const total = resp.total || 0
    const text = total > 0 ? String(total > 99 ? '99+' : total) : ''
    await browser.action.setBadgeText({ text })
    await browser.action.setBadgeBackgroundColor({ color: '#ff6600' })
  } catch {
    // 后端不可用时清除 badge
    await browser.action.setBadgeText({ text: '' })
  }
}

async function isAuthenticated(): Promise<boolean> {
  const session = await getAuthSession()
  return Boolean(session?.access_token)
}

function authRequired() {
  return { success: false, error: '请先登录插件' }
}

export default defineBackground(() => {

  // 初始化 badge
  updateBadge()

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if ((message as Partial<OzonboxRuntimeMessage>).type === 'COLLECT_PRODUCT') {
      collectOzonProductInTab((message as { tabId?: number }).tabId ?? sender.tab?.id).then((product) => {
        sendResponse({ success: true, data: product })
      }).catch((error: unknown) => {
        sendResponse({ success: false, error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_READ_SELLER_ID') {
      readOzonSellerId().then((sellerId) => {
        sendResponse({ sellerId })
      }).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_FETCH_SELLER_ANALYTICS') {
      const request = message as OzonboxRuntimeMessage & { type: 'OZONBOX_FETCH_SELLER_ANALYTICS' }
      fetchSellerAnalytics(request.sku, request.shopId).then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    if ((message as Partial<OzonboxRuntimeMessage>).type === 'OZONBOX_FETCH_PACKAGE_FACTS') {
      const request = message as OzonboxRuntimeMessage & { type: 'OZONBOX_FETCH_PACKAGE_FACTS' }
      queryOzonboxPackageFacts(request.sku).then(sendResponse).catch((error: unknown) => {
        sendResponse({ error: errorMessage(error) })
      })
      return true
    }

    // Content script 上报采集数据 → 直接保存到后端
    if (message.action === 'productScraped') {
      handleProductScraped(message.data).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Content script 增量批量上报 → 保存到后端
    if (message.action === 'batchSyncProducts') {
      handleBatchSync(message.products).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Popup 请求触发单个商品采集
    if (message.action === 'triggerScrape') {
      triggerScrapeInTab(message.tabId).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Popup 请求触发列表页滚动采集
    if (message.action === 'triggerListScrape') {
      triggerListScrapeInTab(message.tabId, message.maxItems, message.scrollDelay, message.batchSize).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 停止采集 → 转发到 content script
    if (message.action === 'stopScraping') {
      stopScrapingInTab().then((result) => {
        sendResponse(result)
      })
      return true
    }

    // Content script 报告列表采集进度 → 转发给 popup
    if (message.action === 'scrapingProgress') {
      return false // 不拦截,让 popup 的 listener 接收
    }

    // Content script 报告列表采集进度 (旧兼容)
    if (message.action === 'listProgress') {
      return false
    }

    // 从后端获取产品列表
    if (message.action === 'getProducts') {
      getProductsForPopup(message.platform, message.limit).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 从后端删除产品
    if (message.action === 'deleteProduct') {
      deleteProductForPopup(message.id).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 检查页面是否可采集
    if (message.action === 'checkCurrentPage') {
      checkCurrentPage().then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 进度转发
    if (message.action === 'enrichProgress') {
      return false
    }
  })

  // Tab 更新时，如果启用了自动采集，通知 content script
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return

    const settings = await getSettings()
    if (!settings.autoScrape) return
    if (!(await isAuthenticated())) return

    const url = tab.url
    // Ozon remains an explicit popup-driven flow and is intentionally excluded
    // from automatic collection.
    const isWB = /wildberries\.ru/.test(url) && /\/\d+\/?$/.test(url)
    const is1688 = /detail\.1688\.com\/offer\//.test(url) || /s\.1688\.com\/selloffer/.test(url) || /s\.1688\.com\/offer_search/.test(url)
    const isPdd = /(yangkeduo|pinduoduo)\.com/.test(url) && (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url))

    if (isWB || is1688 || isPdd) {
      try {
        const file = isPdd ? '/content-scripts/pdd.js' : is1688 ? '/content-scripts/ali1688.js' : '/content-scripts/wb.js'
        await browser.scripting.executeScript({
          target: { tabId },
          files: [file],
        })
      } catch (e) {
      }
    }
  })
})

async function handleProductScraped(product: ScrapedProduct) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts([product])
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/** 根据 URL 判断平台并返回对应的 content script 文件 */
function getContentScriptFile(url: string): string | null {
  if (/1688\.com/.test(url)) return '/content-scripts/ali1688.js'
  if (/yangkeduo\.com|pinduoduo\.com/.test(url)) return '/content-scripts/pdd.js'
  if (/wildberries\.ru/.test(url)) return '/content-scripts/wb.js'
  return null
}

/** 确保 content script 已注入:先尝试发消息,失败则注入并等待初始化 */
async function ensureContentScript(tabId: number, url?: string): Promise<boolean> {
  try {
    // 先试探 content script 是否已加载
    await browser.tabs.sendMessage(tabId, { action: 'checkPage' })
    return true
  } catch {
    // content script 未加载,尝试注入
    const scriptFile = url ? getContentScriptFile(url) : null
    if (!scriptFile) return false
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [scriptFile as any] })
      // 等待 content script 初始化
      await new Promise((resolve) => setTimeout(resolve, 300))
      return true
    } catch (e) {
      return false
    }
  }
}

async function triggerScrapeInTab(tabId: number) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || activeTab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

    const tab = tabId ? await browser.tabs.get(targetId) : activeTab
    if (tab?.url && isOzonProductUrl(tab.url)) {
      const product = await collectOzonProductInTab(targetId)
      return { success: true, data: product }
    }

    const injected = await ensureContentScript(targetId, tab?.url)
    if (!injected) return { success: false, error: '无法注入采集脚本,请刷新页面后重试' }

    const resp = await browser.tabs.sendMessage(targetId, { action: 'scrape' })

    // ★ 关键修复:采集到数据后立即保存到后端
    if (resp?.success && resp.data) {
      const saved = await handleProductScraped(resp.data)
      return { ...resp, ...saved }
    }

    return resp || { success: false, error: '采集失败' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function collectOzonProductInTab(tabId?: number): Promise<OzonboxCollectedProduct> {
  if (!(await isAuthenticated())) throw new Error(authRequired().error)
  if (!tabId) throw new Error('没有可采集的 Ozon 标签页')

  const tab = await browser.tabs.get(tabId)
  if (!tab.url || !isOzonProductUrl(tab.url)) {
    throw new Error('当前页面不是严格匹配的 Ozon 商品详情页')
  }

  const request: OzonboxRuntimeMessage = { type: 'COLLECT_PRODUCT' }
  let response: unknown
  try {
    response = await browser.tabs.sendMessage(tabId, request)
  } catch (firstError: unknown) {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [OZON_CONTENT_SCRIPT] })
      await new Promise((resolve) => setTimeout(resolve, 300))
      response = await browser.tabs.sendMessage(tabId, request)
    } catch (secondError: unknown) {
      throw new Error(`无法启动 Ozon 采集脚本：${errorMessage(secondError)}；首次尝试：${errorMessage(firstError)}`)
    }
  }
  const product = collectedOzonProduct(response)
  if (typeof product.brand === 'string' && product.brand.trim()) return product

  const sku = collectedProductAnalyticsSku(product)
  if (!sku) return product
  try {
    const sellerId = await readOzonSellerId()
    const analytics = await fetchSellerAnalytics(sku, sellerId)
    if (!analytics.ok) {
      console.warn(`Ozon seller analytics 品牌补充失败（HTTP ${analytics.status}），保留 PDP 采集结果`)
      return product
    }
    return mergeExactSkuAnalyticsBrand(product, analytics.data, sku)
  } catch (error: unknown) {
    console.warn('Ozon seller analytics 品牌补充不可用，保留 PDP 采集结果', error)
    return product
  }
}

async function findSellerTab(explicitTabId?: number): Promise<chrome.tabs.Tab> {
  if (explicitTabId) {
    const tab = await browser.tabs.get(explicitTabId)
    if (!tab.url || !isSellerUrl(tab.url)) throw new Error('指定标签页不是 Ozon 卖家后台')
    return tab
  }
  const tabs = await browser.tabs.query({ url: SELLER_URL_PATTERN })
  const sellerTabs = tabs.filter((candidate) => candidate.id && candidate.url && isSellerUrl(candidate.url))
  const tab = sellerTabs.find((candidate) => candidate.active) ?? sellerTabs[0]
  if (!tab) throw new Error('未找到已打开的 Ozon 卖家后台标签页')
  return tab
}

async function readOzonSellerId(explicitTabId?: number): Promise<string> {
  const tab = await findSellerTab(explicitTabId)
  if (!tab.id) throw new Error('Ozon 卖家标签页缺少 ID')
  const result = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const names = ['contentId', 'sc_company_id', 'company_id', 'companyId', 'seller_id', 'sellerId']
      const values: string[] = []
      for (const name of names) {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
        if (meta?.getAttribute('content')) values.push(meta.getAttribute('content') as string)
        const element = document.querySelector(`[data-${name.replace(/_/g, '-')}]`)
        if (element?.getAttribute(`data-${name.replace(/_/g, '-')}`)) values.push(element.getAttribute(`data-${name.replace(/_/g, '-')}`) as string)
        const localValue = localStorage.getItem(name)
        if (localValue) values.push(localValue)
        const cookie = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
        if (cookie) values.push(cookie.slice(name.length + 1))
      }
      return values.find((value) => /^[1-9]\d*$/.test(value.trim()))?.trim()
    },
  })
  const sellerId = result[0]?.result
  return requirePositiveIntegerString(sellerId, 'sellerId')
}

async function fetchSellerApi(
  sku: string,
  shopId: string,
  pageType: 'what-to-sell' | 'products',
  endpoint: string,
  body: Record<string, unknown>,
  explicitTabId?: number,
): Promise<OzonboxSellerApiResponse> {
  const tab = await findSellerTab(explicitTabId)
  if (!tab.id) throw new Error('Ozon 卖家标签页缺少 ID')
  requirePositiveIntegerString(String(sku), 'sku')
  const companyId = requirePositiveIntegerString(String(shopId), 'shopId')
  const headers = {
    'content-type': 'application/json',
    'x-o3-app-name': 'seller-ui',
    'x-o3-company-id': companyId,
    'x-o3-language': 'zh-Hans',
    'x-o3-page-type': pageType,
  }

  // The seller API must run in the seller tab's page context.  A service
  // worker fetch does not reliably carry the seller page's authenticated
  // cookie/session context and is answered with 403 by Ozon.
  const result = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ endpoint, headers, body }],
    func: async (request: {
      endpoint: string
      headers: Record<string, string>
      body: Record<string, unknown>
    }) => {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        credentials: 'include',
      })
      const data = await response.json().catch(() => null)
      return { data, status: response.status, ok: response.ok }
    },
  })

  const payload = result[0]?.result
  if (!payload || typeof payload !== 'object') {
    throw new Error('Ozon 卖家接口未返回有效响应')
  }
  return payload as OzonboxSellerApiResponse
}

function fetchSellerAnalytics(sku: string, shopId: string, tabId?: number) {
  return fetchSellerApi(
    sku,
    shopId,
    'what-to-sell',
    'https://seller.ozon.ru/api/site/seller-analytics/what_to_sell/data/v3',
    { limit: '50', offset: '0', filter: { stock: 'any_stock', sku: String(sku) }, sort: { key: 'sum_gmv_desc' } },
    tabId,
  )
}

async function handleBatchSync(products: ScrapedProduct[]) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts(products)
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function stopScrapingInTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) return { success: false, error: '无活动标签页' }
    await browser.tabs.sendMessage(tab.id, { action: 'stopScraping' })
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function triggerListScrapeInTab(tabId?: number, maxItems = 50, scrollDelay = 1500, batchSize = 10) {
  try {
    if (!(await isAuthenticated())) return authRequired()
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || tab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

    // ★ 关键修复:确保 content script 已注入
    const injected = await ensureContentScript(targetId, tab.url)
    if (!injected) return { success: false, error: '无法注入采集脚本,请刷新页面后重试' }

    // content script 内部会增量批量上报,background 不再做最终批量保存
    const resp = await browser.tabs.sendMessage(targetId, {
      action: 'scrapeList',
      maxItems,
      scrollDelay,
      batchSize,
    })

    return resp || { success: false, error: '采集失败' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function getProductsForPopup(platform?: string, limit?: number) {
  if (!(await isAuthenticated())) return authRequired()
  try {
    return await fetchBackendProducts(platform, limit)
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function deleteProductForPopup(recordId: number) {
  if (!(await isAuthenticated())) return authRequired()
  try {
    await deleteBackendProduct(recordId)
    await updateBadge()
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}



async function checkCurrentPage() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return { isSupported: false }

    const url = tab.url
    const isOzon = isOzonUrl(url)
    const isWB = /wildberries\.ru/.test(url)
    const is1688 = /1688\.com/.test(url)
    const isPdd = /(yangkeduo|pinduoduo)\.com/.test(url)

    if (!isOzon && !isWB && !is1688 && !isPdd) return { isSupported: false }

    if (isOzon) {
      const isProductPage = isOzonProductUrl(url)
      return {
        isSupported: isProductPage,
        platform: 'ozon',
        isProductPage,
        isListPage: false,
        pageType: isProductPage ? 'product' : 'unknown',
        tabId: tab.id,
        url,
      }
    }

    const platform = isWB ? 'wb' : is1688 ? '1688' : 'pdd'

    // ★ 关键修复:确保 content script 已注入再检测,避免偶尔返回空
    await ensureContentScript(tab.id!, url)

    // 先发消息让 content script 检测页面类型
    try {
      const pageCheck = await browser.tabs.sendMessage(tab.id!, { action: 'checkPage' })
      return {
        isSupported: true,
        platform: pageCheck.platform || platform,
        isProductPage: pageCheck.isProductPage ?? (is1688 ? /detail\.1688\.com\/offer\//.test(url) : isPdd ? (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url)) : /\/product\//i.test(url) || /\/\d+\/?$/.test(url) || /\-\d+\/?$/.test(new URL(url).pathname)),
        isListPage: pageCheck.isListPage ?? false,
        pageType: pageCheck.pageType || 'unknown',
        tabId: tab.id,
        url,
      }
    } catch {
      // content script 未加载,用 URL 猜测
      const isProductPage = is1688 ? /detail\.1688\.com\/offer\//.test(url) : isPdd ? (/goods\.html/i.test(url) || /[?&](goods_id|goodsId)=\d+/.test(url)) : /\/product\//i.test(url) || /\/\d+\/?$/.test(url) || /\-\d+\/?$/.test(new URL(url).pathname)
      const isListPage = is1688
        ? /s\.1688\.com\/(selloffer|offer_search|company)/.test(url)
        : isPdd
          ? /(search|mall|category|list|index)/i.test(url) && !isProductPage
        : /\/(category|brand|search|seller|collection)\//i.test(url)
      return {
        isSupported: true,
        platform,
        isProductPage,
        isListPage,
        pageType: isProductPage ? 'product' : isListPage ? 'list' : 'unknown',
        tabId: tab.id,
        url,
      }
    }
  } catch {
    return { isSupported: false }
  }
}

import type { ScrapedProduct } from '@/utils/types'
import { getSettings } from '@/utils/storage'
import { syncProducts, fetchBackendProducts, deleteBackendProduct, checkBackendHealth } from '@/utils/api'

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

export default defineBackground(() => {
  console.log('[Auto-Ozon] Background service worker started')

  // 初始化 badge
  updateBadge()

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      fetchBackendProducts(message.platform, message.limit).then((resp) => {
        sendResponse(resp)
      })
      return true
    }

    // 从后端删除产品
    if (message.action === 'deleteProduct') {
      deleteBackendProduct(message.id).then(() => {
        updateBadge()
        sendResponse({ success: true })
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

    const url = tab.url
    const isOzon = /ozon\.ru/.test(url) && /\/\d+\/?$/.test(url)
    const isWB = /wildberries\.ru/.test(url) && /\/\d+\/?$/.test(url)
    const is1688 = /detail\.1688\.com\/offer\//.test(url) || /s\.1688\.com\/selloffer/.test(url) || /s\.1688\.com\/offer_search/.test(url)

    if (isOzon || isWB || is1688) {
      try {
        const file = is1688 ? 'content-scripts/ali1688.js' : isOzon ? 'content-scripts/ozon.js' : 'content-scripts/wb.js'
        await browser.scripting.executeScript({
          target: { tabId },
          files: [file],
        })
      } catch (e) {
        console.warn('[Auto-Ozon] 注入 content script 失败:', e)
      }
    }
  })
})

async function handleProductScraped(product: ScrapedProduct) {
  try {
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts([product])
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (e) {
    console.error('[Auto-Ozon] 直接保存到后端失败:', e)
    return { success: false, error: String(e) }
  }
}

async function triggerScrapeInTab(tabId: number) {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || tab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

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

async function handleBatchSync(products: ScrapedProduct[]) {
  try {
    const healthy = await checkBackendHealth()
    if (!healthy) {
      return { success: false, error: '后端不可用,请检查 backend 是否运行' }
    }
    const result = await syncProducts(products)
    await updateBadge()
    return { success: true, created: result.created, skipped: result.skipped }
  } catch (e) {
    console.error('[Auto-Ozon] 批量同步到后端失败:', e)
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
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || tab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

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



async function checkCurrentPage() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return { isSupported: false }

    const url = tab.url
    const isOzon = /ozon\.ru/.test(url)
    const isWB = /wildberries\.ru/.test(url)
    const is1688 = /1688\.com/.test(url)

    if (!isOzon && !isWB && !is1688) return { isSupported: false }

    const platform = isOzon ? 'ozon' : isWB ? 'wb' : '1688'

    // 先发消息让 content script 检测页面类型
    try {
      const pageCheck = await browser.tabs.sendMessage(tab.id!, { action: 'checkPage' })
      return {
        isSupported: true,
        platform: pageCheck.platform || platform,
        productPage: pageCheck.isProductPage ?? (is1688 ? /detail\.1688\.com\/offer\//.test(url) : /\/\d+\/?$/.test(url)),
        isListPage: pageCheck.isListPage ?? false,
        pageType: pageCheck.pageType || 'unknown',
        tabId: tab.id,
        url,
      }
    } catch {
      // content script 未加载,用 URL 猜测
      const isProductPage = is1688 ? /detail\.1688\.com\/offer\//.test(url) : /\/\d+\/?$/.test(url)
      const isListPage = is1688
        ? /s\.1688\.com\/(selloffer|offer_search|company)/.test(url)
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

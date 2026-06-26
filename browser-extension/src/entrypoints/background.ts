import type { StoredProduct, ScrapedProduct } from '@/utils/types'
import { getSettings, getProducts, addProduct, markSynced } from '@/utils/storage'
import { syncProducts, checkBackendHealth } from '@/utils/api'

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 更新 badge 显示未同步数量 */
async function updateBadge() {
  const products = await getProducts()
  const unsynced = products.filter((p) => !p.synced).length
  const text = unsynced > 0 ? String(unsynced > 99 ? '99+' : unsynced) : ''
  const color = unsynced > 0 ? '#ff6600' : '#9ba3b5'
  await browser.action.setBadgeText({ text })
  await browser.action.setBadgeBackgroundColor({ color })
}

/** 自动同步到后端 */
async function autoSync() {
  const products = await getProducts()
  const unsynced = products.filter((p) => !p.synced)
  if (unsynced.length === 0) return

  const healthy = await checkBackendHealth()
  if (!healthy) return

  try {
    const syncData: ScrapedProduct[] = unsynced.map(({ id: _id, synced: _s, ...rest }) => rest)
    const result = await syncProducts(syncData)
    if (result.created > 0) {
      const syncedIds = unsynced.slice(0, result.created).map((p) => p.id)
      await markSynced(syncedIds)
      await updateBadge()
    }
  } catch (e) {
    console.error('[Auto-Ozon] 自动同步失败:', e)
  }
}

export default defineBackground(() => {
  console.log('[Auto-Ozon] Background service worker started')

  // 初始化 badge
  updateBadge()

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content script 上报采集数据
    if (message.action === 'productScraped') {
      handleProductScraped(message.data, sender.tab?.id).then((result) => {
        sendResponse(result)
      })
      return true // 异步响应
    }

    // Popup 请求触发采集
    if (message.action === 'triggerScrape') {
      triggerScrapeInTab(message.tabId).then((result) => {
        sendResponse(result)
      })
      return true
    }

    // 获取存储的产品列表
    if (message.action === 'getProducts') {
      getProducts().then((products) => {
        sendResponse({ products })
      })
      return true
    }

    // 删除产品
    if (message.action === 'deleteProduct') {
      import('@/utils/storage').then(({ removeProduct }) => {
        removeProduct(message.id).then(() => {
          updateBadge()
          sendResponse({ success: true })
        })
      })
      return true
    }

    // 同步到后端
    if (message.action === 'syncToBackend') {
      syncToBackend().then((result) => {
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
  })

  // Tab 更新时，如果启用了自动采集，通知 content script
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return

    const settings = await getSettings()
    if (!settings.autoScrape) return

    const url = tab.url
    const isOzon = /ozon\.ru/.test(url) && /\/\d+\/?$/.test(url)
    const isWB = /wildberries\.ru/.test(url) && /\/\d+\/?$/.test(url)

    if (isOzon || isWB) {
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          files: [isOzon ? 'content-scripts/ozon.js' : 'content-scripts/wb.js'],
        })
      } catch (e) {
        console.warn('[Auto-Ozon] 注入 content script 失败:', e)
      }
    }
  })
})

async function handleProductScraped(product: ScrapedProduct, tabId?: number) {
  const stored: StoredProduct = {
    ...product,
    id: generateId(),
    synced: false,
  }

  const added = await addProduct(stored)
  if (added) {
    await updateBadge()
    // 后台自动同步
    autoSync()
  }
  return { success: true, added, id: stored.id }
}

async function triggerScrapeInTab(tabId: number) {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    const targetId = tabId || tab?.id
    if (!targetId) return { success: false, error: '无活动标签页' }

    const results = await browser.tabs.sendMessage(targetId, { action: 'scrape' })
    return results
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function syncToBackend() {
  const products = await getProducts()
  const unsynced = products.filter((p) => !p.synced)
  if (unsynced.length === 0) return { success: true, created: 0, skipped: 0 }

  try {
    const syncData: ScrapedProduct[] = unsynced.map(({ id: _id, synced: _s, ...rest }) => rest)
    const result = await syncProducts(syncData)
    if (result.created > 0) {
      const syncedIds = unsynced.slice(0, result.created).map((p) => p.id)
      await markSynced(syncedIds)
      await updateBadge()
    }
    return { success: true, ...result }
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

    if (!isOzon && !isWB) return { isSupported: false }

    const isProductPage = /\/\d+\/?$/.test(url)
    return {
      isSupported: true,
      platform: isOzon ? 'ozon' : 'wb',
      isProductPage,
      tabId: tab.id,
      url,
    }
  } catch {
    return { isSupported: false }
  }
}

import type { ScrapedProduct } from '@/utils/types'
import {
  is1688DetailPage,
  is1688ListPage,
  scrape1688Product,
  scan1688ListCards,
  type ListCard1688,
} from './content/ali1688'

export default defineContentScript({
  matches: [
    '*://detail.1688.com/*',
    '*://s.1688.com/*',
    '*://www.1688.com/*',
  ],
  main() {
    const isDetail = is1688DetailPage()
    const isList = is1688ListPage()

    if (!isDetail && !isList) return

    console.log(
      `[Auto-Ozon] 1688 content script loaded (${isDetail ? 'detail' : 'list'} page)`,
    )

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // ── 检测页面类型 ──
      if (message.action === 'checkPage') {
        sendResponse({
          isProductPage: isDetail,
          isListPage: isList,
          platform: '1688',
          pageType: isDetail ? 'product' : isList ? 'list' : 'unknown',
        })
        return true
      }

      // ── 单商品采集 (详情页) ──
      if (message.action === 'scrape') {
        if (!isDetail) {
          sendResponse({ success: false, error: '当前不是1688商品详情页' })
          return true
        }
        try {
          const product = scrape1688Product()
          sendResponse({ success: !!product, data: product })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        return true // async response
      }

      // ── 列表页滚动采集 ──
      if (message.action === 'scrapeList') {
        if (!isList) {
          sendResponse({ success: false, error: '当前不是1688列表页' })
          return true
        }
        const maxItems = message.maxItems || 50
        const scrollDelay = message.scrollDelay || 1500
        const batchSize = message.batchSize || 10
        runListScraping(maxItems, scrollDelay, batchSize)
        sendResponse({ success: true })
        return true
      }

      // ── 停止采集 ──
      if (message.action === 'stopScraping') {
        stopListScraping = true
        sendResponse({ success: true })
        return true
      }

      return false
    })
  },
})

// ── 列表采集状态 ──
let stopListScraping = false

async function runListScraping(maxItems: number, scrollDelay: number, batchSize: number) {
  stopListScraping = false
  const seen = new Set<string>()
  const allItems: ListCard1688[] = []
  let lastHeight = 0
  let staleCount = 0
  const maxStale = 5 // 连续5次滚动无新内容则停止

  console.log(`[Auto-Ozon] 1688 列表采集开始 (maxItems=${maxItems})`)

  while (allItems.length < maxItems && !stopListScraping && staleCount < maxStale) {
    // 采集当前可见商品
    const items = scan1688ListCards()
    let newCount = 0
    for (const item of items) {
      if (!item.sourceId || seen.has(item.sourceId)) continue
      seen.add(item.sourceId)
      allItems.push(item)
      newCount++
      if (allItems.length >= maxItems) break
    }

    // 通知 popup 进度
    try {
      browser.runtime.sendMessage({
        action: 'scrapingProgress',
        platform: '1688',
        current: allItems.length,
        total: maxItems,
        newCount,
      })
    } catch { /* popup 未打开 */ }

    if (allItems.length >= maxItems) break

    // 滚动加载更多
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, scrollDelay))

    const newHeight = document.documentElement.scrollHeight
    if (newHeight === lastHeight) {
      staleCount++
    } else {
      staleCount = 0
      lastHeight = newHeight
    }
  }

  // 批量同步到后端
  if (allItems.length > 0) {
    const products: ScrapedProduct[] = allItems.map((item) => ({
      platform: '1688' as const,
      sourceId: item.sourceId,
      title: item.title,
      price: item.price,
      oldPrice: item.oldPrice,
      images: item.imageUrl ? [item.imageUrl] : [],
      rating: 0,
      reviewCount: 0,
      brand: '',
      category: '',
      sellerName: '',
      sellerUrl: '',
      attributes: [],
      description: '',
      sourceUrl: item.sourceUrl,
      scrapedAt: new Date().toISOString(),
      videoUrls: [],
      skuList: [],
      specList: [],
      ozonCategoryId: 0,
      ozonTypeId: 0,
      priceRanges: [],
      minOrderQty: 0,
      supplierUrl: '',
      tradeQuantity: 0,
    }))

    try {
      const result = await browser.runtime.sendMessage({
        action: 'batchSyncProducts',
        products,
      })
      console.log(`[Auto-Ozon] 1688 列表采集完成: ${allItems.length} 件, 同步: ${result?.created || 0} 件`)
    } catch (e) {
      console.error('[Auto-Ozon] 1688 列表采集同步失败:', e)
    }
  }

  // 通知采集完成
  try {
    browser.runtime.sendMessage({
      action: 'scrapingProgress',
      platform: '1688',
      current: allItems.length,
      total: allItems.length,
      newCount: 0,
      done: true,
    })
  } catch { /* popup 未打开 */ }
}

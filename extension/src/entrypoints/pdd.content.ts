import type { ScrapedProduct } from '@/utils/types'
import { injectFloatingButton } from '@/utils/floating-button'
import { isPddDetailPage, isPddListPage, scrapePddProduct, scanPddListCards, type ListCardPdd } from './content/pdd'

export default defineContentScript({
  matches: [
    '*://yangkeduo.com/*',
    '*://*.yangkeduo.com/*',
    '*://pinduoduo.com/*',
    '*://*.pinduoduo.com/*',
  ],
  main() {
    const isDetail = isPddDetailPage()
    const isList = isPddListPage()
    if (!isDetail && !isList) return

    console.log(`[鲸智 AI] PDD content script loaded (${isDetail ? 'detail' : 'list'} page)`)

    if (isDetail) {
      injectFloatingButton(async () => {
        const product = await scrapePddProduct()
        if (!product) throw new Error('采集失败: 无法提取拼多多商品信息')
        const result = await browser.runtime.sendMessage({ action: 'productScraped', data: product })
        if (!result?.success) throw new Error(result?.error || '上报失败')
      })
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'checkPage') {
        sendResponse({
          isProductPage: isPddDetailPage(),
          isListPage: isPddListPage(),
          platform: 'pdd',
          pageType: isPddDetailPage() ? 'product' : isPddListPage() ? 'list' : 'unknown',
        })
        return true
      }

      if (message.action === 'scrape') {
        if (!isPddDetailPage()) {
          sendResponse({ success: false, error: '当前不是拼多多商品详情页' })
          return true
        }
        ;(async () => {
          try {
            const product = await scrapePddProduct()
          sendResponse({ success: !!product, data: product, error: product ? '' : '未找到商品ID或商品数据' })
          } catch (err) {
            sendResponse({ success: false, error: String(err) })
          }
        })()
        return true
      }

      if (message.action === 'scrapeList') {
        if (!isPddListPage()) {
          sendResponse({ success: false, error: '当前不是拼多多列表页' })
          return true
        }
        ;(async () => {
          try {
            const result = await runListScraping(message.maxItems || 50, message.scrollDelay || 1500, message.batchSize || 10)
            sendResponse(result)
          } catch (err) {
            sendResponse({ success: false, error: String(err) })
          }
        })()
        return true
      }

      if (message.action === 'stopScraping') {
        stopListScraping = true
        sendResponse({ success: true })
        return true
      }

      return false
    })
  },
})

let stopListScraping = false

async function runListScraping(maxItems: number, scrollDelay: number, batchSize: number) {
  stopListScraping = false
  const seen = new Set<string>()
  const items: ListCardPdd[] = []
  let totalCreated = 0
  let totalSkipped = 0
  let staleCount = 0
  let scrollCount = 0
  const maxScrolls = Math.max(12, Math.ceil(maxItems / 4))

  const syncBatch = async (batch: ListCardPdd[]) => {
    if (!batch.length) return
    try {
      const resp = await browser.runtime.sendMessage({ action: 'batchSyncProducts', products: batch.map(cardToProduct) })
      totalCreated += resp?.created || 0
      totalSkipped += resp?.skipped || 0
    } catch (e) {
      console.warn('[鲸智 AI] PDD 批量同步失败:', e)
    }
  }

  while (!stopListScraping && items.length < maxItems && staleCount < 5 && scrollCount < maxScrolls) {
    const before = seen.size
    for (const card of scanPddListCards()) {
      if (seen.has(card.sourceId) || items.length >= maxItems) continue
      seen.add(card.sourceId)
      items.push(card)

      if (items.length % batchSize === 0) {
        await syncBatch(items.slice(Math.max(0, items.length - batchSize), items.length))
      }
    }

    browser.runtime.sendMessage({ action: 'scrapingProgress', platform: 'pdd', current: items.length, total: maxItems, created: totalCreated, skipped: totalSkipped }).catch(() => {})
    staleCount = seen.size === before ? staleCount + 1 : 0
    scrollCount += 1
    const step = Math.max(window.innerHeight * 0.75, 520)
    window.scrollBy({ top: step, behavior: 'smooth' })
    await new Promise((resolve) => setTimeout(resolve, scrollDelay))
  }

  const syncedCount = totalCreated + totalSkipped
  if (items.length > syncedCount) {
    await syncBatch(items.slice(syncedCount))
  }

  browser.runtime.sendMessage({ action: 'scrapingProgress', platform: 'pdd', current: items.length, total: items.length, created: totalCreated, skipped: totalSkipped, done: true }).catch(() => {})
  return { success: true, count: items.length, created: totalCreated, skipped: totalSkipped }
}

function cardToProduct(card: ListCardPdd): ScrapedProduct {
  return {
    platform: 'pdd',
    sourceId: card.sourceId,
    title: card.title,
    currency: 'CNY',
    price: card.price,
    oldPrice: card.oldPrice,
    images: card.imageUrl ? [card.imageUrl] : [],
    rating: 0,
    reviewCount: 0,
    brand: '',
    category: '',
    sellerName: '',
    sellerUrl: '',
    attributes: [],
    description: '',
    sourceUrl: card.sourceUrl,
    scrapedAt: new Date().toISOString(),
    videoUrls: [],
    skuList: [{ sku: card.sourceId, barcode: '' }],
    specList: [],
    tags: ['PDD'],
    ozonCategoryId: 0,
    ozonTypeId: 0,
    discount: '',
    stock: '',
    priceRanges: [],
    minOrderQty: 1,
    supplierUrl: '',
    tradeQuantity: 0,
  }
}
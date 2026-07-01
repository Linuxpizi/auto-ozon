import type { ScrapedProduct } from '@/utils/types'
import { injectFloatingButton } from '@/utils/floating-button'
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
      `[鲸智 AI] 1688 content script loaded (${isDetail ? 'detail' : 'list'} page)`,
    )

    // ── 列表页: 检查是否有跨页采集状态需要恢复 ──
    if (isList) {
      const raw = localStorage.getItem(STORAGE_KEY_1688)
      if (raw) {
        try {
          const saved: PersistedScrapingState = JSON.parse(raw)
          console.log(`[鲸智 AI] 1688 发现已保存的采集状态: 第${saved.pageCount}页, ${saved.seenIds.length}个已知ID, 已同步${saved.totalCreated}件`)
          localStorage.removeItem(STORAGE_KEY_1688) // 取出后立即清除
          // 等待页面稳定后恢复采集
          setTimeout(() => {
            runListScraping(saved.maxItems, saved.scrollDelay, saved.batchSize, {
              seenIds: saved.seenIds,
              pageCount: saved.pageCount,
              totalCreated: saved.totalCreated,
              totalSkipped: saved.totalSkipped,
            })
          }, 2000)
        } catch (e) {
          console.error('[鲸智 AI] 1688 恢复采集状态失败:', e)
          localStorage.removeItem(STORAGE_KEY_1688)
        }
      }
    }

    // ── 注入悬浮采集按钮 (商品详情页) ──
    if (isDetail) {
      injectFloatingButton(async () => {
        const product = scrape1688Product()
        if (!product) throw new Error('采集失败: 无法提取商品信息')
        const result = await browser.runtime.sendMessage({ action: 'productScraped', data: product })
        if (!result?.success) throw new Error(result?.error || '上报失败')
      })
    }

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

// ── 跨页状态持久化 (localStorage) ──
const STORAGE_KEY_1688 = 'jingzhi-ai-1688-scraping-state'

interface PersistedScrapingState {
  maxItems: number
  scrollDelay: number
  batchSize: number
  seenIds: string[]
  allItemsData: Array<{ sourceId: string; title: string; price: string; sourceUrl: string }>
  pageCount: number
  totalCreated: number
  totalSkipped: number
}

/**
 * 通过URL参数 beginPage 翻页。
 * 1688搜索页固定使用 beginPage 参数控制页码（如 beginPage=2）。
 * 不依赖任何DOM选择器。
 * 返回 true 表示导航成功（页面会重载）。
 */
function navigateToNextPage1688(): boolean {
  // 使用纯字符串替换避免 new URL() 的中文编码问题
  const href = window.location.href
  const match = href.match(/[?&]beginPage=(\d+)/)
  const currentPage = match ? parseInt(match[1], 10) : 1
  const nextPage = currentPage + 1
  let newUrl: string
  if (match) {
    newUrl = href.replace(/beginPage=\d+/, `beginPage=${nextPage}`)
  } else {
    newUrl = href + (href.includes('?') ? '&' : '?') + `beginPage=${nextPage}`
  }
  console.log(`[鲸智 AI] 1688 翻页: 第${currentPage}页 → 第${nextPage}页`)
  window.location.href = newUrl
  return true
}

async function runListScraping(
  maxItems: number,
  scrollDelay: number,
  batchSize: number,
  restored?: {
    seenIds: string[]
    pageCount: number
    totalCreated: number
    totalSkipped: number
  },
) {
  stopListScraping = false
  const seen = new Set<string>(restored?.seenIds || [])
  const allItems: ListCard1688[] = []
  let lastHeight = 0
  let staleCount = 0
  const maxStale = 3 // 连续3次滚动无新内容则翻页
  let totalCreated = restored?.totalCreated || 0
  let totalSkipped = restored?.totalSkipped || 0
  let pageCount = restored?.pageCount || 1
  let scrollCount = 0
  const maxScrolls = 30 // 单页硬性滚动上限
  let noNewDataCount = 0
  const maxNoNewData = 3 // 连续3次扫描无新数据则停止

  console.log(`[鲸智 AI] 1688 列表采集开始 (maxItems=${maxItems}, 恢复自第${pageCount}页, 已有${seen.size}个已知ID)`)

  while (seen.size < maxItems && !stopListScraping && scrollCount < maxScrolls) {
    // 采集当前可见商品
    const items = scan1688ListCards()
    let newCount = 0
    for (const item of items) {
      if (!item.sourceId || seen.has(item.sourceId)) continue
      seen.add(item.sourceId)
      allItems.push(item)
      newCount++
      if (seen.size >= maxItems) break
    }

    // 空扫计数器: 连续无新数据则停止
    if (newCount === 0) {
      noNewDataCount++
      console.log(`[鲸智 AI] 1688 无新数据 (${noNewDataCount}/${maxNoNewData})`)
    } else {
      noNewDataCount = 0
    }

    // 通知 popup 进度
    try {
      browser.runtime.sendMessage({
        action: 'scrapingProgress',
        platform: '1688',
        current: seen.size,
        total: maxItems,
        newCount,
      })
    } catch { /* popup 未打开 */ }

    if (seen.size >= maxItems || noNewDataCount >= maxNoNewData) break


    scrollCount++

    // 滚动加载更多
    const scrollStep = Math.max(window.innerHeight * 0.6, 400)
    window.scrollBy({ top: scrollStep, behavior: 'smooth' })
    await new Promise((r) => setTimeout(r, scrollDelay))

    // 如果已接近底部,尝试滚动到更下方以触发加载
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200) {
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise((r) => setTimeout(r, scrollDelay * 1.5))
    }

    const newHeight = document.documentElement.scrollHeight
    if (newHeight === lastHeight) {
      staleCount++
      console.log(`[鲸智 AI] 1688 无新内容 (${staleCount}/${maxStale})`)
    } else {
      staleCount = 0
      lastHeight = newHeight
    }

    // 当前页滚动到底且无新内容 → 保存状态并翻页
    if (staleCount >= maxStale && seen.size > 0 && seen.size < maxItems) {
      // 翻页前先把当前页采集的数据同步到后端
      if (allItems.length > 0) {
        const products: ScrapedProduct[] = allItems.map((item) => ({
          platform: '1688' as const,
          currency: 'CNY',
          sourceId: item.sourceId,
          title: item.title,
          price: item.price,
          oldPrice: item.oldPrice,
          images: item.imageUrl ? [item.imageUrl] : [],
          rating: 0,
          reviewCount: 0,
          salesCount: 0,
          shippingInfo: '',
          location: '',
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
          const result = await browser.runtime.sendMessage({ action: 'batchSyncProducts', products })
          totalCreated += result?.created || 0
          totalSkipped += result?.skipped || 0
        } catch { /* ignore */ }
      }

      // 保存跨页状态到 localStorage
      const state: PersistedScrapingState = {
        maxItems,
        scrollDelay,
        batchSize,
        seenIds: Array.from(seen),
        allItemsData: allItems.map(i => ({ sourceId: i.sourceId, title: i.title, price: i.price, sourceUrl: i.sourceUrl })),
        pageCount: pageCount + 1,
        totalCreated,
        totalSkipped,
      }
      localStorage.setItem(STORAGE_KEY_1688, JSON.stringify(state))
      console.log(`[鲸智 AI] 1688 保存状态到localStorage (${seen.size}个ID, 第${pageCount}页 → 第${pageCount + 1}页)`)

      // URL跳转翻页 (页面会重载，当前函数终止)
      navigateToNextPage1688()
      return // 页面跳转后content script会重新加载
    }
  }

  // 批量同步到后端
  if (allItems.length > 0) {
    const products: ScrapedProduct[] = allItems.map((item) => ({
      platform: '1688' as const,
      currency: 'CNY',
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
      totalCreated += result?.created || 0
      totalSkipped += result?.skipped || 0
      console.log(`[鲸智 AI] 1688 批量同步: ${seen.size} 件(本次${allItems.length}), 同步: ${result?.created || 0} 件`)
    } catch (e) {
      console.error('[鲸智 AI] 1688 列表采集同步失败:', e)
    }
  }

  // 通知采集完成
  try {
    browser.runtime.sendMessage({
      action: 'scrapingProgress',
      platform: '1688',
      current: seen.size,
      total: maxItems,
      created: totalCreated,
      skipped: totalSkipped,
      newCount: 0,
      done: true,
    })
  } catch { /* popup 未打开 */ }
}

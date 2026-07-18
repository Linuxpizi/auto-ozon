import { isOzonListLikePage, resolveOzonPageType } from './ozonPageContext'
import { collectPendingListItems, collectPendingShelfItems } from './listPageScanner'
import { loadSkuData, OzonSkuLoadError } from './loadSkuData'
import {
  bindCardCopyActions,
  fillCardWithData,
  markCardFillFailed,
  renderPlaceholderCard,
} from './skuCardRenderer'
import type { OzonListProductItem } from './types'
import { showToast } from '../../../utils/toast'
import { shouldBlockListLoad } from '../ozonBatchCrawl/crawlController'
import { handleSkuLoadRestriction } from './freeMemberCard'
import { applyCardFieldLayout } from '../ozonCardSettings/cardFieldStore'
import { loadCardExtraData } from './loadCardExtraData'
import { loadCardFollowData } from './loadCardFollowData'
import {
  applySelectionTagForCard,
  setCardGoodsData,
  setCardListPriceText,
} from '../ozonSelectionRules'
import { syncListPageRealPriceFromHost } from '../ozonProfitCalc/wiring'
import { cacheSkuData } from './skuDataCache'
import { recordListSku, updateListSkuSales } from './listSkuAccumulator'
import { readTitleFromHost } from '../ozonQuickShelve/collectListSkus'
import {
  configureListingAutoLoad,
  flushListingAutoLoadPending,
  markListingAutoLoadPending,
  startListingAutoLoad,
  stopListingAutoLoad,
} from './listingAutoLoad'
import { ensureListTileLayoutForCard } from './listCardLayout'

const BATCH_SIZE = 3
let isLoading = false

configureListingAutoLoad({
  isIdle: () => !isLoading,
  runLoad: () => {
    void probeAndLoadOzonListData()
  },
})

async function processItem(item: OzonListProductItem): Promise<void> {
  const placeholder = document.createElement('div')
  // 列表/搜索页与详情页下方相似商品网格都走这里：始终按列表卡渲染
  // （否则详情页 isOzonProductPath()=true 会让 shelf 卡片被当成详情卡，导致利润计算默认展开、窄卡禁用失效）
  placeholder.innerHTML = renderPlaceholderCard(item.sku, item.img, { isDetail: false })
  const card = placeholder.firstElementChild as HTMLElement
  if (!card) return

  // 贴卡时把商品记入常驻累加器（对齐旧版 C.skus.push），供列表页急速上架突破虚拟滚动 ~40 限制。
  // 必须在 appendChild 之前读标题，此时 host 内还没有插件卡片，避免读到卡片自身的 span。
  recordListSku({
    sku: item.sku,
    title: readTitleFromHost(item.host),
    image: item.img,
    price: item.priceText,
  })

  item.host.appendChild(card)
  ensureListTileLayoutForCard(card)
  bindCardCopyActions(card)
  setCardListPriceText(card, item.priceText)
  applyCardFieldLayout(card)
  syncListPageRealPriceFromHost(item.sku, item.host, card)

  const skuRowPromise = (async () => {
    const data = await loadSkuData(item.sku)
    cacheSkuData(item.sku, data)
    // 补记销量到累加器（对齐旧版列表销量列 xl），供急速上架弹窗销量筛选/展示
    updateListSkuSales(
      item.sku,
      data.monthsales == null || data.monthsales === '' ? '销量:--' : `销量:${data.monthsales}`,
    )
    if (!item.host.contains(card)) return
    fillCardWithData(card, data)
    ensureListTileLayoutForCard(card)
    setCardGoodsData(card, data)
    applySelectionTagForCard(card)
  })().catch((e) => {
    if (e instanceof OzonSkuLoadError && e.code === 403) {
      // 限频（含后端 60s 锁）：移除占位卡让 host 回到「待贴卡」池，退避结束后由下一次自动扫描
      // 重新补卡，实现「可逆占位」；不做永久 blur 遮罩。整批随后中断，停止继续打爆服务端。
      card.remove()
      throw e
    }
    if (handleSkuLoadRestriction(card, e)) return
    markCardFillFailed(card)
    console.warn('[mjgd][ozonList] SKU 加载失败', item.sku, e)
  })

  const followPromise = loadCardFollowData(card, item.sku).catch(() => {})
  const packagingPromise = loadCardExtraData(card, item.sku).catch(() => {})

  await Promise.all([skuRowPromise, followPromise, packagingPromise])
}

async function processBatch(
  items: OzonListProductItem[],
  start: number,
  interBatchDelayMs = 0,
): Promise<void> {
  const end = Math.min(start + BATCH_SIZE, items.length)
  const batch = items.slice(start, end)
  await Promise.all(
    batch.map((item) =>
      processItem(item).catch((e) => {
        if (e instanceof OzonSkuLoadError && e.message === '频率过快') throw e
        return null
      }),
    ),
  )
  if (end < items.length) {
    // 详情页相似商品对齐旧版 SHELF_BATCH：每批之间节流 1 秒，避免叠加变体请求触发频率限制
    if (interBatchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs))
    }
    await processBatch(items, end, interBatchDelayMs)
  }
}

/** 扫描列表页并注入 SKU 数据卡片（对应旧版 loadDatas 列表分支） */
export async function loadOzonListData(): Promise<{ processed: number }> {
  if (!isOzonListLikePage(resolveOzonPageType())) {
    return { processed: 0 }
  }
  if (shouldBlockListLoad()) {
    markListingAutoLoadPending()
    return { processed: 0 }
  }
  if (isLoading) {
    markListingAutoLoadPending()
    return { processed: 0 }
  }

  const items = collectPendingListItems()
  if (!items.length) {
    return { processed: 0 }
  }

  isLoading = true
  try {
    await processBatch(items, 0)
    bindCardCopyActions(document)
    return { processed: items.length }
  } catch (e) {
    if (e instanceof OzonSkuLoadError && e.message === '频率过快') {
      showToast('请求频率过快，请稍后再试', 4000)
    }
    throw e
  } finally {
    isLoading = false
    flushListingAutoLoadPending()
  }
}

/** 扫描详情页下方「相似商品」网格并注入卡片（对齐旧版 loadDatas 详情分支的 skuShelfGoods 贴卡） */
export async function loadOzonDetailShelfData(): Promise<{ processed: number }> {
  if (resolveOzonPageType() !== 'detail') return { processed: 0 }
  if (shouldBlockListLoad()) return { processed: 0 }
  if (isLoading) return { processed: 0 }

  const items = collectPendingShelfItems()
  if (!items.length) return { processed: 0 }

  isLoading = true
  try {
    await processBatch(items, 0, 1000)
    bindCardCopyActions(document)
    return { processed: items.length }
  } catch (e) {
    if (e instanceof OzonSkuLoadError && e.message === '频率过快') {
      showToast('请求频率过快，请稍后再试', 4000)
    }
    throw e
  } finally {
    isLoading = false
  }
}

/** 详情页「加载更多」：直接采集待处理 SKU，不再发送固定 SKU 探活请求。 */
export async function probeAndLoadDetailShelfData(): Promise<{ processed: number }> {
  if (resolveOzonPageType() !== 'detail') return { processed: 0 }
  if (shouldBlockListLoad()) return { processed: 0 }
  if (isLoading) return { processed: 0 }
  if (!collectPendingShelfItems().length) return { processed: 0 }

  return loadOzonDetailShelfData()
}

/** 列表自动加载入口：直接扫描贴卡，不发送与当前商品无关的探活请求。 */
export async function probeAndLoadOzonListData(): Promise<{ processed: number }> {
  if (!isOzonListLikePage(resolveOzonPageType())) return { processed: 0 }
  if (shouldBlockListLoad()) {
    markListingAutoLoadPending()
    return { processed: 0 }
  }
  if (isLoading) {
    markListingAutoLoadPending()
    return { processed: 0 }
  }
  if (!collectPendingListItems().length) return { processed: 0 }

  return loadOzonListData()
}

/** 启动列表页自动扫描（DOM + IO + scroll，对齐旧版 initAutoLoadObserver） */
export function startOzonListAutoScan() {
  startListingAutoLoad()
}

export function stopOzonListAutoScan() {
  stopListingAutoLoad()
}

export function isOzonListLoading(): boolean {
  return isLoading
}

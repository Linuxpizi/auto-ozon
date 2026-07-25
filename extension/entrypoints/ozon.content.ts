import {
  startOzonAnalyticsCards,
  type OzonCardProductContext,
} from '@/lib/ozonbox/analytics-card'
import { mergeCardListingPackageFacts } from '@/lib/ozonbox/card-listing-product'
import { collectCurrentOzonProduct } from '@/lib/ozonbox/collector'
import {
  assertOzonboxCollectedProduct,
  assertOzonboxProcessCardProductResponse,
  isRecord,
  type OzonboxCollectedProduct,
  type OzonboxProcessCardProductResponse,
  type OzonboxRuntimeMessage,
} from '@/lib/ozonbox/contract'
import { startOzonFloatingPanel } from '@/lib/ozonbox/floating-panel'
import { startOzonListCrawlController } from '@/lib/ozonbox/list-crawl'
import {
  DEFAULT_OZON_LIST_TARGET,
  assertOzonListCrawlStartConfig,
  type OzonListCardIdentity,
  type OzonListCrawlProcessConfig,
} from '@/lib/ozonbox/list-crawl-contract'
import { extractOzonProductId } from '@/lib/ozonbox/url'
import {
  readOzonPanelState,
  saveOzonPanelState,
  type OzonPanelState,
} from '@/lib/ozonbox/panel-storage'

function requireCurrentProductSku(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error('卖家报价请求缺少有效 SKU')
  }
  if (extractOzonProductId(location.href) !== value) {
    throw new Error('当前 Ozon 商品详情页与卖家报价 SKU 不一致')
  }
  return value
}

async function fetchCurrentProductSellerOffers(skuValue: unknown): Promise<unknown> {
  const sku = requireCurrentProductSku(skuValue)
  const response = await fetch(
    `/api/entrypoint-api.bx/page/json/v2?url=/modal/otherOffersFromSellers?product_id=${sku}`,
    { credentials: 'include' },
  )
  if (!response.ok) throw new Error(`Ozon 卖家报价请求失败 (${response.status})`)
  return response.json() as Promise<unknown>
}

export default defineContentScript({
  matches: ['https://*.ozon.ru/*'],
  async main(ctx) {
    let invalidated = false
    let analyticsCards: ReturnType<typeof startOzonAnalyticsCards> | undefined
    let floatingPanel: ReturnType<typeof startOzonFloatingPanel> | undefined
    let listCrawler: ReturnType<typeof startOzonListCrawlController> | undefined
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, _sender, sendResponse) => {
      const request = message as Partial<OzonboxRuntimeMessage>
      const operation = request.type === 'COLLECT_PRODUCT'
        ? collectCurrentOzonProduct()
        : request.type === 'OZONBOX_FETCH_SELLER_OFFERS'
          ? fetchCurrentProductSellerOffers(request.sku)
          : request.type === 'OZONBOX_LIST_CRAWL_START'
            ? (() => {
                listCrawler?.start(assertOzonListCrawlStartConfig(request.config))
                return Promise.resolve({ success: true })
              })()
          : request.type === 'OZONBOX_LIST_CRAWL_STOP'
            ? (() => { listCrawler?.stop(); return Promise.resolve({ success: true }) })()
          : request.type === 'OZONBOX_LIST_CRAWL_SNAPSHOT'
              ? Promise.resolve(listCrawler?.snapshot() ?? { status: 'idle', target: DEFAULT_OZON_LIST_TARGET, collected: 0, saved: 0, skipped: 0, pending: 0, failed: 0, message: '采集器未就绪' })
          : undefined
      if (!operation) return false
      operation
        .then((product) => sendResponse(product))
        .catch((error: unknown) => sendResponse({
          error: error instanceof Error ? error.message : 'Ozon 页面请求失败',
        }))
      return true
    }
    browser.runtime.onMessage.addListener(onMessage)
    ctx.onInvalidated(() => {
      invalidated = true
      browser.runtime.onMessage.removeListener(onMessage)
      floatingPanel?.stop()
      analyticsCards?.stop()
      listCrawler?.stop()
    })

    let panelState = await readOzonPanelState()
    if (invalidated) return

    let writeQueue: Promise<void> = Promise.resolve()
    const persistState = (patch: Partial<OzonPanelState>): Promise<void> => {
      panelState = {
        launcherPosition: patch.launcherPosition
          ? { ...patch.launcherPosition }
          : { ...panelState.launcherPosition },
        listCardsHidden: patch.listCardsHidden ?? panelState.listCardsHidden,
        detailCardsVisible: patch.detailCardsVisible ?? panelState.detailCardsVisible,
      }
      const snapshot: OzonPanelState = {
        ...panelState,
        launcherPosition: { ...panelState.launcherPosition },
      }
      const write = writeQueue
        .catch(() => undefined)
        .then(() => saveOzonPanelState(snapshot))
      writeQueue = write
      return write
    }

    const collectCardProduct = async ({ sku, sourceUrl }: OzonCardProductContext): Promise<OzonboxCollectedProduct> => {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'OZONBOX_COLLECT_CARD_PRODUCT',
        sku,
        sourceUrl,
      } satisfies OzonboxRuntimeMessage)
      if (!isRecord(response) || response.success !== true) {
        const message = isRecord(response) && typeof response.error === 'string' && response.error.trim()
          ? response.error.trim()
          : '所选商品采集服务返回了无效响应'
        throw new Error(message)
      }
      return assertOzonboxCollectedProduct(response.data)
    }

    const processListCardProduct = async (
      { sku, sourceUrl }: OzonListCardIdentity,
      config: OzonListCrawlProcessConfig,
    ): Promise<OzonboxProcessCardProductResponse> => {
      const response: unknown = await browser.runtime.sendMessage({
        type: 'OZONBOX_PROCESS_CARD_PRODUCT',
        sku,
        sourceUrl,
        config,
      } satisfies OzonboxRuntimeMessage)
      return assertOzonboxProcessCardProductResponse(response, sku)
    }

    const requireFloatingPanel = (): NonNullable<typeof floatingPanel> => {
      if (!floatingPanel) throw new Error('鲸智 AI 浮窗尚未就绪')
      return floatingPanel
    }

    const requireAnalyticsCards = (): NonNullable<typeof analyticsCards> => {
      if (!analyticsCards) throw new Error('Ozon 商品分析卡片尚未就绪')
      return analyticsCards
    }

    const prepareCurrentListingProduct = async (): Promise<OzonboxCollectedProduct> => {
      const sku = extractOzonProductId(location.href)
      if (!sku || !/^[1-9]\d*$/.test(sku)) {
        throw new Error('当前页面缺少有效 Ozon 商品 SKU')
      }
      requireAnalyticsCards().requireDisplayedPackageFacts(sku)
      const product = await collectCurrentOzonProduct()
      if (extractOzonProductId(location.href) !== sku) {
        throw new Error('商品采集期间当前 Ozon 商品详情页已发生变化')
      }
      const packageFacts = requireAnalyticsCards().requireDisplayedPackageFacts(sku)
      return mergeCardListingPackageFacts(product, sku, packageFacts)
    }

    analyticsCards = startOzonAnalyticsCards({
      initialState: panelState,
      persistCardVisibility: (visibility) => persistState(visibility),
      onCardListing: async (context) => {
        requireAnalyticsCards().requireDisplayedPackageFacts(context.sku, context.sourceUrl)
        const product = await collectCardProduct(context)
        const packageFacts = requireAnalyticsCards().requireDisplayedPackageFacts(context.sku, context.sourceUrl)
        const listingProduct = mergeCardListingPackageFacts(product, context.sku, packageFacts)
        requireFloatingPanel().openListingForProduct(listingProduct)
      },
      onCardProfit: async (context) => {
        const product = await collectCardProduct(context)
        requireFloatingPanel().openPricingForProduct('calculate2', product)
      },
      onCardPricing: async (context) => {
        const product = await collectCardProduct(context)
        requireFloatingPanel().openPricingForProduct('calculate', product)
      },
    })
    listCrawler = startOzonListCrawlController({ processCardProduct: processListCardProduct })
    floatingPanel = startOzonFloatingPanel({
      initialState: panelState,
      getCardVisibility: analyticsCards.getCardVisibility,
      setListCardsHidden: analyticsCards.setListCardsHidden,
      setDetailCardsVisible: analyticsCards.setDetailCardsVisible,
      persistLauncherPosition: (launcherPosition) => persistState({ launcherPosition }),
      prepareCurrentListingProduct,
      onStartListCrawl: (config) => listCrawler?.start(config),
    })

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      analyticsCards?.reconcile()
      floatingPanel?.reconcile()
      listCrawler?.reconcile()
    })
  },
})

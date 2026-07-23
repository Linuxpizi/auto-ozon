import {
  startOzonAnalyticsCards,
  type OzonCardProductContext,
} from '@/lib/ozonbox/analytics-card'
import { collectCurrentOzonProduct } from '@/lib/ozonbox/collector'
import {
  assertOzonboxCollectedProduct,
  isRecord,
  type OzonboxCollectedProduct,
  type OzonboxRuntimeMessage,
} from '@/lib/ozonbox/contract'
import { startOzonFloatingPanel } from '@/lib/ozonbox/floating-panel'
import {
  readOzonPanelState,
  saveOzonPanelState,
  type OzonPanelState,
} from '@/lib/ozonbox/panel-storage'

export default defineContentScript({
  matches: ['https://*.ozon.ru/*'],
  async main(ctx) {
    let invalidated = false
    let analyticsCards: ReturnType<typeof startOzonAnalyticsCards> | undefined
    let floatingPanel: ReturnType<typeof startOzonFloatingPanel> | undefined
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, _sender, sendResponse) => {
      const request = message as Partial<OzonboxRuntimeMessage>
      if (request.type !== 'COLLECT_PRODUCT') return false
      collectCurrentOzonProduct()
        .then((product) => sendResponse(product))
        .catch((error: unknown) => sendResponse({
          error: error instanceof Error ? error.message : 'Ozon 商品采集失败',
        }))
      return true
    }
    browser.runtime.onMessage.addListener(onMessage)
    ctx.onInvalidated(() => {
      invalidated = true
      browser.runtime.onMessage.removeListener(onMessage)
      floatingPanel?.stop()
      analyticsCards?.stop()
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

    const requireFloatingPanel = (): NonNullable<typeof floatingPanel> => {
      if (!floatingPanel) throw new Error('鲸智 AI 浮窗尚未就绪')
      return floatingPanel
    }

    analyticsCards = startOzonAnalyticsCards({
      initialState: panelState,
      persistCardVisibility: (visibility) => persistState(visibility),
      onCardListing: async (context) => {
        const product = await collectCardProduct(context)
        requireFloatingPanel().openListingForProduct(product)
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
    floatingPanel = startOzonFloatingPanel({
      initialState: panelState,
      getCardVisibility: analyticsCards.getCardVisibility,
      setListCardsHidden: analyticsCards.setListCardsHidden,
      setDetailCardsVisible: analyticsCards.setDetailCardsVisible,
      persistLauncherPosition: (launcherPosition) => persistState({ launcherPosition }),
    })

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      analyticsCards?.reconcile()
      floatingPanel?.reconcile()
    })
  },
})

import { startOzonAnalyticsCards } from '@/lib/ozonbox/analytics-card'
import { collectCurrentOzonProduct } from '@/lib/ozonbox/collector'
import type { OzonboxRuntimeMessage } from '@/lib/ozonbox/contract'

export default defineContentScript({
  matches: ['https://*.ozon.ru/*'],
  main(ctx) {
    const analyticsCards = startOzonAnalyticsCards()
    ctx.addEventListener(window, 'wxt:locationchange', analyticsCards.reconcile)
    ctx.onInvalidated(analyticsCards.stop)

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
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage))
  },
})

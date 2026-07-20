import { startOzonAnalyticsCards } from '@/lib/ozonbox/analytics-card'
import { collectCurrentOzonProduct } from '@/lib/ozonbox/collector'
import type { OzonboxRuntimeMessage } from '@/lib/ozonbox/contract'

export default defineContentScript({
  matches: ['https://*.ozon.ru/*'],
  main() {
    startOzonAnalyticsCards()
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const request = message as Partial<OzonboxRuntimeMessage>
      if (request.type !== 'COLLECT_PRODUCT') return false
      collectCurrentOzonProduct()
        .then((product) => sendResponse(product))
        .catch((error: unknown) => sendResponse({
          error: error instanceof Error ? error.message : 'Ozon 商品采集失败',
        }))
      return true
    })
  },
})

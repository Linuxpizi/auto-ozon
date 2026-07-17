// Replica background composition root. Keep this module free of UI/axios
// imports so it remains safe in the Manifest V3 service worker.
import { handleAiAutoSelectDraftMessage } from './aiAutoSelectDraftHandler'
import { handleCookieMessage } from './cookieHandler'
import { handleCookieSyncMessage, setupCookieSync } from './cookieSync'
import { handleExchangeRateMessage } from './exchangeRateHandler'
import { handleInternalExternalAction, setupExternalApi } from './externalApi'
import { handleImageSearchMessage } from './imageSearchHandler'
import { handleOzonGenericFetchStart } from './ozonGenericFetch'
import { handleProxyFetch, PROXY_FETCH_MESSAGE } from './proxyFetchHandler'
import { setupProxySseHandler } from './proxySseHandler'
import { handleThirdPartyCollectMessage } from './thirdPartyCollectHandler'

let initialized = false

/** Register all restored Ozon background capabilities exactly once. */
export function setupReplicaBackground(): void {
  if (initialized) return
  initialized = true

  setupProxySseHandler()
  setupCookieSync()
  setupExternalApi()

  chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
    if (msg?.type === PROXY_FETCH_MESSAGE) {
      void handleProxyFetch(msg.data, sendResponse)
      return true
    }

    if (handleImageSearchMessage(msg, sender, sendResponse)) return true
    if (handleCookieMessage(msg, sendResponse, sender)) return true
    if (handleCookieSyncMessage(msg, sendResponse)) return true
    if (handleExchangeRateMessage(msg, sender, sendResponse)) return true
    if (handleInternalExternalAction(msg, sender, sendResponse)) return true

    if (msg?.action === 'OZON_GENERIC_FETCH_START') {
      void handleOzonGenericFetchStart(msg, sender, sendResponse)
      return true
    }

    if (handleThirdPartyCollectMessage(msg, sender, sendResponse)) return true
    if (handleAiAutoSelectDraftMessage(msg, sendResponse)) return true

    // Let the existing WXT listener or popup own unknown messages.
    return false
  })

  console.info('[Replica] 本地化 Ozon background 已初始化')
}
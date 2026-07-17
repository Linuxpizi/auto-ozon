/**
 * Local web applications can call selected extension capabilities through
 * externally_connectable. Authentication/session data is never exposed.
 */
import {
  handleCloseTabRequest,
  handleOpenTabBackgroundRequest,
  handleOzonFetchProductInfoStart,
  setupOzonFetchProductInfoListener,
} from './ozonFetchProductInfo'

function isAllowedExternalOrigin(value?: string): boolean {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

export function setupExternalApi(): void {
  setupOzonFetchProductInfoListener()

  chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (!isAllowedExternalOrigin(sender.url)) {
      sendResponse({ success: false, error: '未授权的来源' })
      return false
    }

    const action = request?.action
    if (!action) {
      sendResponse({ success: false, error: 'missing action' })
      return false
    }

    void (async () => {
      try {
        switch (action) {
          case 'ping':
            sendResponse({
              success: true,
              version: chrome.runtime.getManifest().version,
              authentication: 'local-none',
            })
            break
          case 'fetchProductInfoStart':
            sendResponse(await handleOzonFetchProductInfoStart(request, sender))
            break
          default:
            sendResponse({ success: false, error: `unknown action: ${action}` })
        }
      } catch (error: unknown) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '处理请求时发生错误',
        })
      }
    })()

    return true
  })
}

/** Content scripts use the same product-fetch/tab operations internally. */
export function handleInternalExternalAction(
  request: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  const action = request?.action
  if (action === 'OZON_FETCH_PRODUCT_INFO_START' || action === 'fetchProductInfoStart') {
    void handleOzonFetchProductInfoStart(request as any, sender).then(sendResponse)
    return true
  }
  if (action === 'OPEN_TAB_BACKGROUND') {
    void handleOpenTabBackgroundRequest(request as any, sender).then(sendResponse)
    return true
  }
  if (action === 'CLOSE_TAB') {
    handleCloseTabRequest(request as { tabId?: number }, sendResponse)
    return true
  }
  return false
}
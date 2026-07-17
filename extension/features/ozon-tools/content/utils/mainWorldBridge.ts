/**
 * MAIN 世界脚本无 chrome.* API，通过 document 事件由 ISOLATED 世界代理扩展能力。
 */
import { API_CONFIG } from '../../utils/api-config'
import { hasExtensionMessaging } from '../../utils/runtime'
import { proxyFetchJson } from '../../utils/proxyFetch'

type MainBridgeRequestDetail = {
  requestId: string
  action: 'fetchSkuShops'
  sku?: string
}

document.addEventListener('ext-bridge-req', (event: Event) => {
  const detail = (event as CustomEvent<MainBridgeRequestDetail>).detail
  if (!detail?.requestId || detail.action !== 'fetchSkuShops') {
    return
  }

  const dispatchRes = (payload: Record<string, unknown>) => {
    document.dispatchEvent(
      new CustomEvent('ext-bridge-res', {
        detail: {
          requestId: detail.requestId,
          action: 'fetchSkuShops',
          ...payload,
        },
      }),
    )
  }

  if (!hasExtensionMessaging()) {
    dispatchRes({ success: false, error: '扩展消息不可用' })
    return
  }

  if (!detail.sku) {
    dispatchRes({ success: false, error: '缺少 sku' })
    return
  }

  // MAIN 世界受页面 CSP 限制，经 background 代理本地业务接口。
  proxyFetchJson(`${API_CONFIG.LOCAL_API_BASE_URL}/system/sku/shops`, {
    method: 'POST',
    body: { sku: detail.sku },
    preset: 'local_auth',
    timeout: 10000,
  })
    .then((data) => {
      dispatchRes({ success: true, data })
    })
    .catch((error: Error) => {
      dispatchRes({ success: false, error: error.message || '请求失败' })
    })
})

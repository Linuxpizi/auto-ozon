/**
 * 巡查跟卖后台抓取桥接（PC 页 ↔ background）。
 * 与富媒体 fetchProductInfo 通道（erpFetchProductInfoBridge.ts）并行，互不影响，仅做新增。
 *
 * 流程：
 *  1. 监听 CustomEvent `bcs-ozon-fetch-start`（window 和 document 都监听）
 *     detail: { taskId, sku, requests: [ {key,url}, ... ] }
 *  2. 转发到 background 后台 fetch（OZON_GENERIC_FETCH_START）。
 *  3. background 逐 key 回传 OZON_GENERIC_FETCH_DELIVER，本脚本据此在 PC 页
 *     dispatch CustomEvent `bcs-ozon-fetch-deliver`（window + document）并 window.postMessage。
 *     payload: { source:'bcs-plugin', type:'ozonFetchDeliver', taskId, sku, key, text, error }
 */

function forwardOzonFetchStart(e: Event) {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    return
  }
  const detail = (e && (e as CustomEvent).detail) || {}
  chrome.runtime.sendMessage(
    {
      action: 'OZON_GENERIC_FETCH_START',
      taskId: detail.taskId,
      sku: detail.sku,
      requests: Array.isArray(detail.requests) ? detail.requests : [],
    },
    function () {
      if (chrome.runtime.lastError) {
        console.warn('[ozonGenericFetch] 启动失败:', chrome.runtime.lastError.message)
      }
    },
  )
}

// window 和 document 都要监听
window.addEventListener('bcs-ozon-fetch-start', forwardOzonFetchStart)
document.addEventListener('bcs-ozon-fetch-start', forwardOzonFetchStart)

// 监听 background 逐 key 回传，派发回 PC 页
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
    if (request && request.action === 'OZON_GENERIC_FETCH_DELIVER') {
      const payload = request.payload || null
      try {
        window.dispatchEvent(new CustomEvent('bcs-ozon-fetch-deliver', { detail: payload }))
        document.dispatchEvent(new CustomEvent('bcs-ozon-fetch-deliver', { detail: payload }))
        if (payload) window.postMessage(payload, '*')
      } catch (deliverErr) {
        console.warn('[ozonGenericFetch] 派发至页面失败:', deliverErr)
      }
      sendResponse({ success: true })
      return true
    }
    return false
  })
}

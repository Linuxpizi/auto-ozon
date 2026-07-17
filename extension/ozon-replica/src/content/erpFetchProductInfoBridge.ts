/**
 * fetchProductInfo（富媒体）：对齐 ozon_old/src/ozon/index.js L1492–1521（原样移植）。
 */

// PC 端发起 Ozon 商品原始数据采集（由 background 后台开 Tab）
window.addEventListener('bcs-fetch-product-info-start', function (e) {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    return
  }
  var detail = (e && (e as CustomEvent).detail) || {}
  chrome.runtime.sendMessage({
    action: 'OZON_FETCH_PRODUCT_INFO_START',
    taskId: detail.taskId,
    urls: detail.urls || [],
  }, function () {
    if (chrome.runtime.lastError) {
      console.warn('[fetchProductInfo] 启动失败:', chrome.runtime.lastError.message)
    }
  })
})

// 监听来自background的消息，更新登录状态（备用路径）
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
    if (request.action === 'OZON_FETCH_PRODUCT_INFO_DELIVER') {
      try {
        window.dispatchEvent(new CustomEvent('bcs-fetch-product-info-deliver', {
          detail: request.payload || null,
        }))
      } catch (deliverErr) {
        console.warn('[fetchProductInfo] 派发至页面失败:', deliverErr)
      }
      sendResponse({ success: true })
      return true
    }
    return true
  })
}

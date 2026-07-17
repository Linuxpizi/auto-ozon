/**
 * Seller 退出登录 ISOLATED 桥接：
 * MAIN world 拦截 logout 后派发事件，此处转发给 background 清 Cookie 并刷新。
 */

const LOGOUT_EVENT = 'bcs_seller_logout'
import { INTERCEPT_SELLER_LOGOUT } from '@/lib/utils/ozon-cookie'

/** 同页只转发一次，配合 MAIN 侧 notified，双重防抖 */
let forwarded = false

document.addEventListener(LOGOUT_EVENT, () => {
  if (forwarded) return
  forwarded = true
  try {
    chrome.runtime.sendMessage({ action: INTERCEPT_SELLER_LOGOUT }, () => {
      // 忽略 lastError（SW 未就绪等），清 Cookie 由 background 负责
      void chrome.runtime.lastError
    })
  } catch {
    // sendMessage 同步异常时静默忽略
  }
})

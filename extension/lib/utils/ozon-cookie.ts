export const BIND_OZON_COOKIE_ACTION = 'BIND_OZON_COOKIE'
export const TRIGGER_SILENT_COOKIE_SYNC = 'TRIGGER_SILENT_COOKIE_SYNC'
export const INTERCEPT_SELLER_LOGOUT = 'INTERCEPT_SELLER_LOGOUT'

export type OzonCookieBindFailureReason =
  | 'missing_client_id'
  | 'missing_cookie'
  | 'backend_unavailable'
  | 'unknown'

export type OzonCookieBindResult =
  | {
      success: true
      clientId: string
      hasSsoCookie: boolean
      updatedAt: string
    }
  | {
      success: false
      reason: OzonCookieBindFailureReason
      error: string
    }

export async function bindOzonShopCookie(): Promise<OzonCookieBindResult> {
  try {
    const response = await browser.runtime.sendMessage({ action: BIND_OZON_COOKIE_ACTION })
    if (response?.success) return response as OzonCookieBindResult
    return {
      success: false,
      reason: response?.reason || 'unknown',
      error: response?.error || '保存 Cookie 失败',
    }
  } catch (reason) {
    return {
      success: false,
      reason: 'unknown',
      error: reason instanceof Error ? reason.message : String(reason),
    }
  }
}
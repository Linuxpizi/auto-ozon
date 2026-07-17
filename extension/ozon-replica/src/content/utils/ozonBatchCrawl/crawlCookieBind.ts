import { apiService } from '../../../utils/api'
import { showConfirm, showMessage } from '../../../utils/messageBox'
import { GET_COOKIES_ACTION, GET_COOKIE_ACTION } from '../../../background/cookieHandler'

const chromeApi: typeof chrome = chrome

function sendBgMessage<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chromeApi.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(res as T)
    })
  })
}

/**
 * 将当前 Ozon 店铺 Cookie 保存到本地服务。
 *   1. 读取当前页 sc_company_id；为空 → confirm 跳转 seller API 密钥页
 *   2. GET_COOKIES；没拿到 → confirm 自动刷新页面
 *   3. PUT /browser-sync/ozon-cookies 保存本地快照
 */
export async function bindOzonShopCookie(): Promise<void> {
  const currentUrl = window.location.href

  const cookieRes = await sendBgMessage<{ cookie?: { value?: string } | null }>({
    action: GET_COOKIE_ACTION,
    url: currentUrl,
    name: 'sc_company_id',
  })

  const clientId = cookieRes?.cookie?.value
  if (!clientId || clientId === '0') {
    const go = await showConfirm({
      title: '提示',
      message: '未获取到 Ozon Seller Client ID，是否前往 Seller 页面完成 Ozon 登录？',
      type: 'warning',
    })
    if (go) {
      window.open('https://seller.ozon.ru/app/settings/api-keys', '_blank')
    }
    return
  }

  const cookiesRes = await sendBgMessage<{ cookies?: string; ssoCookie?: string }>({
    action: GET_COOKIES_ACTION,
  })
  if (!cookiesRes?.cookies) {
    const reload = await showConfirm({
      title: '提示',
      message: '智能检测，刷新当前页面后，再重新保存 Cookie，点击确定自动刷新！',
      type: 'warning',
    })
    if (reload) window.location.reload()
    return
  }

  try {
    const res = await apiService.saveShopCookie({
      clientId,
      gfcookie: cookiesRes.cookies,
      ssoCookie: cookiesRes.ssoCookie || '',
    })
    if (res?.code === 200) {
      showMessage({ message: '保存店铺成功！', type: 'success' })
      return
    }
    showMessage({
      message: res?.msg || '本地服务保存失败',
      type: 'error',
    })
  } catch (e: any) {
    showMessage({
      message: e?.msg || e?.message || '本地服务不可用，保存 Cookie 失败',
      type: 'error',
    })
  }
}

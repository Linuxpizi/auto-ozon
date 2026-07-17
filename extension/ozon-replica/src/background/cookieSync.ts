/**
 * M01：Ozon 店铺 Cookie 定时静默同步
 * 对齐旧版 background.js silentSyncCookies
 */
import { API_CONFIG } from '../utils/api-config'
import { getOzonCookieString, getSsoCookieString } from './cookieHandler'

const COOKIE_SYNC_ALARM = 'mjgd_ozon_cookie_sync'
const SYNC_INTERVAL_MINUTES = 30
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Cookie 属于高敏感数据：无论配置值如何，只允许同步到本机 loopback 服务。 */
function getLoopbackApiBaseUrl(): string | null {
  try {
    const url = new URL(String(API_CONFIG.LOCAL_API_BASE_URL || ''))
    if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Content → Background：立即触发一次静默 Cookie 绑定（无 UI） */
export const TRIGGER_SILENT_COOKIE_SYNC = 'TRIGGER_SILENT_COOKIE_SYNC'

export function setupCookieSync() {
  chrome.alarms.create(COOKIE_SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== COOKIE_SYNC_ALARM) return
    void silentSyncCookies()
  })
}

/**
 * Content 请求立即静默绑定：fire-and-forget，不等待 PUT 结果，避免阻塞消息通道。
 * @returns 是否已处理该消息
 */
export function handleCookieSyncMessage(
  msg: { action?: string },
  sendResponse: (response?: unknown) => void,
): boolean {
  if (msg.action !== TRIGGER_SILENT_COOKIE_SYNC) return false
  void silentSyncCookies()
  sendResponse({ ok: true })
  return true
}

function readSellerClientId(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://seller.ozon.ru', name: 'sc_company_id' }, (cookie) => {
      const val = cookie?.value
      if (!val || val === '0') {
        resolve(null)
        return
      }
      resolve(val)
    })
  })
}

async function putShopCookie(
  apiBaseUrl: string,
  clientId: string,
  gfcookie: string,
  ssoCookie: string,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/browser-sync/ozon-cookies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      client_id: clientId,
      ozon_cookie: gfcookie,
      sso_cookie: ssoCookie,
      source: 'browser-extension',
    }),
  })
  if (!res.ok) {
    console.warn('[Background][CookieSync] PUT cookie 失败', res.status)
  }
}

/** 静默同步：seller sc_company_id + ozon.ru cookies → 本地后端 */
export async function silentSyncCookies(): Promise<void> {
  const apiBaseUrl = getLoopbackApiBaseUrl()
  if (!apiBaseUrl) {
    console.warn('[Background][CookieSync] 已拒绝向非本机地址同步 Ozon Cookie')
    return
  }

  const clientId = await readSellerClientId()
  if (!clientId) return

  const cookieString = await getOzonCookieString()
  if (!cookieString) return

  const ssoCookieString = await getSsoCookieString()
  try {
    await putShopCookie(apiBaseUrl, clientId, cookieString, ssoCookieString)
    // 同步后静默检测可用性（不弹 UI）
    await fetch(
      `${apiBaseUrl}/browser-sync/ozon-cookies/${encodeURIComponent(clientId)}/inspect`,
    ).catch(() => undefined)
  } catch (e) {
    console.warn('[Background][CookieSync] 同步异常', e)
  }
}

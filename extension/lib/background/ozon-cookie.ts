import { saveOzonCookieSnapshot } from '@/lib/utils/api'
import {
  BIND_OZON_COOKIE_ACTION,
  INTERCEPT_SELLER_LOGOUT,
  TRIGGER_SILENT_COOKIE_SYNC,
  type OzonCookieBindResult,
} from '@/lib/utils/ozon-cookie'

const COOKIE_SYNC_ALARM = 'auto_ozon_cookie_sync'
const SYNC_INTERVAL_MINUTES = 30
const SELLER_COOKIE_URL = 'https://seller.ozon.ru'
const SSO_COOKIE_URL = 'https://sso.ozon.ru'
const LOGOUT_RELOAD_COOLDOWN_MS = 15_000
const recentLogoutReloadAt = new Map<number, number>()

async function getCookieString(domain: string): Promise<string> {
  const cookies = await browser.cookies.getAll({ domain })
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

export async function getOzonCookieString(): Promise<string> {
  const cookies = await browser.cookies.getAll({ domain: 'ozon.ru' })
  if (!cookies.length) return ''

  let cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  if (cookies.some((cookie) => cookie.name === 'abt_data')) return cookieString

  const partitionedCookies = await browser.cookies.getAll({
    domain: 'ozon.ru',
    name: 'abt_data',
    partitionKey: { topLevelSite: 'https://ozon.ru' },
  } as Browser.cookies.GetAllDetails)
  const longest = [...partitionedCookies].sort(
    (left, right) => (right.value?.length || 0) - (left.value?.length || 0),
  )[0]
  if (longest) cookieString += `; ${longest.name}=${longest.value}`
  return cookieString
}

export function getSsoCookieString(): Promise<string> {
  return getCookieString('sso.ozon.ru')
}

async function readSellerClientId(): Promise<string | null> {
  const cookie = await browser.cookies.get({ url: SELLER_COOKIE_URL, name: 'sc_company_id' })
  const clientId = cookie?.value?.trim()
  return clientId && clientId !== '0' ? clientId : null
}

export async function bindCurrentOzonCookie(): Promise<OzonCookieBindResult> {
  const clientId = await readSellerClientId()
  if (!clientId) {
    return {
      success: false,
      reason: 'missing_client_id',
      error: '未获取到 Ozon Seller Client ID，请先登录 Seller 页面',
    }
  }

  const [ozonCookie, ssoCookie] = await Promise.all([
    getOzonCookieString(),
    getSsoCookieString(),
  ])
  if (!ozonCookie) {
    return {
      success: false,
      reason: 'missing_cookie',
      error: '未获取到 Ozon Cookie，请刷新 Ozon 页面后重试',
    }
  }

  try {
    const snapshot = await saveOzonCookieSnapshot({ clientId, ozonCookie, ssoCookie })
    return {
      success: true,
      clientId: snapshot.client_id,
      hasSsoCookie: snapshot.has_sso_cookie,
      updatedAt: snapshot.updated_at,
    }
  } catch (reason) {
    return {
      success: false,
      reason: 'backend_unavailable',
      error: reason instanceof Error ? reason.message : String(reason),
    }
  }
}

function isSellerAuthCookie(name: string): boolean {
  return name.includes('__Secure') || name.includes('rfuid') || name.includes('xcid') || name === 'bacntid'
}

async function removeCookie(url: string, name: string): Promise<void> {
  await browser.cookies.remove({ url, name })
}

async function clearSellerAuthCookies(): Promise<void> {
  const [ozonCookies, ssoCookies] = await Promise.all([
    browser.cookies.getAll({ domain: 'ozon.ru' }),
    browser.cookies.getAll({ domain: 'sso.ozon.ru' }),
  ])
  await Promise.all([
    ...ozonCookies
      .filter((cookie) => isSellerAuthCookie(cookie.name))
      .map((cookie) => removeCookie(SELLER_COOKIE_URL, cookie.name)),
    ...ssoCookies.map((cookie) => removeCookie(SSO_COOKIE_URL, cookie.name)),
  ])
}

function handleSellerLogout(sender: Browser.runtime.MessageSender): void {
  const tabId = sender.tab?.id
  const tabUrl = sender.tab?.url
  const now = Date.now()
  const onAuthPage = /\/(registration|signin|login|auth)/i.test(tabUrl || '')
  const lastReloadAt = tabId == null ? undefined : recentLogoutReloadAt.get(tabId)
  const inCooldown = lastReloadAt != null && now - lastReloadAt < LOGOUT_RELOAD_COOLDOWN_MS

  void clearSellerAuthCookies().then(() => {
    if (tabId != null && !onAuthPage && !inCooldown) {
      recentLogoutReloadAt.set(tabId, now)
      void browser.tabs.reload(tabId)
    }
  })
}

export function setupOzonCookieBackground(): void {
  browser.alarms.create(COOKIE_SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === COOKIE_SYNC_ALARM) void bindCurrentOzonCookie()
  })

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === BIND_OZON_COOKIE_ACTION) {
      void bindCurrentOzonCookie().then(sendResponse)
      return true
    }
    if (message?.action === TRIGGER_SILENT_COOKIE_SYNC) {
      void bindCurrentOzonCookie()
      sendResponse({ ok: true })
      return true
    }
    if (message?.action === INTERCEPT_SELLER_LOGOUT) {
      handleSellerLogout(sender)
      sendResponse({ ok: true })
      return true
    }
    return false
  })
}
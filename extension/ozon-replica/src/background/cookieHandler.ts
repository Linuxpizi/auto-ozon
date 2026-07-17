/**
 * M11/M01：Ozon Cookie 读取（供绑定 Cookie、爬取导出等使用）
 * Seller 退出拦截：清本地登录态 + SSO Cookie 后刷新页
 */

export const GET_COOKIES_ACTION = 'GET_COOKIES'
export const GET_COOKIE_ACTION = 'GET_COOKIE'
/** Content → Background：拦截 seller logout 后清 Cookie 并刷新 */
export const INTERCEPT_SELLER_LOGOUT = 'INTERCEPT_SELLER_LOGOUT'

const SELLER_COOKIE_URL = 'https://seller.ozon.ru'
const SSO_COOKIE_URL = 'https://sso.ozon.ru'
/** 同一 tab 短时间内重复 logout 拦截不再 reload，打断登录页循环刷新 */
const LOGOUT_RELOAD_COOLDOWN_MS = 15_000
const recentLogoutReloadAt = new Map<number, number>()

function removeCookie(url: string, name: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.cookies.remove({ url, name }, () => resolve())
  })
}

/** 已在登录/注册页时禁止 reload，否则清 Cookie 后页面再打 logout 会无限刷新 */
function isSellerAuthPageUrl(url: string | undefined): boolean {
  if (!url) return false
  return /\/(registration|signin|login|auth)/i.test(url)
}

/** 是否为 seller 登录态 Cookie。 */
function isSellerAuthCookieName(name: string): boolean {
  return (
    name.indexOf('__Secure') !== -1 ||
    name.indexOf('rfuid') !== -1 ||
    name.indexOf('xcid') !== -1 ||
    name === 'bacntid'
  )
}

/**
 * 仅清本地登录态 + SSO Cookie，不调用任何远端认证服务。
 */
export async function clearSellerAuthCookies(): Promise<void> {
  const [ozonCookies, ssoCookies] = await Promise.all([
    chrome.cookies.getAll({ domain: 'ozon.ru' }),
    chrome.cookies.getAll({ domain: 'sso.ozon.ru' }),
  ])

  const removals: Promise<void>[] = []
  for (const c of ozonCookies || []) {
    if (c?.name && isSellerAuthCookieName(c.name)) {
      removals.push(removeCookie(SELLER_COOKIE_URL, c.name))
    }
  }
  for (const c of ssoCookies || []) {
    if (c?.name) {
      removals.push(removeCookie(SSO_COOKIE_URL, c.name))
    }
  }
  await Promise.all(removals)
}

export function handleCookieMessage(
  msg: { action?: string; url?: string; name?: string },
  sendResponse: (response?: unknown) => void,
  sender?: chrome.runtime.MessageSender,
): boolean {
  if (msg.action === GET_COOKIES_ACTION) {
    void Promise.all([getOzonCookieString(), getSsoCookieString()])
      .then(([cookies, ssoCookie]) => sendResponse({ cookies, ssoCookie }))
      .catch(() => sendResponse({ cookies: '', ssoCookie: '' }))
    return true
  }

  if (msg.action === GET_COOKIE_ACTION && msg.url && msg.name) {
    chrome.cookies.get({ url: msg.url, name: msg.name }, (cookie) => {
      sendResponse({ cookie })
    })
    return true
  }

  // 拦截 seller logout：清 auth/SSO Cookie；非登录页才 reload（防登录页循环）
  if (msg.action === INTERCEPT_SELLER_LOGOUT) {
    const tabId = sender?.tab?.id
    const tabUrl = sender?.tab?.url
    const now = Date.now()
    const onAuthPage = isSellerAuthPageUrl(tabUrl)
    const lastReloadAt = tabId != null ? recentLogoutReloadAt.get(tabId) : undefined
    const inCooldown = lastReloadAt != null && now - lastReloadAt < LOGOUT_RELOAD_COOLDOWN_MS

    void clearSellerAuthCookies()
      .then(() => {
        // 登录页或冷却期内：只清 Cookie，不 reload，避免无限刷新
        if (tabId != null && !onAuthPage && !inCooldown) {
          recentLogoutReloadAt.set(tabId, now)
          chrome.tabs.reload(tabId)
        }
        sendResponse({ ok: true, reloaded: tabId != null && !onAuthPage && !inCooldown })
      })
      .catch((e) => {
        console.warn('[Background][SellerLogout] 清 Cookie 失败', e)
        sendResponse({ ok: false })
      })
    return true
  }

  return false
}

export async function getOzonCookieString(): Promise<string> {
  const cookies = await chrome.cookies.getAll({ domain: 'ozon.ru' })
  if (!cookies?.length) return ''

  let cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  if (cookies.some((c) => c?.name === 'abt_data')) {
    return cookieString
  }

  // 补充 partitionKey 下的 abt_data
  const abtList = await chrome.cookies.getAll({
    domain: 'ozon.ru',
    name: 'abt_data',
    partitionKey: { topLevelSite: 'https://ozon.ru' },
  } as chrome.cookies.GetAllDetails)

  if (!abtList?.length) return cookieString

  const longest = [...abtList].sort((a, b) => (b.value?.length || 0) - (a.value?.length || 0))[0]
  if (longest?.name) {
    cookieString += `; ${longest.name}=${longest.value}`
  }
  return cookieString
}

export async function getSsoCookieString(): Promise<string> {
  const ssoCookies = await chrome.cookies.getAll({ domain: 'sso.ozon.ru' })
  if (!ssoCookies?.length) return ''
  return ssoCookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

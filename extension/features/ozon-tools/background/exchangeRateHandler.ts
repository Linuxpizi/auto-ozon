/**
 * 汇率三方代理：content script 在 ozon.ru 域内 fetch 第三方 API 会因 CSP/CORS 失败，
 * 通过 background service worker 发起请求（host_permissions 已放行 api.exchangerate-api.com）。
 *
 * 旧版参考：ozon_old/src/ozon/utils.js 608-674 `fetchExchangeRates` 三方 API 并行。
 */

export const EXCHANGE_RATE_FETCH = 'EXCHANGE_RATE_FETCH'

export interface ExchangeRateResult {
  rmbLB: number
  rmbMY: number
  lbRMB: number
  lbMY: number
  myRMB: number
  myLB: number
}

const ENDPOINTS = {
  rub: 'https://api.exchangerate-api.com/v4/latest/RUB',
  cny: 'https://api.exchangerate-api.com/v4/latest/CNY',
  usd: 'https://api.exchangerate-api.com/v4/latest/USD',
} as const

const TIMEOUT_MS = 10000

async function fetchJsonWithTimeout(url: string): Promise<any | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function pickRate(json: any, target: string): number | null {
  if (!json || !json.rates) return null
  const v = json.rates[target]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

async function fetchRates(): Promise<ExchangeRateResult | null> {
  const [rub, cny, usd] = await Promise.all([
    fetchJsonWithTimeout(ENDPOINTS.rub),
    fetchJsonWithTimeout(ENDPOINTS.cny),
    fetchJsonWithTimeout(ENDPOINTS.usd),
  ])

  const result: ExchangeRateResult = {
    rmbLB: pickRate(cny, 'RUB') ?? 0,
    rmbMY: pickRate(cny, 'USD') ?? 0,
    lbRMB: pickRate(rub, 'CNY') ?? 0,
    lbMY: pickRate(rub, 'USD') ?? 0,
    myRMB: pickRate(usd, 'CNY') ?? 0,
    myLB: pickRate(usd, 'RUB') ?? 0,
  }

  // 至少有一个端点成功且字段全部 >0 才算有效
  const allValid = Object.values(result).every((v) => v > 0)
  if (!allValid) return null
  return result
}

export function handleExchangeRateMessage(
  msg: { type?: string },
  _sender: unknown,
  sendResponse: (response?: any) => void,
): boolean {
  if (!msg || msg.type !== EXCHANGE_RATE_FETCH) return false
  void fetchRates().then(
    (rates) => {
      if (rates) {
        sendResponse({ ok: true, rates })
      } else {
        sendResponse({ ok: false, error: '三方汇率源全部失败' })
      }
    },
    (err) => {
      sendResponse({ ok: false, error: (err && err.message) || '汇率拉取失败' })
    },
  )
  return true
}

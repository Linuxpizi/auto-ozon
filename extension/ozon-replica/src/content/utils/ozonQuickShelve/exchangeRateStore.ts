import { reactive } from 'vue'
import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'
import { EXCHANGE_RATE_FETCH } from '../../../background/exchangeRateHandler'

const STORAGE_KEY = 'mjgd_exchange_rates'
const STORAGE_TS_KEY = 'mjgd_exchange_rates_ts'
const STORAGE_SRC_KEY = 'mjgd_exchange_rates_src'
const CACHE_MS = 6 * 60 * 60 * 1000 // 6h（对齐旧版）

export type RateSource = 'thirdParty' | 'dict' | 'manual' | 'default'

export interface ExchangeRates {
  rmbLB: number
  rmbMY: number
  lbRMB: number
  lbMY: number
  myRMB: number
  myLB: number
}

const DEFAULT_RATES: ExchangeRates = {
  rmbLB: 12,
  rmbMY: 0.14,
  lbRMB: 0.08,
  lbMY: 0.011,
  myRMB: 7.2,
  myLB: 90,
}

export const exchangeRateState = reactive({
  visible: false,
  loading: false,
  rates: { ...DEFAULT_RATES } as ExchangeRates,
  /** 当前汇率来源 */
  source: 'default' as RateSource,
  /** 上次更新时间戳（ms） */
  updatedAt: 0,
})

function persistRates(rates: ExchangeRates, source: RateSource) {
  exchangeRateState.rates = { ...rates }
  exchangeRateState.source = source
  exchangeRateState.updatedAt = Date.now()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates))
    localStorage.setItem(STORAGE_TS_KEY, String(exchangeRateState.updatedAt))
    localStorage.setItem(STORAGE_SRC_KEY, source)
  } catch {
    /* ignore quota */
  }
}

function readStoredRates(): { rates: ExchangeRates; source: RateSource; ts: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const ts = parseInt(localStorage.getItem(STORAGE_TS_KEY) || '0', 10) || 0
    const src = (localStorage.getItem(STORAGE_SRC_KEY) as RateSource | null) || 'manual'
    return {
      rates: { ...DEFAULT_RATES, ...parsed },
      source: src,
      ts,
    }
  } catch {
    return null
  }
}

function sendBgMessage<T>(payload: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('background 响应超时'))
    }, timeoutMs)
    try {
      chrome.runtime.sendMessage(payload, (res) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(res as T)
      })
    } catch (e) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

async function fetchFromThirdParty(): Promise<ExchangeRates | null> {
  try {
    const res = await sendBgMessage<{ ok?: boolean; rates?: ExchangeRates; error?: string }>({
      type: EXCHANGE_RATE_FETCH,
    })
    if (res?.ok && res.rates) return res.rates
  } catch {
    /* ignore */
  }
  return null
}

async function fetchFromBackendDict(): Promise<ExchangeRates | null> {
  try {
    const res = await apiService.request<{
      code: number
      data?: Array<{ dictLabel?: string; dictValue?: string }>
    }>('/system/dict/data/type/exchange_rate', {
      method: 'GET',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
    })
    if (res?.code !== 200 || !Array.isArray(res.data)) return null
    const rates = { ...DEFAULT_RATES }
    let any = false
    for (const item of res.data) {
      const label = String(item.dictLabel || '').toLowerCase()
      const val = parseFloat(String(item.dictValue || ''))
      if (!Number.isFinite(val)) continue
      any = true
      if (label.includes('人民币') && label.includes('卢布')) rates.rmbLB = val
      if (label.includes('人民币') && label.includes('美元')) rates.rmbMY = val
      if (label.includes('卢布') && label.includes('人民币')) rates.lbRMB = val
      if (label.includes('卢布') && label.includes('美元')) rates.lbMY = val
      if (label.includes('美元') && label.includes('人民币')) rates.myRMB = val
      if (label.includes('美元') && label.includes('卢布')) rates.myLB = val
    }
    return any ? rates : null
  } catch {
    return null
  }
}

let _ratesLoadInflight: Promise<ExchangeRates> | null = null

/**
 * 加载汇率：
 * 1. forceRefresh=false 且缓存未过期 → 直接用缓存
 * 2. 否则按 三方 → 字典 → 硬编码 顺序兜底
 * 并发去重：列表页多张卡片同时触发时，未命中缓存只发一次三方/字典请求。
 */
export async function loadExchangeRates(forceRefresh = false): Promise<ExchangeRates> {
  if (!forceRefresh) {
    const cached = readStoredRates()
    if (cached && cached.ts > 0 && Date.now() - cached.ts < CACHE_MS) {
      exchangeRateState.rates = cached.rates
      exchangeRateState.source = cached.source
      exchangeRateState.updatedAt = cached.ts
      return cached.rates
    }
    if (_ratesLoadInflight) return _ratesLoadInflight
  }
  exchangeRateState.loading = true
  const task = (async (): Promise<ExchangeRates> => {
    try {
      const third = await fetchFromThirdParty()
      if (third) {
        persistRates(third, 'thirdParty')
        return third
      }
      const dict = await fetchFromBackendDict()
      if (dict) {
        persistRates(dict, 'dict')
        return dict
      }
      // 都失败：保留当前（可能是上次缓存或默认值）
      if (!exchangeRateState.updatedAt) {
        exchangeRateState.rates = { ...DEFAULT_RATES }
        exchangeRateState.source = 'default'
      }
      return exchangeRateState.rates
    } finally {
      exchangeRateState.loading = false
    }
  })()
  if (!forceRefresh) {
    _ratesLoadInflight = task
    void task.then(
      () => {
        _ratesLoadInflight = null
      },
      () => {
        _ratesLoadInflight = null
      },
    )
  }
  return task
}

/** 用户手填后保存（来源=manual） */
export function saveExchangeRates(rates: ExchangeRates) {
  persistRates(rates, 'manual')
}

/** 单个汇率立即应用（用于 blur 自动应用） */
export function applyExchangeRate(key: keyof ExchangeRates, value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false
  const next = { ...exchangeRateState.rates, [key]: value }
  persistRates(next, 'manual')
  return true
}

export function openExchangeRateModal() {
  exchangeRateState.visible = true
}

export function closeExchangeRateModal() {
  exchangeRateState.visible = false
}

/**
 * 解析价格文案为数字：兼容千分位（空格 / 逗号）与小数分隔（点 / 逗号），
 * 与 priceSourceResolver.parsePriceNumber 同源，避免 "¥1,234.56" 被旧解析截成 1.234。
 */
function parsePriceTextToNumber(priceText: string): number {
  let s = String(priceText || '')
    .replace(/[    ⁠]/g, '')
    .replace(/\s+/g, '')
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(?:,\d{3})+$/.test(s) || /^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '') // 逗号千分位：1,234 / 1,234.56
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.') // 逗号小数：1234,56
  } else {
    s = s.replace(/,/g, '') // 兜底：去掉残留逗号
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/** 源币 → 目标币 的汇率字段映射（同币种=1，见 convertListPriceToSaleCurrency） */
const DIRECT_RATE_KEY: Record<
  'rmb' | 'usd' | 'rub',
  Partial<Record<'rub' | 'rmb' | 'usd', keyof ExchangeRates>>
> = {
  rmb: { rub: 'rmbLB', usd: 'rmbMY' },
  usd: { rub: 'myLB', rmb: 'myRMB' },
  rub: { rmb: 'lbRMB', usd: 'lbMY' },
}

/**
 * 跟卖币种换算：把列表 / 四宫格里"原币"价格文案换算到目标币种。
 * 原币由文案符号识别（¥/￥=人民币，$=美元，否则卢布）。
 * 直接读取汇率设置里"源币→目标币"那一项系数（6 个方向 + 同币种=1），不经卢布中转——
 * 避免 rmbLB×lbMY 这种二次相乘 + 各自四舍五入导致的偏差（如 ¥175.84×0.147 应为 25.85，
 * 中转算成 25.51），保证"汇率设置里填多少就按多少换算"。
 */
export function convertListPriceToSaleCurrency(
  priceText: string,
  target: 'rub' | 'rmb' | 'usd',
): number | null {
  const num = parsePriceTextToNumber(priceText)
  if (!Number.isFinite(num)) return null
  const t = String(priceText || '')
  const source: 'rmb' | 'usd' | 'rub' =
    t.includes('¥') || t.includes('￥') ? 'rmb' : t.includes('$') ? 'usd' : 'rub'
  // 同币种无需换算，原值返回（如人民币商城选人民币跟卖）
  if (source === target) return num
  const key = DIRECT_RATE_KEY[source][target]
  if (!key) return num
  return num * (exchangeRateState.rates[key] || DEFAULT_RATES[key])
}

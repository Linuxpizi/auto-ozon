// 利润计算器配置 / 字典 / 当日 CBR 汇率 API
// 移植自旧插件 ozon_old/src/ozon/utils.js 中：
//   fetchProfitCalcConfig / saveProfitCalcConfig / loadProfitCalcConfig
//   getCachedProfitCalcConfig / setCachedProfitCalcConfig / onProfitCalcConfigChange
//   fetchTodayExchangeRateCbr
//   fetchDictByType + DICT_CARRIER

import { apiService } from '../../../utils/api'
import { API_CONFIG } from '../../../utils/api-config'
import {
  normalizeCalcLocalPrefs,
  setCalcLocalPrefs,
  type CalcLocalPrefs,
} from './calcLocalPrefs'

// ---------- 类型 ----------

export interface ProfitCalcCategoryPref {
  logisticsCategory?: string
  defaultServiceType?: string
  [k: string]: any
}

// ProfitCalcConfig 现同时承载「计算器展示/公式偏好」这 5 个字段（原先仅存 localStorage），
// 由后端 /system/profitCalcConfig/current 一并返回与保存。
export interface ProfitCalcConfig extends CalcLocalPrefs {
  domesticCostCny: number | null
  adsRatePct: number | null
  otherRatePct: number | null
  defaultCarrier: string | null
  remark: string | null
  categoryPrefs: ProfitCalcCategoryPref[]
}

export interface DictItem {
  dictLabel?: string
  dictValue?: string
  dictSort?: number | string
  [k: string]: any
}

export interface CbrExchangeRate {
  rubPerCny: number
  cnyPerRub: number
}

// 字典 dictType 常量
export const DICT_CARRIER = 'ozon_logistics_carrier_brand'
export const DICT_CATEGORY = 'ozon_logistics_category'
export const DICT_SERVICE_TYPE = 'ozon_logistics_service_type'

// ---------- 配置缓存 ----------

let _currentConfig: ProfitCalcConfig | null = null
let _currentConfigPromise: Promise<ProfitCalcConfig> | null = null
const _profitCalcListeners: Array<(cfg: ProfitCalcConfig | null) => void> = []

function _numOrNull(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function _normalizeProfitCalcConfig(raw: any): ProfitCalcConfig {
  raw = raw || {}
  return {
    domesticCostCny: _numOrNull(raw.domesticCostCny),
    adsRatePct: _numOrNull(raw.adsRatePct),
    otherRatePct: _numOrNull(raw.otherRatePct),
    defaultCarrier: raw.defaultCarrier || null,
    remark: raw.remark || null,
    categoryPrefs: Array.isArray(raw.categoryPrefs) ? raw.categoryPrefs.slice() : [],
    ...normalizeCalcLocalPrefs(raw),
  }
}

/** GET /system/profitCalcConfig/current */
export async function fetchProfitCalcConfig(): Promise<ProfitCalcConfig> {
  const res = await apiService.request<{ code: number; msg?: string; data?: any }>(
    '/system/profitCalcConfig/current',
    { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
  )
  if (!res) throw new Error('请求失败')
  if (res.code === 401) throw new Error('本地服务拒绝了请求')
  if (res.code !== 200) throw new Error(res.msg || '请求失败')
  return _normalizeProfitCalcConfig(res.data)
}

/** PUT /system/profitCalcConfig/current（全量覆盖） */
export async function saveProfitCalcConfig(payload: Partial<ProfitCalcConfig>): Promise<ProfitCalcConfig> {
  const res = await apiService.request<{ code: number; msg?: string; data?: any }>(
    '/system/profitCalcConfig/current',
    {
      method: 'PUT',
      baseURL: API_CONFIG.LOCAL_API_BASE_URL,
      data: payload,
    },
  )
  if (!res) throw new Error('请求失败')
  if (res.code === 401) throw new Error('本地服务拒绝了请求')
  if (res.code !== 200) throw new Error(res.msg || '请求失败')
  const normalized = _normalizeProfitCalcConfig(res.data ?? payload)
  setCachedProfitCalcConfig(normalized)
  return normalized
}

/** 拉取并缓存当前用户配置；多处调用共享同一个 Promise。 */
export function loadProfitCalcConfig(force?: boolean): Promise<ProfitCalcConfig> {
  if (!force && _currentConfig) return Promise.resolve(_currentConfig)
  // force 时也复用进行中的 Promise，避免同一轮初始化重复拉 current
  if (_currentConfigPromise) return _currentConfigPromise
  _currentConfigPromise = fetchProfitCalcConfig()
    .then((cfg) => {
      _currentConfigPromise = null
      // 统一走 setCachedProfitCalcConfig：写缓存 + 灌 calcLocalPrefs + 通知监听者
      setCachedProfitCalcConfig(cfg)
      return cfg
    })
    .catch((err) => {
      _currentConfigPromise = null
      throw err
    })
  return _currentConfigPromise
}

/** 同步取当前缓存，没拉到返回 null。 */
export function getCachedProfitCalcConfig(): ProfitCalcConfig | null {
  return _currentConfig
}

/** 监听配置变更（保存成功后会触发） */
export function onProfitCalcConfigChange(fn: (cfg: ProfitCalcConfig | null) => void): void {
  if (typeof fn === 'function') _profitCalcListeners.push(fn)
}

/** 保存后调用：刷新缓存并通知监听者 */
export function setCachedProfitCalcConfig(payload: any): void {
  _currentConfig = _normalizeProfitCalcConfig(payload)
  // 同步 5 个展示/公式偏好到内存缓存，供内嵌计算器等同步读取
  setCalcLocalPrefs(_currentConfig)
  _profitCalcListeners.forEach((fn) => {
    try {
      fn(_currentConfig)
    } catch (_e) {}
  })
}

// ---------- 当日 CBR 汇率 ----------

/** GET /system/exchangeRateCbr/today — 俄央行当日汇率 { rubPerCny, cnyPerRub } */
export async function fetchTodayExchangeRateCbr(): Promise<CbrExchangeRate | null> {
  try {
    const res = await apiService.request<{ code: number; msg?: string; data?: any }>(
      '/system/exchangeRateCbr/today',
      { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
    )
    if (!res || res.code !== 200) return null
    return _normalizeTodayExchangeRate(res.data)
  } catch (_e) {
    return null
  }
}

function _normalizeTodayExchangeRate(data: any): CbrExchangeRate | null {
  if (!data || typeof data !== 'object') return null
  const cnyPerRub = Number(data.cnyPerRub)
  const rubPerCny = Number(data.rubPerCny)
  if (isFinite(cnyPerRub) && cnyPerRub > 0) {
    return {
      cnyPerRub,
      rubPerCny: isFinite(rubPerCny) && rubPerCny > 0 ? rubPerCny : 1 / cnyPerRub,
    }
  }
  if (isFinite(rubPerCny) && rubPerCny > 0) {
    return {
      rubPerCny,
      cnyPerRub: 1 / rubPerCny,
    }
  }
  return null
}

// ---------- 字典 ----------

const _dictCache: Record<string, DictItem[]> = {}

/** GET /system/dict/data/type/{dictType}，返回 [{dictLabel, dictValue, ...}] 数组，按 dictSort 升序。 */
export async function fetchDictByType(dictType: string): Promise<DictItem[]> {
  if (_dictCache[dictType]) return _dictCache[dictType]
  const res = await apiService.request<{ code: number; data?: DictItem[] }>(
    '/system/dict/data/type/' + encodeURIComponent(dictType),
    { method: 'GET', baseURL: API_CONFIG.LOCAL_API_BASE_URL },
  )
  if (!res || res.code !== 200) throw new Error('字典加载失败')
  const list = Array.isArray(res.data) ? res.data.slice() : []
  list.sort((a, b) => {
    const sa = Number(a && a.dictSort)
        const sb = Number(b && b.dictSort)
    if (isFinite(sa) && isFinite(sb)) return sa - sb
    return 0
  })
  _dictCache[dictType] = list
  return list
}

/** 清掉字典缓存（本地服务配置切换时） */
export function clearDictCache(): void {
  Object.keys(_dictCache).forEach((k) => delete _dictCache[k])
}

// ---------- 物流报价 ----------

export interface LogisticsQuotePayload {
  carrierBrand: string
  goodsValueCny: number
  cnyPerRub: number
  packageWeightG: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface LogisticsPlan {
  serviceType?: string
  categoryEn?: string
  pickupPrice?: number | string | null
  doorPrice?: number | string | null
  chargeBy?: string | null
  [k: string]: any
}

export interface LogisticsQuoteResponse {
  code: number
  msg?: string
  data?: {
    plans?: LogisticsPlan[]
    [k: string]: any
  }
}

/** POST /system/logisticsQuote/calculate */
export async function fetchLogisticsQuote(payload: LogisticsQuotePayload): Promise<LogisticsQuoteResponse | null> {
  try {
    const res = await apiService.request<LogisticsQuoteResponse>(
      '/system/logisticsQuote/calculate',
      {
        method: 'POST',
        baseURL: API_CONFIG.LOCAL_API_BASE_URL,
        data: payload,
      },
    )
    return res || null
  } catch (_e) {
    return null
  }
}

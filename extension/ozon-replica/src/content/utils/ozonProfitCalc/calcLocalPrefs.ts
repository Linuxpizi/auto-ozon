// 计算器配置 Tab 的 5 个展示/公式偏好（详情展开 / 售价展示 / 公式系数 / 利润率口径）。
// 原先仅存浏览器 localStorage，现改为随「利润计算器配置」后端接口同步：
//   - 值由 /system/profitCalcConfig/current 返回，配置加载/保存后灌入本模块内存缓存
//   - 读取方（内嵌计算器、卡片渲染等）继续同步调用 getCalcLocalPrefs() 取缓存值
//   - 保存走 saveProfitCalcConfig 的 PUT（见 settingsController.applyCalcConfig），不再落 localStorage

export type PriceDisplayMode = 'actual' | 'recommend'
export type ProfitMarginMode = 'cost' | 'price'

export interface CalcLocalPrefs {
  /** 商品详情页内嵌面板是否默认展开 */
  detailExpandDefault: boolean
  /** 售价展示：actual=实际售价，recommend=推荐售价 */
  priceDisplayMode: PriceDisplayMode
  /** 实际售价反推系数：(黑-绿)*coeff+黑 */
  realPriceCoeff: number
  /** 推荐售价比例（%）：实际售价 × recommendRatePct% */
  recommendRatePct: number
  /** 利润率口径：cost=利润÷总成本，price=利润÷售价 */
  profitMarginMode: ProfitMarginMode
}

const DEFAULTS: CalcLocalPrefs = {
  detailExpandDefault: true,
  priceDisplayMode: 'actual',
  realPriceCoeff: 2.25,
  recommendRatePct: 95,
  profitMarginMode: 'cost',
}

type PrefsListener = (prefs: CalcLocalPrefs) => void
const _listeners: PrefsListener[] = []

// 内存缓存：由后端配置灌入（见 setCalcLocalPrefs）；未灌入前 getCalcLocalPrefs() 回落默认值
let _cache: CalcLocalPrefs | null = null

function _num(v: any, fallback: number): number {
  const n = Number(v)
  return isFinite(n) ? n : fallback
}

/** 从任意原始对象（含后端配置）中提取并归一化这 5 个字段 */
export function normalizeCalcLocalPrefs(raw: any): CalcLocalPrefs {
  raw = raw || {}
  const mode = String(raw.priceDisplayMode || '').trim()
  const marginMode = String(raw.profitMarginMode || '').trim()
  let coeff = _num(raw.realPriceCoeff, DEFAULTS.realPriceCoeff)
  if (!(coeff > 0)) coeff = DEFAULTS.realPriceCoeff
  let recommendRatePct = _num(raw.recommendRatePct, DEFAULTS.recommendRatePct)
  if (recommendRatePct < 0) recommendRatePct = 0
  else if (recommendRatePct > 100) recommendRatePct = 100
  return {
    detailExpandDefault: raw.detailExpandDefault !== false,
    priceDisplayMode: mode === 'recommend' ? 'recommend' : 'actual',
    profitMarginMode: marginMode === 'price' ? 'price' : 'cost',
    realPriceCoeff: coeff,
    recommendRatePct,
  }
}

export function getDefaultCalcLocalPrefs(): CalcLocalPrefs {
  return normalizeCalcLocalPrefs(DEFAULTS)
}

export function getCalcLocalPrefs(): CalcLocalPrefs {
  return _cache ? { ..._cache } : getDefaultCalcLocalPrefs()
}

/** 后端偏好是否已灌入内存缓存（未灌入前 getCalcLocalPrefs 读到的是默认值） */
export function hasCalcLocalPrefs(): boolean {
  return _cache != null
}

/** 由后端配置灌入内存缓存并通知监听者（不落 localStorage） */
export function setCalcLocalPrefs(raw: Partial<CalcLocalPrefs>): CalcLocalPrefs {
  const normalized = normalizeCalcLocalPrefs(raw)
  _cache = normalized
  _listeners.forEach((fn) => {
    try {
      fn(normalized)
    } catch {
      /* ignore */
    }
  })
  return normalized
}

export function onCalcLocalPrefsChange(fn: PrefsListener): void {
  if (typeof fn === 'function') _listeners.push(fn)
}

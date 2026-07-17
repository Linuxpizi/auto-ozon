// ==================== 卡片内嵌利润计算器 ====================
// 1:1 移植自旧插件 ozon_old/src/ozon/dom/inline-profit-calc.js
//
// 渲染流程：
//   1. 卡片插入时只放骨架 + spinner（phase=loading）
//   2. 等三个信号到齐：
//        - notifyInlineProfitDataLoaded     → 卡片接口 (commission)
//        - notifyInlineProfitRealPriceRub   → 详情页反推真实价（列表页后台 API 预拉，展开后再 ready）
//        - notifyInlineProfitPackagingFilled → 长宽高 + 重量
//   3. 信号齐后一次性触发 /system/logisticsQuote/calculate
//   4. fetch 回来（或显式失败）→ 替换骨架为真正面板（phase=ready）
//   5. 用户编辑表单字段：本地重算 + 防抖触发 refetch
//   6. 8s 兜底：信号没齐也强制 ready，避免一直卡 loading
//
// 汇率隔离：利润模块仅使用 /system/exchangeRateCbr/today（_todayExchangeRate）

import {
  fetchTodayExchangeRateCbr,
  fetchLogisticsQuote,
  fetchDictByType,
  loadProfitCalcConfig,
  getCachedProfitCalcConfig,
  onProfitCalcConfigChange,
  DICT_CARRIER,
  type CbrExchangeRate,
  type DictItem,
  type ProfitCalcConfig,
} from './profitCalcApi'
import {
  loadCommissionTree,
  resolveCommissionFromCategories,
  resolveTierRateByPath,
  type CommissionCategoryItem,
} from './commissionTree'
import { calculateOzonRealPrice } from './realPriceCalc'
import { getCalcLocalPrefs, type CalcLocalPrefs } from './calcLocalPrefs'
import { insertOzonRealPriceBox } from './realPriceFloatBox'
// 美元页专用：CBR 汇率接口不含美元，借「汇率设置」的直连汇率（myRMB=美元→人民币，myLB=美元→卢布）。
// 卢布/人民币仍走利润模块自己的 CBR 汇率，互不影响。
import { exchangeRateState, loadExchangeRates } from '../ozonQuickShelve/exchangeRateStore'

const DEFAULT_CARRIER_BRAND = 'CEL'
// 跨境运费计费重量上限（g）；超过则不可报价，运费显示 0.00¥ 并标红
const MAX_CHARGEABLE_WEIGHT_G = 30000
// 体积重换算除数（cm³ → kg）：默认长×宽×高 / 12000
const VOLUMETRIC_WEIGHT_DIVISOR_DEFAULT = 12000
// ZTO 的 Small / Budget / Premium Small 线路：长×宽×高 / 24000
const VOLUMETRIC_WEIGHT_DIVISOR_ZTO_SMALL = 24000
const ZTO_CARRIER = 'ZTO'
const ZTO_SMALL_SERVICE_TYPES: Record<string, boolean> = {
  Small: true,
  Budget: true,
  'Premium Small': true,
}
const API_DEBOUNCE_MS = 350
const READY_FALLBACK_MS = 8000
const FALLBACK_CNY_PER_RUB = 10.8885
const FALLBACK_RUB_PER_CNY = 0.0919

interface IPCCommission {
  rfbs1500?: number | string
  rfbs1500To5000?: number | string
  rfbsGreater5000?: number | string
  [k: string]: any
}

interface IPCState {
  sku: string
  page: 'detail' | 'list'
  priceRubForCommission: number
  panelExpanded: boolean
  priceExpandPending: boolean
  phase: 'loading' | 'ready'
  hasCardData: boolean
  hasRealPrice: boolean
  hasPackaging: boolean
  quoteAttempted: boolean
  salePriceCny: number
  actualSalePriceCny: number
  greenPriceRaw: number
  blackPriceRaw: number
  realPriceValue: number
  realPriceUnit: string
  realPriceFromGreenBlack: boolean
  commissionRate: number
  commissionRateEdited: boolean
  commissionTreePath: string[] | null
  commissionFallbackTriple: Array<number | string | undefined> | null
  cardCategories: CommissionCategoryItem[] | null
  purchaseCost: number
  businessRate: number
  businessRateEdited: boolean
  domesticCost: number
  domesticEdited: boolean
  carrierBrand: string
  carrierEdited: boolean
  weight: number
  length: number
  width: number
  height: number
  freightCny: number
  chargeBy: string | null
  quoteServiceType: string | null
  apiDebounceTimer: number
  quoteRequestSeq: number
  fallbackTimer: number
}

const stateMap = new Map<string, IPCState>()
let _todayExchangeRate: CbrExchangeRate | null = null
let _exchangeRatePromise: Promise<CbrExchangeRate | null> | null = null
let _initialized = false
let _carrierOptions: DictItem[] = []

// ---------- 工具 ----------

function computeBusinessRateFromConfig(cfg: ProfitCalcConfig | null): number {
  if (!cfg) return 0
  let ads = Number(cfg.adsRatePct)
  let other = Number(cfg.otherRatePct)
  if (!isFinite(ads)) ads = 0
  if (!isFinite(other)) other = 0
  return ads + other
}

function pickDefaultCarrierFromConfig(cfg: ProfitCalcConfig | null): string {
  if (cfg && cfg.defaultCarrier) return String(cfg.defaultCarrier)
  return DEFAULT_CARRIER_BRAND
}

function pickDefaultDomesticFromConfig(cfg: ProfitCalcConfig | null): number {
  if (!cfg) return 0
  const n = Number(cfg.domesticCostCny)
  return isFinite(n) && n >= 0 ? n : 0
}

function applyProfitCalcDefaultsFromCache(state: IPCState): void {
  if (!state) return
  const cfg = getCachedProfitCalcConfig()
  if (!cfg) return
  if (!state.businessRateEdited) {
    state.businessRate = computeBusinessRateFromConfig(cfg)
  }
  if (!state.domesticEdited) {
    state.domesticCost = pickDefaultDomesticFromConfig(cfg)
  }
  if (!state.carrierEdited) {
    state.carrierBrand = pickDefaultCarrierFromConfig(cfg)
  }
}

function syncStateToRootDom(state: IPCState, root: HTMLElement | null): void {
  if (!root || !state) return
  if (root.getAttribute('data-phase') !== 'ready') return
  state.phase = 'ready'
  const bizInput = root.querySelector<HTMLInputElement>('[data-field="businessRate"]')
  if (bizInput && document.activeElement !== bizInput && !state.businessRateEdited) {
    bizInput.value = String(state.businessRate)
  }
  const dcInput = root.querySelector<HTMLInputElement>('[data-field="domesticCost"]')
  if (dcInput && document.activeElement !== dcInput && !state.domesticEdited) {
    dcInput.value = String(state.domesticCost)
  }
  const carrSel = root.querySelector<HTMLSelectElement>('.bcs-ipc-carrier-select')
  if (carrSel && !state.carrierEdited) {
    carrSel.innerHTML = buildCarrierOptions(state.carrierBrand)
  }
  recalcReadyPanel(state, root)
}

function applyGlobalProfitCalcConfig(cfg: ProfitCalcConfig | null, forceOverride: boolean): void {
  const newBusinessRate = computeBusinessRateFromConfig(cfg)
  const newDomestic = pickDefaultDomesticFromConfig(cfg)
  const newCarrier = pickDefaultCarrierFromConfig(cfg)
  stateMap.forEach((state, sku) => {
    if (forceOverride || !state.businessRateEdited) state.businessRate = newBusinessRate
    if (forceOverride || !state.domesticEdited) state.domesticCost = newDomestic
    if (forceOverride || !state.carrierEdited) state.carrierBrand = newCarrier
    if (forceOverride) {
      state.businessRateEdited = false
      state.domesticEdited = false
      state.carrierEdited = false
    }
    const root = findRoot(sku)
    if (!root) return
    syncStateToRootDom(state, root)
    if (forceOverride && state.phase === 'ready') {
      scheduleQuoteRefetch(state, root)
    }
  })
}

function requestProfitCalcConfigIfNeeded(state: IPCState, root: HTMLElement | null): void {
  if (getCachedProfitCalcConfig()) return
  loadProfitCalcConfig()
    .then(() => {
      applyProfitCalcDefaultsFromCache(state)
      syncStateToRootDom(state, root)
      if (state.phase === 'ready') scheduleQuoteRefetch(state, root)
    })
    .catch(() => {
      /* 本地配置服务不可用时沿用默认配置 */
    })
}

function renderReadyPanel(state: IPCState, root: HTMLElement | null): void {
  if (!root || !state) return
  applyProfitCalcDefaultsFromCache(state)
  state.phase = 'ready'
  root.innerHTML = buildPanelContent(state)
  root.setAttribute('data-phase', 'ready')
  requestProfitCalcConfigIfNeeded(state, root)
}

function reattachPanelToDom(state: IPCState, root: HTMLElement | null): void {
  if (!state || !root) return
  const domPhase = root.getAttribute('data-phase') || 'loading'
  if (domPhase === 'ready') return

  if (state.phase === 'ready') {
    renderReadyPanel(state, root)
    return
  }

  if (coreSignalsReady(state)) {
    if (state.quoteAttempted) {
      transitionToReady(state, root)
    } else {
      checkAndFetchQuote(state, root)
    }
  }
}

function loadProfitCalcConfigWithRetry(retries: number): void {
  loadProfitCalcConfig().catch(() => {
    if (retries > 0) {
      setTimeout(() => loadProfitCalcConfigWithRetry(retries - 1), 3000)
    }
  })
}

function ensureProfitCalcConfigForRoot(state: IPCState, root: HTMLElement | null): void {
  applyProfitCalcDefaultsFromCache(state)
  syncStateToRootDom(state, root)
  requestProfitCalcConfigIfNeeded(state, root)
}

function buildCarrierOptions(selected: string): string {
  const list = _carrierOptions && _carrierOptions.length ? _carrierOptions : []
  let hasSelected = false
  let html = ''
  for (let i = 0; i < list.length; i++) {
    const o = list[i] || {}
    const val = String(o.dictValue || '')
    if (!val) continue
    const label = o.dictLabel || val
    const isSel = val === selected
    if (isSel) hasSelected = true
    html +=
      '<option value="' +
      escAttr(val) +
      '"' +
      (isSel ? ' selected' : '') +
      '>' +
      escAttr(label) +
      '</option>'
  }
  if (!hasSelected && selected) {
    html =
      '<option value="' + escAttr(selected) + '" selected>' + escAttr(selected) + '</option>' + html
  }
  if (!html) html = '<option value="">--</option>'
  return html
}

function refreshAllCarrierSelects(): void {
  document
    .querySelectorAll<HTMLSelectElement>(
      '.bcs-ipc-root[data-phase="ready"] .bcs-ipc-carrier-select',
    )
    .forEach((sel) => {
      const current = sel.value || ''
      sel.innerHTML = buildCarrierOptions(current)
    })
}

/** 由外部模块推送承运商列表 */
export function setInlineProfitCarrierOptions(list: DictItem[]): void {
  if (!Array.isArray(list) || !list.length) return
  _carrierOptions = list
  refreshAllCarrierSelects()
}

function loadCarrierDictWithRetry(retries: number): void {
  fetchDictByType(DICT_CARRIER)
    .then((list) => {
      if (Array.isArray(list) && list.length) {
        _carrierOptions = list
        refreshAllCarrierSelects()
      } else if (retries > 0) {
        setTimeout(() => loadCarrierDictWithRetry(retries - 1), 3000)
      }
    })
    .catch(() => {
      if (retries > 0) setTimeout(() => loadCarrierDictWithRetry(retries - 1), 3000)
    })
}

function loadCommissionTreeWithLocalRetry(retries: number): void {
  loadCommissionTree()
    .then(() => onCommissionTreeReady())
    .catch(() => {
      if (retries > 0) setTimeout(() => loadCommissionTreeWithLocalRetry(retries - 1), 3000)
    })
}

function onCommissionTreeReady(): void {
  stateMap.forEach((state, sku) => {
    if (state.commissionRateEdited) return
    if (!state.cardCategories || !state.cardCategories.length) return
    const root = findRoot(sku)
    if (root) syncPriceRubFromRoot(state, root)
    const changed = applyCommissionRateFromState(state)
    if (!changed) return
    if (root) refreshCommissionDom(state, root)
  })
}

interface ProfitCalcFieldInputConfig {
  maxDecimals: number
  maxValue?: number
}

function getProfitCalcFieldInputConfig(field: string): ProfitCalcFieldInputConfig {
  if (field === 'businessRate' || field === 'commissionRate') {
    return { maxDecimals: 2, maxValue: 100 }
  }
  if (field === 'weight') return { maxDecimals: 0 }
  if (field === 'length' || field === 'width' || field === 'height') return { maxDecimals: 1 }
  return { maxDecimals: 2 }
}

// type=number 无法同步清洗无效中间态（如 --42、10--22），改用 text + inputmode
function buildProfitCalcInputAttrs(field: string): string {
  const cfg = getProfitCalcFieldInputConfig(field)
  const inputmode = cfg.maxDecimals <= 0 ? 'numeric' : 'decimal'
  return 'type="text" inputmode="' + inputmode + '" autocomplete="off" spellcheck="false"'
}

// 去掉整数部分前导零，保留 0.xx 形式
function normalizeProfitCalcIntPart(intPart: string): string {
  if (!intPart) return '0'
  const trimmed = intPart.replace(/^0+(?=\d)/, '')
  return trimmed || '0'
}

/** 利润计算器输入清洗：遇负号截断、去非法字符、去前导零、限制小数位 */
function sanitizeProfitCalcInputText(raw: string, maxDecimals: number): string {
  let s = String(raw ?? '').replace(/[\s,，]/g, '')
  const minusIdx = s.indexOf('-')
  if (minusIdx >= 0) s = s.slice(0, minusIdx)
  s = s.replace(/[^\d.]/g, '')
  if (!s) return ''
  const dotIdx = s.indexOf('.')
  if (dotIdx >= 0) {
    const intPart = s.slice(0, dotIdx)
    let decPart = s.slice(dotIdx + 1).replace(/\./g, '')
    if (maxDecimals <= 0) return normalizeProfitCalcIntPart(intPart)
    if (decPart.length > maxDecimals) decPart = decPart.slice(0, maxDecimals)
    return normalizeProfitCalcIntPart(intPart) + '.' + decPart
  }
  return normalizeProfitCalcIntPart(s)
}

function parseProfitCalcInputValue(sanitized: string, cfg: ProfitCalcFieldInputConfig): number {
  if (!sanitized || sanitized === '.') return 0
  let n = parseFloat(sanitized)
  if (!isFinite(n) || n < 0) n = 0
  if (cfg.maxValue != null && n > cfg.maxValue) n = cfg.maxValue
  if (cfg.maxDecimals <= 0) return Math.round(n)
  const factor = Math.pow(10, cfg.maxDecimals)
  return Math.round(n * factor) / factor
}

function formatProfitCalcInputOnBlur(value: number, maxDecimals: number): string {
  if (!(value > 0)) return ''
  if (maxDecimals <= 0) return String(Math.round(value))
  return value.toFixed(maxDecimals)
}

function resolveProfitCalcInputDisplay(
  sanitized: string,
  value: number,
  cfg: ProfitCalcFieldInputConfig,
  finalize: boolean,
): string {
  if (!sanitized) return ''
  if (!finalize && sanitized.endsWith('.')) return sanitized
  const rawParsed = parseFloat(sanitized)
  if (finalize) return formatProfitCalcInputOnBlur(value, cfg.maxDecimals)
  if (isFinite(rawParsed) && value !== rawParsed) {
    return formatProfitCalcInputOnBlur(value, cfg.maxDecimals) || String(value)
  }
  return sanitized
}

function escAttr(v: any): string {
  return String(v == null ? '' : v).replace(/"/g, '&quot;')
}

function escHtml(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ---------- 列表卡片头部 narrow-disabled ----------

const LIST_PROFIT_TOOLTIP_ENABLED = '计算利润'
const LIST_PROFIT_TOOLTIP_DISABLED = '请去商品详情页打开'
let _listProfitResizeObserver: ResizeObserver | null = null

function isListCardProfitDisabled(cardEl: HTMLElement): boolean {
  const full = cardEl.querySelector<HTMLElement>('.bcs-list-card-brand-full')
  if (!full) return false
  if (window.getComputedStyle(full).display === 'none') return true
  return full.scrollWidth > full.clientWidth + 1
}

function ensureProfitBtnWrap(btn: HTMLElement): HTMLElement | null {
  if (!(btn instanceof HTMLElement)) return null
  const parent = btn.parentElement
  if (parent && parent.classList.contains('bcs-card-profit-btn-wrap')) return parent
  const wrap = document.createElement('span')
  wrap.className = 'bcs-card-profit-btn-wrap'
  btn.parentNode?.insertBefore(wrap, btn)
  wrap.appendChild(btn)
  return wrap
}

function syncListProfitBtnState(cardEl: HTMLElement): void {
  if (!(cardEl instanceof HTMLElement) || !cardEl.classList.contains('bcs-list-card')) return
  const btn = cardEl.querySelector<HTMLElement>('.bcs-card-profit-btn')
  if (!btn) return
  const wrap = ensureProfitBtnWrap(btn)
  const disabled = isListCardProfitDisabled(cardEl)
  btn.classList.toggle('bcs-card-profit-btn--narrow-disabled', disabled)
  if (wrap) wrap.classList.toggle('bcs-card-profit-btn-wrap--disabled', disabled)
  if (disabled) {
    btn.removeAttribute('data-tooltip')
    if (wrap) wrap.setAttribute('data-tooltip', LIST_PROFIT_TOOLTIP_DISABLED)
  } else {
    btn.setAttribute('data-tooltip', LIST_PROFIT_TOOLTIP_ENABLED)
    if (wrap) wrap.removeAttribute('data-tooltip')
  }
}

function observeListProfitCard(cardEl: HTMLElement): void {
  if (!(cardEl instanceof HTMLElement) || cardEl.dataset.bcsListProfitObserved === '1') return
  cardEl.dataset.bcsListProfitObserved = '1'
  syncListProfitBtnState(cardEl)
  requestAnimationFrame(() => syncListProfitBtnState(cardEl))
  if (!_listProfitResizeObserver) {
    _listProfitResizeObserver = new ResizeObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        syncListProfitBtnState(entries[i].target as HTMLElement)
      }
    })
  }
  _listProfitResizeObserver.observe(cardEl)
}

function scanListProfitCards(scope: HTMLElement): void {
  if (!(scope instanceof HTMLElement)) return
  if (scope.matches && scope.matches('.e1fbcs.bcs-list-card')) {
    observeListProfitCard(scope)
  }
  if (!scope.querySelectorAll) return
  scope.querySelectorAll<HTMLElement>('.e1fbcs.bcs-list-card').forEach(observeListProfitCard)
}

function setupListProfitCardObserver(): void {
  scanListProfitCards((document.body || document.documentElement) as HTMLElement)
  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      for (let j = 0; j < m.addedNodes.length; j++) {
        const node = m.addedNodes[j]
        if (node instanceof HTMLElement) scanListProfitCards(node)
      }
    }
  })
  observer.observe((document.body || document.documentElement) as Node, {
    childList: true,
    subtree: true,
  })
}

// ---------- 列表面板展开等价 ----------

function renderLoadingSkeleton(root: HTMLElement | null, loadingText: string): void {
  if (!root) return
  root.setAttribute('data-phase', 'loading')
  root.innerHTML =
    '<div class="bcs-ipc-skeleton">' +
    '<div class="bcs-ipc-spinner" aria-hidden="true"></div>' +
    '<div class="bcs-ipc-loading-text">' +
    escHtml(loadingText || '利润计算中…') +
    '</div>' +
    '</div>'
}

function listPanelMayTransition(state: IPCState): boolean {
  if (!state || state.page !== 'list') return true
  return !!state.panelExpanded && !!state.hasRealPrice
}

function waitForListRealPrice(state: IPCState, attemptsLeft: number): Promise<void> {
  if (!state || state.hasRealPrice || attemptsLeft <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      waitForListRealPrice(state, attemptsLeft - 1).then(resolve)
    }, 200)
  })
}

function cssEscapeSku(sku: string): string {
  return String(sku).replace(/"/g, '\\"')
}

// ---------- CBR 汇率 ----------

function _fetchTodayExchangeRate(): Promise<CbrExchangeRate | null> {
  if (_todayExchangeRate) return Promise.resolve(_todayExchangeRate)
  if (_exchangeRatePromise) return _exchangeRatePromise
  _exchangeRatePromise = fetchTodayExchangeRateCbr()
    .then((data) => {
      if (data) _todayExchangeRate = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      _exchangeRatePromise = null
    })
  return _exchangeRatePromise
}

function loadTodayExchangeRateWithRetry(retries: number): void {
  _fetchTodayExchangeRate()
    .then((rate) => {
      if (rate && rate.cnyPerRub > 0) {
        onTodayExchangeRateReady()
      } else if (retries > 0) {
        setTimeout(() => loadTodayExchangeRateWithRetry(retries - 1), 3000)
      }
    })
    .catch(() => {
      if (retries > 0) setTimeout(() => loadTodayExchangeRateWithRetry(retries - 1), 3000)
    })
}

function getRubPerCny(): number {
  if (_todayExchangeRate && _todayExchangeRate.rubPerCny > 0) return _todayExchangeRate.rubPerCny
  return FALLBACK_RUB_PER_CNY
}

function getCnyPerRub(): number {
  if (_todayExchangeRate && _todayExchangeRate.cnyPerRub > 0) return _todayExchangeRate.cnyPerRub
  return FALLBACK_CNY_PER_RUB
}

function onTodayExchangeRateReady(): void {
  stateMap.forEach((state, sku) => {
    if (state.realPriceValue > 0) applyRealPriceToState(state)
    const root = findRoot(sku)
    if (!root) return
    if (state.phase === 'ready') {
      recalcReadyPanel(state, root)
      scheduleQuoteRefetch(state, root)
    } else if (state.quoteAttempted) {
      state.quoteAttempted = false
      checkAndFetchQuote(state, root)
    } else {
      checkAndFetchQuote(state, root)
    }
  })
}

// 根据本地偏好决定面板售价标签文案
function getSalePriceLabel(prefs?: CalcLocalPrefs): string {
  prefs = prefs || getCalcLocalPrefs()
  return prefs.priceDisplayMode === 'recommend' ? '推荐售价' : '实际售价'
}

// 卢布提示前缀：与售价展示模式一致
function getPriceRubTipLabel(prefs?: CalcLocalPrefs): string {
  prefs = prefs || getCalcLocalPrefs()
  return prefs.priceDisplayMode === 'recommend' ? '计算后推荐售价为' : '计算后实际售价为'
}

function getProfitRateLabel(prefs?: CalcLocalPrefs): string {
  prefs = prefs || getCalcLocalPrefs()
  return prefs.profitMarginMode === 'cost' ? '成本利润率' : '销售利润率'
}

interface PanelEconomics {
  sale: number
  purchase: number
  businessRate: number
  commissionRate: number
  domestic: number
  freight: number
  businessCost: number
  commissionCost: number
  profit: number
  rate: number
}

// 统一计算面板经济字段；利润率口径仅影响 rate，预计利润始终为 售价−各项成本
function computePanelEconomics(state: IPCState, prefs?: CalcLocalPrefs): PanelEconomics {
  prefs = prefs || getCalcLocalPrefs()
  const sale = Math.max(0, Number(state.salePriceCny) || 0)
  const purchase = Math.max(0, Number(state.purchaseCost) || 0)
  const businessRate = Number(state.businessRate) || 0
  const commissionRate = Number(state.commissionRate) || 0
  const domestic = Math.max(0, Number(state.domesticCost) || 0)
  let freight = Math.max(0, Number(state.freightCny) || 0)
  if (isFreightOverWeightLimit(state)) freight = 0
  const businessCost = (sale * businessRate) / 100
  const commissionCost = (sale * commissionRate) / 100
  let profit = sale - purchase - businessCost - commissionCost - domestic - freight
  profit = Math.round(profit * 100) / 100
  let rate = resolveProfitRatePct(
    profit,
    sale,
    purchase,
    businessCost,
    commissionCost,
    domestic,
    freight,
    prefs,
  )
  rate = Math.round(rate * 100) / 100
  return {
    sale,
    purchase,
    businessRate,
    commissionRate,
    domestic,
    freight,
    businessCost,
    commissionCost,
    profit,
    rate,
  }
}

// 由 actualSalePriceCny 按展示模式换算输入框应显示的人民币售价
function resolveDisplaySalePriceCny(state: IPCState, prefs?: CalcLocalPrefs): number {
  prefs = prefs || getCalcLocalPrefs()
  let actual = Number(state.actualSalePriceCny)
  if (!(actual > 0)) actual = Number(state.salePriceCny) || 0
  if (!(actual > 0)) return 0
  if (prefs.priceDisplayMode === 'recommend') {
    return Math.round(actual * prefs.recommendRatePct) / 100
  }
  return actual
}

function applySalePriceDisplayFromPrefs(state: IPCState, prefs?: CalcLocalPrefs): void {
  const display = resolveDisplaySalePriceCny(state, prefs)
  if (display > 0) {
    state.salePriceCny = Math.round(display * 100) / 100
  }
}

// 按本地偏好计算利润率：cost=利润÷总成本，price=利润÷售价
function resolveProfitRatePct(
  profit: number,
  sale: number,
  purchase: number,
  businessCost: number,
  commissionCost: number,
  domestic: number,
  freight: number,
  prefs?: CalcLocalPrefs,
): number {
  prefs = prefs || getCalcLocalPrefs()
  if (prefs.profitMarginMode === 'cost') {
    const totalCost = purchase + businessCost + commissionCost + domestic + freight
    return totalCost > 0 ? (profit / totalCost) * 100 : 0
  }
  return sale > 0 ? (profit / sale) * 100 : 0
}

// 佣金档位用实际卢布价，不受展示模式影响
function resolveActualPriceRub(state: IPCState): number {
  if (state.realPriceFromGreenBlack && state.realPriceUnit) {
    const u = String(state.realPriceUnit).trim()
    const isRub = u === '₽' || u === 'P' || u === 'руб' || u === ''
    if (isRub && Number(state.priceRubForCommission) > 0) {
      return Number(state.priceRubForCommission)
    }
  }
  const fromCard = Number(state.priceRubForCommission)
  if (fromCard > 0) return fromCard
  const actualCny = Number(state.actualSalePriceCny)
  if (actualCny > 0) {
    const cnyPerRub = getCnyPerRub()
    return cnyPerRub > 0 ? actualCny * cnyPerRub : 0
  }
  return resolveBestPriceRub(state)
}

// 面板卢布提示：推荐模式下按系数折算，与人民币售价输入框口径一致
function resolveDisplayPriceRub(state: IPCState, prefs?: CalcLocalPrefs): number {
  prefs = prefs || getCalcLocalPrefs()
  const actualRub = resolveActualPriceRub(state)
  if (!(actualRub > 0)) return 0
  if (prefs.priceDisplayMode === 'recommend') {
    return Math.round(actualRub * prefs.recommendRatePct) / 100
  }
  return actualRub
}

// 实际售价单位归一：₽ / P / руб / 空 → 卢布；¥/￥/CNY → 人民币；$/USD → 美元
function normalizeMallUnit(rawUnit: string | null | undefined): '₽' | '¥' | '$' {
  const u = String(rawUnit == null ? '' : rawUnit).trim()
  if (u === '¥' || u === '￥' || u === 'CNY' || u === 'cny') return '¥'
  if (u === '$' || u === 'USD' || u === 'usd') return '$'
  return '₽'
}

// 「计算后实际售价」按商城币种展示：单位随 realPriceUnit，数值用对应汇率换算
//   - 卢布：沿用原 CBR 卢布口径
//   - 人民币：直接用 CNY 显示价
//   - 美元：CNY 显示价按 myRMB 折回美元（CBR 无美元，与售价换算口径一致）
function resolveDisplayPriceForMall(
  state: IPCState,
  prefs?: CalcLocalPrefs,
): { value: number; unit: '₽' | '¥' | '$' } {
  prefs = prefs || getCalcLocalPrefs()
  const unit = normalizeMallUnit(state.realPriceUnit)
  if (unit === '¥') {
    return { value: resolveDisplaySalePriceCny(state, prefs), unit }
  }
  if (unit === '$') {
    const cny = resolveDisplaySalePriceCny(state, prefs)
    const usdToCny = exchangeRateState.rates.myRMB || 7.2
    return { value: usdToCny > 0 ? cny / usdToCny : 0, unit }
  }
  return { value: resolveDisplayPriceRub(state, prefs), unit }
}

function applyRealPriceToState(state: IPCState): void {
  const value = Number(state.realPriceValue)
  if (!isFinite(value) || value <= 0) return
  const unitStr = String(state.realPriceUnit == null ? '' : state.realPriceUnit).trim()
  const isRub = unitStr === '₽' || unitStr === 'P' || unitStr === 'руб' || unitStr === ''
  const isCny = unitStr === '¥' || unitStr === '￥' || unitStr === 'CNY' || unitStr === 'cny'
  const isUsd = unitStr === '$' || unitStr === 'USD' || unitStr === 'usd'
  const rubPerCnyRate = getRubPerCny()
  const cnyPerRubRate = getCnyPerRub()
  let salePriceCny = 0
  let priceRubForCommission = 0
  if (isRub) {
    salePriceCny = rubPerCnyRate > 0 ? value * rubPerCnyRate : 0
    priceRubForCommission = value
    state.realPriceFromGreenBlack = true
  } else if (isCny) {
    salePriceCny = value
    priceRubForCommission = cnyPerRubRate > 0 ? value * cnyPerRubRate : 0
    state.realPriceFromGreenBlack = true
  } else if (isUsd) {
    // CBR 没有美元，改用「汇率设置」的美元直连汇率（缺省回退 7.2 / 90，与 DEFAULT_RATES 一致）
    const usdToCny = exchangeRateState.rates.myRMB || 7.2
    const usdToRub = exchangeRateState.rates.myLB || 90
    salePriceCny = value * usdToCny
    priceRubForCommission = value * usdToRub
    state.realPriceFromGreenBlack = true
  } else {
    salePriceCny = value
    priceRubForCommission = cnyPerRubRate > 0 ? value * cnyPerRubRate : 0
    state.realPriceFromGreenBlack = true
  }
  salePriceCny = Math.round(salePriceCny * 100) / 100
  if (salePriceCny > 0) {
    state.actualSalePriceCny = salePriceCny
    applySalePriceDisplayFromPrefs(state)
  }
  state.priceRubForCommission = priceRubForCommission
}

function normalizeRate(raw: any): number {
  const n = parseFloat(String(raw == null ? '' : raw))
  if (!isFinite(n) || n <= 0) return 0
  return n < 1 ? n * 100 : n
}

function resolveChargeByTag(chargeBy: string | null): { cls: string; text: string } {
  if (chargeBy === '实重计费') {
    return { cls: 'bcs-ipc-tag bcs-ipc-tag-weight', text: '实重' }
  }
  return { cls: 'bcs-ipc-tag bcs-ipc-tag-volume', text: '计抛' }
}

// 体积重（g）：长×宽×高(cm) / divisor × 1000
function isZtoSmallServiceType(serviceType: string | null): boolean {
  return !!ZTO_SMALL_SERVICE_TYPES[String(serviceType || '').trim()]
}

function resolveVolumetricWeightDivisor(state: IPCState): number {
  const carrier = String((state && state.carrierBrand) || '')
    .trim()
    .toUpperCase()
  if (carrier === ZTO_CARRIER && isZtoSmallServiceType(state && state.quoteServiceType)) {
    return VOLUMETRIC_WEIGHT_DIVISOR_ZTO_SMALL
  }
  return VOLUMETRIC_WEIGHT_DIVISOR_DEFAULT
}

function calcVolumetricWeightG(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: number,
): number {
  const l = Number(lengthCm) || 0
  const w = Number(widthCm) || 0
  const h = Number(heightCm) || 0
  if (l <= 0 || w <= 0 || h <= 0) return 0
  const d = Number(divisor) || VOLUMETRIC_WEIGHT_DIVISOR_DEFAULT
  return ((l * w * h) / d) * 1000
}

// 计费重量（g）：实重计费取实重，否则取实重与体积重较大值
function resolveChargeableWeightG(state: IPCState): number {
  if (!state) return 0
  const actualG = Math.max(0, Number(state.weight) || 0)
  const volG = calcVolumetricWeightG(
    state.length,
    state.width,
    state.height,
    resolveVolumetricWeightDivisor(state),
  )
  if (state.chargeBy === '实重计费') return actualG
  return Math.max(actualG, volG)
}

function isFreightOverWeightLimit(state: IPCState): boolean {
  return resolveChargeableWeightG(state) > MAX_CHARGEABLE_WEIGHT_G
}

// 拉报价前：ZTO 且尚未知 serviceType 时，体积重除数未确定，仅按实重拦截
function shouldSkipFreightQuote(state: IPCState): boolean {
  const actualG = Math.max(0, Number((state && state.weight) || 0))
  if (actualG > MAX_CHARGEABLE_WEIGHT_G) return true
  const carrier = String((state && state.carrierBrand) || '')
    .trim()
    .toUpperCase()
  if (carrier === ZTO_CARRIER && !state.quoteServiceType) return false
  return isFreightOverWeightLimit(state)
}

function freightCostTextCls(freight: number, overweight?: boolean): string {
  if (overweight || !(Number(freight) > 0)) return ' bcs-ipc-cost-text--zero'
  return ''
}

function pickPreferredServiceType(plans: any[]): string {
  if (!Array.isArray(plans) || !plans.length) return 'Standard'
  let categoryEn = ''
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i] || {}
    if (p.categoryEn) {
      categoryEn = String(p.categoryEn)
      break
    }
  }
  if (!categoryEn) return 'Standard'
  const cfg = getCachedProfitCalcConfig() || ({} as ProfitCalcConfig)
  const prefs = Array.isArray(cfg.categoryPrefs) ? cfg.categoryPrefs : []
  for (let j = 0; j < prefs.length; j++) {
    const pref = prefs[j] || {}
    if (pref.logisticsCategory === categoryEn) {
      return pref.defaultServiceType || 'Standard'
    }
  }
  return 'Standard'
}

function pickPlanByServiceType(plans: any[], serviceType: string): any | null {
  if (!Array.isArray(plans) || !plans.length || !serviceType) return null
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i] || {}
    if (p.serviceType === serviceType) return p
  }
  return null
}

function planHasQuote(plan: any): boolean {
  if (!plan) return false
  return plan.pickupPrice != null || plan.doorPrice != null
}

function pickQuotePlan(plans: any[], preferredType: string): any | null {
  let pick = pickPlanByServiceType(plans, preferredType)
  if (planHasQuote(pick)) return pick
  if (preferredType !== 'Standard') {
    pick = pickPlanByServiceType(plans, 'Standard')
    if (planHasQuote(pick)) return pick
  }
  if (!Array.isArray(plans)) return null
  for (let i = 0; i < plans.length; i++) {
    if (planHasQuote(plans[i])) return plans[i]
  }
  return null
}

function pickCommissionRateFromTriple(
  triple: Array<number | string | undefined>,
  priceRubForCommission: number,
): number {
  if (!Array.isArray(triple) || !triple.length) return 0
  const pr = Number(priceRubForCommission)
  // 简化 tier 判断（与 ozonSelectionRules/matchUtils.ts commissionActiveTierFromPriceRub 等价）
  let tier = -1
  if (isFinite(pr) && pr > 0) {
    if (pr <= 1500) tier = 0
    else if (pr <= 5000) tier = 1
    else tier = 2
  }
  const raw = tier >= 0 ? triple[tier] : triple[1]
  return normalizeRate(raw)
}

function resolveBestPriceRub(state: IPCState): number {
  const fromCard = Number(state.priceRubForCommission)
  if (isFinite(fromCard) && fromCard > 0) return fromCard
  const sale = Number(state.salePriceCny) || 0
  return sale > 0 ? sale * getCnyPerRub() : 0
}

function applyCommissionRateFromState(state: IPCState): boolean {
  if (state.commissionRateEdited) return false
  const priceRub = resolveBestPriceRub(state)
  if (priceRub <= 0) return false

  let rate = 0
  if (state.commissionTreePath && state.commissionTreePath.length) {
    rate = resolveTierRateByPath(state.commissionTreePath, priceRub)
  } else if (state.cardCategories && state.cardCategories.length) {
    const matched = resolveCommissionFromCategories(state.cardCategories, priceRub)
    if (matched && matched.path && matched.path.length) {
      state.commissionTreePath = matched.path
      rate = matched.rate
    }
  }

  if (!(rate > 0) && state.commissionFallbackTriple) {
    rate = pickCommissionRateFromTriple(state.commissionFallbackTriple, priceRub)
  }

  if (rate > 0 && rate !== state.commissionRate) {
    state.commissionRate = rate
    return true
  }
  return false
}

function refreshCommissionDom(state: IPCState, root: HTMLElement | null): void {
  if (!root || state.phase !== 'ready') return
  const input = root.querySelector<HTMLInputElement>('[data-field="commissionRate"]')
  if (input && document.activeElement !== input) {
    const rate = Number(state.commissionRate) || 0
    input.value = rate > 0 ? rate.toFixed(2) : ''
  }
  recalcReadyPanel(state, root)
}

// ---------- HTML 构建 ----------

export interface PanelHtmlOpts {
  defaultVisible?: boolean
  page?: 'detail' | 'list'
  priceRubForCommission?: number
}

/** 卡片首次渲染时只产出"骨架壳"，所有真实字段等数据齐了再渲染。 */
export function INLINE_PROFIT_PANEL_HTML(sku: string, _obj: any, opts?: PanelHtmlOpts): string {
  opts = opts || {}
  const defaultVisible = opts.defaultVisible !== false
  const page = opts.page || 'detail'
  const priceRubForCommission = Number(opts.priceRubForCommission) || 0
  const displayStyle = defaultVisible ? '' : 'display:none;'
  return (
    '<div class="bcs-ipc-root" data-sku="' +
    escAttr(sku) +
    '" data-page="' +
    escAttr(page) +
    '" data-default-visible="' +
    (defaultVisible ? '1' : '0') +
    '" data-price-rub-for-commission="' +
    (priceRubForCommission || 0) +
    '" data-phase="loading" style="' +
    displayStyle +
    '">' +
    '<div class="bcs-ipc-skeleton">' +
    '<div class="bcs-ipc-spinner" aria-hidden="true"></div>' +
    '<div class="bcs-ipc-loading-text">利润计算中…</div>' +
    '</div>' +
    '</div>'
  )
}

function buildPanelContent(state: IPCState): string {
  const econ = computePanelEconomics(state)
  const sale = econ.sale
  const purchase = econ.purchase
  const businessRate = econ.businessRate
  const commissionRate = econ.commissionRate
  const domestic = econ.domestic
  const freight = econ.freight
  const businessCost = econ.businessCost
  const commissionCost = econ.commissionCost
  const profit = econ.profit
  const rate = econ.rate
  const priceDisplay = resolveDisplayPriceForMall(state)
  const negCls = profit < 0 ? ' bcs-ipc-profit-value--neg' : ''
  const rateNegCls = rate < 0 ? ' bcs-ipc-tag-rate--neg' : ''
  const chargeByTag = resolveChargeByTag(state.chargeBy)
  const saleLabel = getSalePriceLabel()
  const profitRateLabel = getProfitRateLabel()
  const freightOverLimit = isFreightOverWeightLimit(state)

  return (
    '<div class="bcs-ipc-top">' +
    '<div class="bcs-ipc-summary">' +
    '<div class="bcs-ipc-profit-area">' +
    '<div class="bcs-ipc-sub-title">预计利润空间</div>' +
    '<div class="bcs-ipc-profit-value' +
    negCls +
    '" data-display="profit"><span class="bcs-ipc-currency">¥</span><span data-display="profitAmount">' +
    profit.toFixed(2) +
    '</span></div>' +
    '<div class="bcs-ipc-tags">' +
    '<div class="bcs-ipc-tag-rate' +
    rateNegCls +
    '" data-display="profitRateTag"><span data-display="profitRateLabel">' +
    profitRateLabel +
    '</span> <span data-display="profitRate">' +
    rate.toFixed(2) +
    '%</span></div>' +
    '<span class="' +
    chargeByTag.cls +
    '" data-display="chargeByTag" data-role="placeholder-btn">' +
    chargeByTag.text +
    '</span>' +
    '</div>' +
    '</div>' +
    '<div class="bcs-ipc-top-actions">' +
    '<button class="bcs-ipc-action-btn bcs-ipc-action-primary" data-role="ipc-one-click-upload" type="button">一键上架</button>' +
    '<button class="bcs-ipc-action-btn bcs-ipc-action-plain" data-role="open-calc-config" type="button">配置计算器</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="bcs-ipc-form">' +
    '<div class="bcs-ipc-row bcs-ipc-row--rub-tip">' +
    '<div class="bcs-ipc-rub-tip"><span data-display="priceRubTipLabel">' +
    getPriceRubTipLabel() +
    '</span> <strong data-display="priceRub">' +
    priceDisplay.value.toFixed(2) +
    priceDisplay.unit +
    '</strong></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label" data-display="salePriceLabel">' +
    saleLabel +
    '</div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="salePriceCny" ' +
    buildProfitCalcInputAttrs('salePriceCny') +
    ' value="' +
    (sale ? sale.toFixed(2) : '') +
    '" placeholder="请输入" /><span class="bcs-ipc-unit">¥</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">采购成本</div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="purchaseCost" ' +
    buildProfitCalcInputAttrs('purchaseCost') +
    ' value="' +
    (purchase ? purchase.toFixed(2) : '') +
    '" placeholder="请输入" /><span class="bcs-ipc-unit">¥</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">经营成本占比<span class="bcs-ipc-cost-text" data-display="businessCostText">（' +
    businessCost.toFixed(2) +
    '¥）</span></div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="businessRate" ' +
    buildProfitCalcInputAttrs('businessRate') +
    ' value="' +
    businessRate +
    '" /><span class="bcs-ipc-unit">%</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">类目佣金<span class="bcs-ipc-cost-text" data-display="commissionCostText">（' +
    commissionCost.toFixed(2) +
    '¥）</span></div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="commissionRate" ' +
    buildProfitCalcInputAttrs('commissionRate') +
    ' value="' +
    commissionRate.toFixed(2) +
    '" /><span class="bcs-ipc-unit">%</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">国内运费+贴单费<span class="bcs-ipc-cost-text" data-display="domesticCostText">（' +
    domestic.toFixed(2) +
    '¥）</span></div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="domesticCost" ' +
    buildProfitCalcInputAttrs('domesticCost') +
    ' value="' +
    domestic +
    '" /><span class="bcs-ipc-unit">¥</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">运费<span class="bcs-ipc-cost-text' +
    freightCostTextCls(freight, freightOverLimit) +
    '" data-display="freightCostText">（' +
    freight.toFixed(2) +
    '¥）</span></div>' +
    '<div class="bcs-ipc-input-box"><input class="bcs-ipc-input" data-field="weight" ' +
    buildProfitCalcInputAttrs('weight') +
    ' value="' +
    (state.weight || '') +
    '" placeholder="重量" /><span class="bcs-ipc-unit">g</span></div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">长宽高（cm）</div>' +
    '<div class="bcs-ipc-size-row">' +
    '<input class="bcs-ipc-size-input" data-field="length" ' +
    buildProfitCalcInputAttrs('length') +
    ' value="' +
    (state.length || '') +
    '" placeholder="长" />' +
    '<span class="bcs-ipc-mul">×</span>' +
    '<input class="bcs-ipc-size-input" data-field="width" ' +
    buildProfitCalcInputAttrs('width') +
    ' value="' +
    (state.width || '') +
    '" placeholder="宽" />' +
    '<span class="bcs-ipc-mul">×</span>' +
    '<input class="bcs-ipc-size-input" data-field="height" ' +
    buildProfitCalcInputAttrs('height') +
    ' value="' +
    (state.height || '') +
    '" placeholder="高" />' +
    '</div>' +
    '</div>' +
    '<div class="bcs-ipc-row">' +
    '<div class="bcs-ipc-label">跨境物流商</div>' +
    '<select class="bcs-ipc-carrier-select" data-field="carrierBrand">' +
    buildCarrierOptions(state.carrierBrand) +
    '</select>' +
    '</div>' +
    '</div>'
  )
}

// ---------- 状态 ----------

function getOrCreateState(sku: string, root: HTMLElement | null): IPCState {
  const existing = stateMap.get(sku)
  if (existing) {
    applyProfitCalcDefaultsFromCache(existing)
    return existing
  }
  const page = (root && (root.getAttribute('data-page') as 'detail' | 'list')) || 'detail'
  const priceRubForCommission = root
    ? Number(root.getAttribute('data-price-rub-for-commission')) || 0
    : 0
  const cfg = getCachedProfitCalcConfig()
  const initialBusinessRate = computeBusinessRateFromConfig(cfg)
  const initialDomestic = pickDefaultDomesticFromConfig(cfg)
  const initialCarrier = pickDefaultCarrierFromConfig(cfg)
  const localPrefs = getCalcLocalPrefs()
  const state: IPCState = {
    sku,
    page,
    priceRubForCommission,
    panelExpanded: page !== 'list' && localPrefs.detailExpandDefault,
    priceExpandPending: false,
    phase: 'loading',
    hasCardData: false,
    hasRealPrice: false,
    hasPackaging: false,
    quoteAttempted: false,
    salePriceCny: 0,
    actualSalePriceCny: 0,
    greenPriceRaw: 0,
    blackPriceRaw: 0,
    realPriceValue: 0,
    realPriceUnit: '',
    realPriceFromGreenBlack: false,
    commissionRate: 0,
    commissionRateEdited: false,
    commissionTreePath: null,
    commissionFallbackTriple: null,
    cardCategories: null,
    purchaseCost: 0,
    businessRate: initialBusinessRate,
    businessRateEdited: false,
    domesticCost: initialDomestic,
    domesticEdited: false,
    carrierBrand: initialCarrier,
    carrierEdited: false,
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    freightCny: 0,
    chargeBy: null,
    quoteServiceType: null,
    apiDebounceTimer: 0,
    quoteRequestSeq: 0,
    fallbackTimer: 0,
  }
  stateMap.set(sku, state)
  state.fallbackTimer = window.setTimeout(() => {
    const r = document.querySelector<HTMLElement>(
      '.bcs-ipc-root[data-sku="' + cssEscapeSku(sku) + '"]',
    )
    if (r) forceReadyOnTimeout(state, r)
  }, READY_FALLBACK_MS)
  return state
}

function coreSignalsReady(state: IPCState): boolean {
  if (state.page === 'detail') {
    return state.hasCardData && state.hasRealPrice && state.hasPackaging
  }
  return state.hasCardData && state.hasPackaging
}

function checkAndFetchQuote(state: IPCState, root: HTMLElement | null): void {
  if (state.phase === 'ready' || state.quoteAttempted) return
  if (!coreSignalsReady(state)) return
  if (!listPanelMayTransition(state)) return
  state.quoteAttempted = true
  _fetchTodayExchangeRate().finally(() => {
    fetchQuoteAndTransition(state, root)
  })
}

function transitionToReady(state: IPCState, root: HTMLElement | null): void {
  if (state.phase === 'ready') return
  if (!listPanelMayTransition(state)) return
  if (state.fallbackTimer) {
    clearTimeout(state.fallbackTimer)
    state.fallbackTimer = 0
  }
  renderReadyPanel(state, root)
}

function forceReadyOnTimeout(state: IPCState, root: HTMLElement | null): void {
  if (state.phase === 'ready') return
  if (!listPanelMayTransition(state)) return
  if (!state.quoteAttempted && canFetchQuote(state)) {
    state.quoteAttempted = true
    _fetchTodayExchangeRate().finally(() => {
      fetchQuoteAndTransition(state, root)
    })
    return
  }
  transitionToReady(state, root)
}

function canFetchQuote(state: IPCState): boolean {
  return (
    state.salePriceCny > 0 &&
    state.weight > 0 &&
    state.length > 0 &&
    state.width > 0 &&
    state.height > 0
  )
}

function fetchQuoteAndTransition(state: IPCState, root: HTMLElement | null): void {
  if (!canFetchQuote(state)) {
    state.freightCny = 0
    transitionToReady(state, root)
    return
  }
  if (shouldSkipFreightQuote(state)) {
    state.freightCny = 0
    state.chargeBy = null
    state.quoteServiceType = null
    transitionToReady(state, root)
    return
  }
  const seq = ++state.quoteRequestSeq
  const payload = {
    carrierBrand: state.carrierBrand || DEFAULT_CARRIER_BRAND,
    goodsValueCny: state.salePriceCny,
    cnyPerRub: getCnyPerRub(),
    packageWeightG: state.weight,
    lengthCm: state.length,
    widthCm: state.width,
    heightCm: state.height,
  }
  fetchLogisticsQuote(payload)
    .then((res) => {
      if (seq !== state.quoteRequestSeq) return
      applyQuoteResponse(state, res)
      transitionToReady(state, root)
    })
    .catch(() => {
      if (seq !== state.quoteRequestSeq) return
      transitionToReady(state, root)
    })
}

function applyQuoteResponse(state: IPCState, res: any): void {
  if (!res || res.code !== 200 || !res.data) return
  const plans = Array.isArray(res.data.plans) ? res.data.plans : []
  const preferredType = pickPreferredServiceType(plans)
  const pick = pickQuotePlan(plans, preferredType)
  if (pick) {
    const price = pick.pickupPrice != null ? Number(pick.pickupPrice) : Number(pick.doorPrice)
    state.freightCny = isFinite(price) ? price : 0
    state.chargeBy = pick.chargeBy || null
    state.quoteServiceType = pick.serviceType || null
  } else {
    state.freightCny = 0
    state.chargeBy = null
    state.quoteServiceType = null
  }
  if (isFreightOverWeightLimit(state)) {
    state.freightCny = 0
  }
}

function recalcReadyPanel(state: IPCState, root: HTMLElement | null): void {
  if (!root || state.phase !== 'ready') return
  const econ = computePanelEconomics(state)
  const sale = econ.sale
  const profit = econ.profit
  const rate = econ.rate
  const businessCost = econ.businessCost
  const commissionCost = econ.commissionCost
  const domestic = econ.domestic
  const freight = econ.freight
  const freightOverLimit = isFreightOverWeightLimit(state)
  const priceDisplay = resolveDisplayPriceForMall(state)
  const get = (sel: string) => root.querySelector(sel)
  const setText = (sel: string, txt: string) => {
    const el = get(sel)
    if (el) el.textContent = txt
  }
  setText('[data-display="profitAmount"]', profit.toFixed(2))
  setText('[data-display="profitRateLabel"]', getProfitRateLabel())
  setText('[data-display="profitRate"]', rate.toFixed(2) + '%')
  setText('[data-display="priceRubTipLabel"]', getPriceRubTipLabel())
  setText('[data-display="priceRub"]', priceDisplay.value.toFixed(2) + priceDisplay.unit)
  setText('[data-display="salePriceLabel"]', getSalePriceLabel())
  const saleInput = get('[data-field="salePriceCny"]') as HTMLInputElement | null
  if (saleInput && document.activeElement !== saleInput) {
    saleInput.value = sale > 0 ? sale.toFixed(2) : ''
  }
  setText('[data-display="businessCostText"]', '（' + businessCost.toFixed(2) + '¥）')
  setText('[data-display="commissionCostText"]', '（' + commissionCost.toFixed(2) + '¥）')
  setText('[data-display="domesticCostText"]', '（' + domestic.toFixed(2) + '¥）')
  setText('[data-display="freightCostText"]', '（' + freight.toFixed(2) + '¥）')
  const freightCostNode = get('[data-display="freightCostText"]')
  if (freightCostNode)
    freightCostNode.classList.toggle('bcs-ipc-cost-text--zero', freightOverLimit || !(freight > 0))
  const profitNode = get('[data-display="profit"]')
  if (profitNode) profitNode.classList.toggle('bcs-ipc-profit-value--neg', profit < 0)
  const rateTag = get('[data-display="profitRateTag"]')
  if (rateTag) rateTag.classList.toggle('bcs-ipc-tag-rate--neg', rate < 0)
  const chargeByNode = get('[data-display="chargeByTag"]')
  if (chargeByNode) {
    const tag = resolveChargeByTag(state.chargeBy)
    chargeByNode.className = tag.cls
    chargeByNode.textContent = tag.text
  }
}

function scheduleQuoteRefetch(state: IPCState, root: HTMLElement | null): void {
  if (state.phase !== 'ready') return
  if (state.apiDebounceTimer) clearTimeout(state.apiDebounceTimer)
  state.apiDebounceTimer = window.setTimeout(() => {
    refetchQuote(state, root)
  }, API_DEBOUNCE_MS)
}

function refetchQuote(state: IPCState, root: HTMLElement | null): void {
  if (!canFetchQuote(state)) {
    state.freightCny = 0
    recalcReadyPanel(state, root)
    return
  }
  if (shouldSkipFreightQuote(state)) {
    state.freightCny = 0
    recalcReadyPanel(state, root)
    return
  }
  const seq = ++state.quoteRequestSeq
  const payload = {
    carrierBrand: state.carrierBrand || DEFAULT_CARRIER_BRAND,
    goodsValueCny: state.salePriceCny,
    cnyPerRub: getCnyPerRub(),
    packageWeightG: state.weight,
    lengthCm: state.length,
    widthCm: state.width,
    heightCm: state.height,
  }
  fetchLogisticsQuote(payload).then((res) => {
    if (seq !== state.quoteRequestSeq) return
    applyQuoteResponse(state, res)
    recalcReadyPanel(state, root)
  })
}

// ---------- 列表面板展开（外部模块需要调用方提供 awaitListSkuDetailPrice / fallbackListSkuRealPriceFromDom） ----------

export interface ListPanelExpandCallbacks {
  awaitListSkuDetailPrice?: (sku: string) => Promise<unknown>
  fallbackListSkuRealPriceFromDom?: (sku: string, host: HTMLElement | null) => void
}

let _listExpandCallbacks: ListPanelExpandCallbacks = {}

export function setListPanelExpandCallbacks(cbs: ListPanelExpandCallbacks): void {
  _listExpandCallbacks = cbs || {}
}

/** 利润面板展开后补拉 shops（避免与 loadCardExtraData 静态循环依赖） */
function triggerLazyCardShopsLoad(card: HTMLElement | null, sku: string): void {
  if (!card || !sku) return
  void import('../ozonList/loadCardExtraData').then(({ lazyLoadCardShopsIfNeeded }) => {
    lazyLoadCardShopsIfNeeded(card, sku)
  })
}

function handleListPanelExpand(
  state: IPCState,
  root: HTMLElement | null,
  sku: string,
  priceHost: HTMLElement | null,
): void {
  if (!state || !root || state.page !== 'list') return
  state.panelExpanded = true

  if (state.phase === 'ready' && state.hasRealPrice && state.salePriceCny > 0) {
    return
  }

  if (state.hasRealPrice && coreSignalsReady(state)) {
    state.quoteAttempted = false
    checkAndFetchQuote(state, root)
    if (state.phase === 'loading') {
      renderLoadingSkeleton(root, '利润计算中…')
    }
    return
  }

  if (state.hasRealPrice && !coreSignalsReady(state)) {
    renderLoadingSkeleton(root, '利润计算中…')
    state.phase = 'loading'
    return
  }

  const loadingMsg = '正在获取实际售价…'
  renderLoadingSkeleton(root, loadingMsg)
  state.phase = 'loading'
  if (state.priceExpandPending) return
  state.priceExpandPending = true

  const pricePromise = _listExpandCallbacks.awaitListSkuDetailPrice
    ? _listExpandCallbacks.awaitListSkuDetailPrice(sku)
    : Promise.resolve(null)

  Promise.resolve(pricePromise)
    .then(() => waitForListRealPrice(state, 15))
    .then(() => {
      state.priceExpandPending = false
      if (!state.panelExpanded) return
      if (!state.hasRealPrice && _listExpandCallbacks.fallbackListSkuRealPriceFromDom) {
        _listExpandCallbacks.fallbackListSkuRealPriceFromDom(sku, priceHost)
      }
      return waitForListRealPrice(state, 5)
    })
    .then(() => {
      if (!state.panelExpanded) return
      if (state.hasRealPrice && coreSignalsReady(state)) {
        state.quoteAttempted = false
        checkAndFetchQuote(state, root)
      } else if (state.hasRealPrice) {
        renderLoadingSkeleton(root, '利润计算中…')
      } else {
        renderLoadingSkeleton(root, '暂无价格数据')
      }
    })
    .catch(() => {
      state.priceExpandPending = false
      if (!state.panelExpanded) return
      if (!state.hasRealPrice && _listExpandCallbacks.fallbackListSkuRealPriceFromDom) {
        _listExpandCallbacks.fallbackListSkuRealPriceFromDom(sku, priceHost)
      }
      waitForListRealPrice(state, 5).then(() => {
        if (!state.panelExpanded) return
        if (state.hasRealPrice && coreSignalsReady(state)) {
          state.quoteAttempted = false
          checkAndFetchQuote(state, root)
        } else if (state.panelExpanded && !state.hasRealPrice) {
          renderLoadingSkeleton(root, '暂无价格数据')
        }
      })
    })
}

// ---------- 事件 ----------

function syncListIpcExpandedBodyClass(): void {
  let anyVisible = false
  document.querySelectorAll<HTMLElement>('.bcs-ipc-root[data-page="list"]').forEach((root) => {
    if (root.style.display !== 'none') anyVisible = true
  })
  document.body.classList.toggle('bcs-list-ipc-expanded', anyVisible)
}

export interface InlineProfitActionCallbacks {
  /** 一键上架按钮点击：sku + 「实际售价」人民币价格（已是字符串 .toFixed(2)，对齐旧版 ipc-one-click-upload） */
  onOneClickUpload?: (sku: string, priceCny: string) => void
  /** 配置计算器按钮点击 */
  onOpenCalcConfig?: () => void
}

let _actionCallbacks: InlineProfitActionCallbacks = {}

export function setInlineProfitActionCallbacks(cbs: InlineProfitActionCallbacks): void {
  _actionCallbacks = cbs || {}
}

function applyPanelFieldValue(state: IPCState, root: HTMLElement, field: string, value: number): void {
  ;(state as any)[field] = value
  if (field === 'businessRate') state.businessRateEdited = true
  if (field === 'domesticCost') state.domesticEdited = true
  if (field === 'commissionRate') state.commissionRateEdited = true
  if (field === 'salePriceCny') {
    state.realPriceFromGreenBlack = false
    const cnyPerRubRate = getCnyPerRub()
    state.priceRubForCommission =
      state.salePriceCny > 0 && cnyPerRubRate > 0 ? state.salePriceCny * cnyPerRubRate : 0
    if (applyCommissionRateFromState(state)) {
      const commInput = root.querySelector<HTMLInputElement>('[data-field="commissionRate"]')
      if (commInput && document.activeElement !== commInput) {
        commInput.value = state.commissionRate > 0 ? Number(state.commissionRate).toFixed(2) : ''
      }
    }
  }
  recalcReadyPanel(state, root)
  if (['salePriceCny', 'weight', 'length', 'width', 'height'].indexOf(field) !== -1) {
    scheduleQuoteRefetch(state, root)
  }
}

function syncPanelFieldInput(
  inputEl: HTMLInputElement,
  field: string,
  state: IPCState,
  root: HTMLElement,
  finalize: boolean,
): void {
  const cfg = getProfitCalcFieldInputConfig(field)
  const sanitized = sanitizeProfitCalcInputText(inputEl.value, cfg.maxDecimals)
  const value = parseProfitCalcInputValue(sanitized, cfg)
  const display = resolveProfitCalcInputDisplay(sanitized, value, cfg, finalize)
  if (display !== inputEl.value) {
    const selStart = inputEl.selectionStart ?? inputEl.value.length
    inputEl.value = display
    if (document.activeElement === inputEl) {
      const caret = Math.max(0, Math.min(display.length, selStart))
      inputEl.setSelectionRange(caret, caret)
    }
  }
  applyPanelFieldValue(state, root, field, value)
}

function getPanelFieldInputTarget(e: Event): {
  inputEl: HTMLInputElement
  field: string
  state: IPCState
  root: HTMLElement
} | null {
  const target = e.target as HTMLElement | null
  if (!target?.matches('.bcs-ipc-input, .bcs-ipc-size-input')) return null
  const root = target.closest<HTMLElement>('.bcs-ipc-root')
  if (!root || root.getAttribute('data-phase') !== 'ready') return null
  const sku = root.getAttribute('data-sku') || ''
  const state = stateMap.get(sku)
  if (!state) return null
  const field = target.getAttribute('data-field')
  if (!field) return null
  return { inputEl: target as HTMLInputElement, field, state, root }
}

function onPanelBeforeInput(e: Event): void {
  const ie = e as InputEvent
  const ctx = getPanelFieldInputTarget(ie)
  if (!ctx) return
  if (ie.inputType !== 'insertText' && ie.inputType !== 'insertFromPaste') return
  const data = ie.data
  if (!data) return
  if (/[-+eE]/.test(data)) {
    ie.preventDefault()
    return
  }
  const cfg = getProfitCalcFieldInputConfig(ctx.field)
  const start = ctx.inputEl.selectionStart ?? ctx.inputEl.value.length
  const end = ctx.inputEl.selectionEnd ?? ctx.inputEl.value.length
  const next = ctx.inputEl.value.slice(0, start) + data + ctx.inputEl.value.slice(end)
  const sanitized = sanitizeProfitCalcInputText(next, cfg.maxDecimals)
  if (sanitized !== next) {
    ie.preventDefault()
    ctx.inputEl.value = sanitized
    const pos = sanitized.length
    ctx.inputEl.setSelectionRange(pos, pos)
    syncPanelFieldInput(ctx.inputEl, ctx.field, ctx.state, ctx.root, false)
  }
}

function onPanelKeydown(e: KeyboardEvent): void {
  const ctx = getPanelFieldInputTarget(e)
  if (!ctx) return
  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
    e.preventDefault()
  }
}

function onPanelInput(e: Event): void {
  const ctx = getPanelFieldInputTarget(e)
  if (!ctx) return
  syncPanelFieldInput(ctx.inputEl, ctx.field, ctx.state, ctx.root, false)
}

function onPanelBlur(e: Event): void {
  const ctx = getPanelFieldInputTarget(e)
  if (!ctx) return
  syncPanelFieldInput(ctx.inputEl, ctx.field, ctx.state, ctx.root, true)
}

function onCarrierChange(e: Event): void {
  const target = e.target as HTMLSelectElement | null
  if (!target || !target.matches('.bcs-ipc-carrier-select')) return
  const root = target.closest<HTMLElement>('.bcs-ipc-root')
  if (!root || root.getAttribute('data-phase') !== 'ready') return
  const sku = root.getAttribute('data-sku') || ''
  const state = stateMap.get(sku)
  if (!state) return
  state.carrierBrand = String(target.value || '') || DEFAULT_CARRIER_BRAND
  state.carrierEdited = true
  state.quoteServiceType = null
  scheduleQuoteRefetch(state, root)
}

function onBodyClick(e: Event): void {
  const target = e.target as HTMLElement | null
  if (!target) return

  // placeholder 标签
  const placeholder = target.closest('.bcs-ipc-root [data-role="placeholder-btn"]')
  if (placeholder) {
    e.preventDefault()
    return
  }

  // 一键上架：读取「实际售价」输入框的人民币价格 → 编辑上架并覆盖 rows[].price
  const oneClick = target.closest<HTMLElement>('.bcs-ipc-root [data-role="ipc-one-click-upload"]')
  if (oneClick) {
    e.preventDefault()
    e.stopPropagation()
    const root = oneClick.closest<HTMLElement>('.bcs-ipc-root')
    if (!root) return
    const sku = String(root.getAttribute('data-sku') || '').trim()
    if (!sku) {
      alert('Auto Ozon 提示：未识别到 SKU')
      return
    }
    const saleInput = root.querySelector<HTMLInputElement>('[data-field="salePriceCny"]')
    const salePriceCny = Number(saleInput?.value || 0) || 0
    if (!(salePriceCny > 0)) {
      alert('Auto Ozon 提示：请先填写实际售价')
      return
    }
    if (_actionCallbacks.onOneClickUpload) {
      _actionCallbacks.onOneClickUpload(sku, salePriceCny.toFixed(2))
    } else {
      alert('Auto Ozon 提示：编辑上架功能不可用')
    }
    return
  }

  // 配置计算器
  const openConfig = target.closest('.bcs-ipc-root [data-role="open-calc-config"]')
  if (openConfig) {
    e.preventDefault()
    if (_actionCallbacks.onOpenCalcConfig) {
      _actionCallbacks.onOpenCalcConfig()
    }
    return
  }

  // 列表卡片宽度过窄禁用拦截
  const disabledWrap = target.closest('.bcs-card-profit-btn-wrap--disabled')
  if (disabledWrap) {
    e.preventDefault()
    e.stopPropagation()
    return
  }

  // 卡片头部「计算利润」图标：切换内嵌面板显示/隐藏
  const profitBtn = target.closest<HTMLElement>('.bcs-card-profit-btn')
  if (profitBtn) {
    if (profitBtn.classList.contains('bcs-card-profit-btn--narrow-disabled')) return
    const sku = profitBtn.getAttribute('data-sku') || ''
    const card = profitBtn.closest<HTMLElement>('.e1fbcs, #e1fbcs')
    if (!card) return
    let panel =
      card.querySelector<HTMLElement>(`.bcs-ipc-root[data-sku="${cssEscapeSku(sku)}"]`) ||
      card.querySelector<HTMLElement>('.bcs-ipc-root')
    if (!panel) return
    const visible = panel.style.display !== 'none'
    if (visible) {
      panel.style.display = 'none'
      profitBtn.classList.remove('bcs-card-profit-btn--active')
      const hideState = stateMap.get(sku)
      if (hideState && hideState.page === 'list') hideState.panelExpanded = false
      syncListIpcExpandedBodyClass()
      return
    }
    panel.style.display = ''
    profitBtn.classList.add('bcs-card-profit-btn--active')
    const state = stateMap.get(sku) || getOrCreateState(sku, panel)
    // 列表/详情展开利润面板时统一在此补拉 shops，避免与 handleListPanelExpand 重复触发
    triggerLazyCardShopsLoad(card, sku)
    if (state.page === 'list') {
      const priceHost = card.parentElement
      handleListPanelExpand(state, panel, sku, priceHost)
    }
    syncListIpcExpandedBodyClass()
    return
  }
}

function bindEvents(): void {
  document.body.addEventListener('beforeinput', onPanelBeforeInput, true)
  document.body.addEventListener('keydown', onPanelKeydown, true)
  document.body.addEventListener('input', onPanelInput, true)
  document.body.addEventListener('change', onPanelInput, true)
  document.body.addEventListener('blur', onPanelBlur, true)
  document.body.addEventListener('change', onCarrierChange, true)
  document.body.addEventListener('click', onBodyClick, true)
}

// ---------- 初始化 / Observer ----------

function initRoot(root: HTMLElement): void {
  if (!(root instanceof HTMLElement)) return
  const sku = root.getAttribute('data-sku') || ''
  if (!sku) return
  const firstInit = root.dataset.bcsIpcInited !== '1'
  root.dataset.bcsIpcInited = '1'
  const state = getOrCreateState(sku, root)
  ensureProfitCalcConfigForRoot(state, root)
  reattachPanelToDom(state, root)
  if (!firstInit) return
  const defaultVisible = root.getAttribute('data-default-visible') === '1'
  const card = root.closest<HTMLElement>('.e1fbcs')
  const btn = card?.querySelector<HTMLElement>(
    '.bcs-card-profit-btn[data-sku="' + cssEscapeSku(sku) + '"]',
  )
  if (btn) btn.classList.toggle('bcs-card-profit-btn--active', defaultVisible)
}

function setupObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      for (let j = 0; j < m.addedNodes.length; j++) {
        const node = m.addedNodes[j]
        if (!(node instanceof HTMLElement)) continue
        if (node.matches && node.matches('.bcs-ipc-root')) {
          initRoot(node)
        } else if (node.querySelectorAll) {
          const roots = node.querySelectorAll<HTMLElement>('.bcs-ipc-root')
          for (let k = 0; k < roots.length; k++) initRoot(roots[k])
        }
      }
    }
  })
  observer.observe((document.body || document.documentElement) as Node, {
    childList: true,
    subtree: true,
  })
  document.querySelectorAll<HTMLElement>('.bcs-ipc-root').forEach(initRoot)
}

/** 需要强制刷新时：清缓存并重拉 CBR，成功后重算所有已展示面板 */
export function refreshInlineProfitExchangeRate(retries?: number): void {
  _todayExchangeRate = null
  loadTodayExchangeRateWithRetry(retries != null ? retries : 3)
}

/** 全局一次性 init */
export function initInlineProfitCalc(): void {
  if (_initialized) return
  _initialized = true
  bindEvents()
  setupObserver()
  setupListProfitCardObserver()
  ;(window as any).bcsRefreshInlineProfitExchangeRate = refreshInlineProfitExchangeRate

  loadProfitCalcConfigWithRetry(3)
  loadTodayExchangeRateWithRetry(3)
  loadCarrierDictWithRetry(3)
  loadCommissionTreeWithLocalRetry(3)

  onProfitCalcConfigChange((cfg) => {
    applyGlobalProfitCalcConfig(cfg, false)
    // 配置（含 realPriceCoeff / detailExpandDefault）到位后：重算真实价/售价、校正详情展开态、
    // 刷新真实价浮窗。冷加载时贴卡可能早于配置返回、先按默认系数计算，这里据后端值纠正一次。
    applyCalcLocalPrefs()
  })
}

/** 保存计算器偏好后由调用方触发：覆盖卡片内临时改动并全局同步 */
export function applyInlineProfitCalcConfig(cfg: ProfitCalcConfig | null): void {
  applyGlobalProfitCalcConfig(cfg, true)
}

/**
 * 按当前偏好把详情页内嵌面板设为展开/收起（面板显隐 + 按钮高亮 + 状态位）。
 * 详情页冷加载时贴卡可能早于配置接口返回、先按默认值渲染，故配置到位后需据后端
 * detailExpandDefault 校正一次；保存偏好时同样复用本函数。
 */
export function applyDetailPanelExpandFromPrefs(prefs?: CalcLocalPrefs): void {
  const expand = (prefs || getCalcLocalPrefs()).detailExpandDefault
  const detailRoots = document.querySelectorAll<HTMLElement>('.bcs-ipc-root[data-page="detail"]')
  for (let i = 0; i < detailRoots.length; i++) {
    const detailRoot = detailRoots[i]
    const detailSku = detailRoot.getAttribute('data-sku') || ''
    detailRoot.style.display = expand ? '' : 'none'
    detailRoot.setAttribute('data-default-visible', expand ? '1' : '0')
    const detailState = stateMap.get(detailSku)
    if (detailState) detailState.panelExpanded = expand
    const cardEl = detailRoot.closest<HTMLElement>('.e1fbcs')
    if (cardEl) {
      let profitBtn = cardEl.querySelector<HTMLElement>(
        '.bcs-card-profit-btn[data-sku="' + cssEscapeSku(detailSku) + '"]',
      )
      if (!profitBtn && detailSku) {
        profitBtn = cardEl.querySelector<HTMLElement>('.bcs-card-profit-btn')
      }
      if (profitBtn) profitBtn.classList.toggle('bcs-card-profit-btn--active', expand)
      if (expand && detailSku) triggerLazyCardShopsLoad(cardEl, detailSku)
    }
  }
}

/** 本地计算器偏好（详情展开、售价展示、公式系数）确认应用后刷新卡片 */
export function applyCalcLocalPrefs(): void {
  const prefs = getCalcLocalPrefs()
  stateMap.forEach((state, sku) => {
    const root = findRoot(sku)
    if (!root) return

    let salePriceChanged = false
    const hasRaw = Number(state.greenPriceRaw) > 0 || Number(state.blackPriceRaw) > 0
    if (hasRaw) {
      try {
        const green = Number(state.greenPriceRaw) || 0
        const black = Number(state.blackPriceRaw) || 0
        const newReal = calculateOzonRealPrice(green, black, { coeff: prefs.realPriceCoeff })
        if (newReal > 0) {
          if (newReal !== state.realPriceValue) salePriceChanged = true
          state.realPriceValue = newReal
          state.realPriceFromGreenBlack = true
          applyRealPriceToState(state)
          applyCommissionRateFromState(state)
        }
      } catch {
        /* ignore */
      }
    }
    // 展示模式切换时同步人民币售价（绿标/黑标路径系数未变也需刷新）
    if (Number(state.actualSalePriceCny) > 0) {
      const prevSale = state.salePriceCny
      applySalePriceDisplayFromPrefs(state, prefs)
      if (state.salePriceCny !== prevSale) {
        salePriceChanged = true
        if (!hasRaw) applyCommissionRateFromState(state)
      }
    }

    if (state.phase === 'ready') {
      if (salePriceChanged) {
        renderReadyPanel(state, root)
        scheduleQuoteRefetch(state, root)
      } else {
        recalcReadyPanel(state, root)
      }
    }
  })

  applyDetailPanelExpandFromPrefs(prefs)
  // 详情页「反推真实价格」浮窗随系数刷新（浮窗值由 realPriceCoeff 决定；非详情页为 no-op）
  insertOzonRealPriceBox()
}

// ---------- 对外：数据 / 售价 / 打包尺寸 同步钩子 ----------

function findRoot(sku: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.bcs-ipc-root[data-sku="' + cssEscapeSku(sku) + '"]',
  )
}

function syncPriceRubFromRoot(state: IPCState, root: HTMLElement | null): void {
  if (!state || !root || Number(state.priceRubForCommission) > 0) return
  const pr = Number(root.getAttribute('data-price-rub-for-commission')) || 0
  if (pr > 0) state.priceRubForCommission = pr
}

function writePriceRubToRoot(state: IPCState, root: HTMLElement | null, pr: number): void {
  if (!state || !root || !(Number(pr) > 0)) return
  state.priceRubForCommission = Number(pr)
  root.setAttribute('data-price-rub-for-commission', String(state.priceRubForCommission))
}

/** SKU 卡片接口 /skuss/new 数据回来：先存兜底三档佣金 */
export function notifyInlineProfitDataLoaded(
  sku: string,
  obj: { commission?: IPCCommission } | null,
  priceRubForCommission?: number,
): void {
  if (!sku || !obj) return
  const root = findRoot(sku)
  if (!root) {
    setTimeout(() => notifyInlineProfitDataLoaded(sku, obj, priceRubForCommission), 200)
    return
  }
  const state = stateMap.get(sku) || getOrCreateState(sku, root)
  if (state.realPriceFromGreenBlack && Number(state.priceRubForCommission) > 0) {
    // 跳过
  } else {
    const pr = Number(priceRubForCommission) || Number(state.priceRubForCommission) || 0
    if (!(pr > 0)) syncPriceRubFromRoot(state, root)
    else writePriceRubToRoot(state, root, pr)
  }

  if (state.hasCardData) {
    if (!state.commissionRateEdited && applyCommissionRateFromState(state)) {
      refreshCommissionDom(state, root)
    }
    return
  }

  const c = (obj && obj.commission) || {}
  state.commissionFallbackTriple = [c.rfbs1500, c.rfbs1500To5000, c.rfbsGreater5000]
  applyCommissionRateFromState(state)

  state.hasCardData = true
  checkAndFetchQuote(state, root)
}

/** /system/sku/shops 返回的 categories 同步：作为 OSS 树匹配的输入 */
export function notifyInlineProfitCategories(
  sku: string,
  categories: CommissionCategoryItem[],
): void {
  if (!sku || !Array.isArray(categories) || !categories.length) return
  const root = findRoot(sku)
  if (!root) {
    setTimeout(() => notifyInlineProfitCategories(sku, categories), 200)
    return
  }
  const state = stateMap.get(sku) || getOrCreateState(sku, root)
  if (state.cardCategories && state.cardCategories.length) return
  state.cardCategories = categories
  syncPriceRubFromRoot(state, root)
  state.commissionTreePath = null
  const changed = applyCommissionRateFromState(state)
  if (changed) refreshCommissionDom(state, root)
}

/**
 * 详情页绿标/黑标反推真实价同步
 * @param rawPrices 绿/黑原价，用于公式系数变更后重算
 */
export function notifyInlineProfitRealPrice(
  sku: string,
  value: number,
  unit?: string,
  rawPrices?: { green?: number; black?: number },
): void {
  if (!sku || !(value > 0)) return
  const root = findRoot(sku)
  if (!root) {
    setTimeout(() => notifyInlineProfitRealPrice(sku, value, unit, rawPrices), 200)
    return
  }
  const state = stateMap.get(sku) || getOrCreateState(sku, root)
  if (state.hasRealPrice && state.page !== 'list') return

  state.realPriceValue = value
  state.realPriceUnit = String(unit == null ? '' : unit).trim()
  if (rawPrices) {
    if (Number(rawPrices.green) > 0) state.greenPriceRaw = Number(rawPrices.green)
    if (Number(rawPrices.black) > 0) state.blackPriceRaw = Number(rawPrices.black)
  }
  if (state.page === 'list') {
    state.quoteAttempted = false
  }

  function finishRealPriceSync(): void {
    applyRealPriceToState(state)
    state.hasRealPrice = true
    applyCommissionRateFromState(state)
    if (state.phase === 'ready') {
      recalcReadyPanel(state, root)
    } else if (state.page === 'list' && state.panelExpanded && !coreSignalsReady(state)) {
      renderLoadingSkeleton(root, '利润计算中…')
    }
    if (state.page === 'list') {
      state.quoteAttempted = false
    }
    checkAndFetchQuote(state, root)
  }

  // 美元页 CBR 无美元汇率，额外确保「汇率设置」(myRMB/myLB) 已加载后再换算
  const isUsdUnit =
    state.realPriceUnit === '$' || state.realPriceUnit === 'USD' || state.realPriceUnit === 'usd'
  const ratesReady = isUsdUnit
    ? Promise.all([_fetchTodayExchangeRate(), loadExchangeRates().catch(() => null)])
    : _fetchTodayExchangeRate()
  ratesReady.then(finishRealPriceSync).catch(finishRealPriceSync)
}

/** 兼容旧接口：value 视为 RUB */
export function notifyInlineProfitRealPriceRub(sku: string, realPriceRub: number): void {
  notifyInlineProfitRealPrice(sku, realPriceRub, '₽')
}

/** 打包尺寸+重量回来（mm/g） */
export function notifyInlineProfitPackagingFilled(
  sku: string,
  dims: { l_mm: any; w_mm: any; h_mm: any; weight_g: any },
): void {
  if (!sku || !dims) return
  const root = findRoot(sku)
  if (!root) {
    setTimeout(() => notifyInlineProfitPackagingFilled(sku, dims), 200)
    return
  }
  const state = stateMap.get(sku) || getOrCreateState(sku, root)
  if (state.hasPackaging) return
  const mmToCm = (mm: any) => {
    const n = parseFloat(mm)
    return isFinite(n) && n > 0 ? Math.round(n) / 10 : 0
  }
  state.length = mmToCm(dims.l_mm)
  state.width = mmToCm(dims.w_mm)
  state.height = mmToCm(dims.h_mm)
  const weightG = parseFloat(dims.weight_g)
  if (isFinite(weightG) && weightG > 0) state.weight = weightG
  state.hasPackaging = true
  checkAndFetchQuote(state, root)
}

import { reactive } from 'vue'
import { showToast } from '../../../utils/toast'
import { isOzonListLikePage, resolveOzonPageType } from '../ozonList/ozonPageContext'
import {
  AUTO_CRAWL_CATEGORIES,
  buildDefaultAutoCrawlConfig,
  fetchAutoCrawlPreference,
  getLocalCrawlScrollMode,
  getLocalCrawlStartMode,
  normalizeAutoCrawlConfig,
  saveAutoCrawlPreference,
  saveLocalCrawlScrollMode,
  saveLocalCrawlStartMode,
  type AutoCrawlConfig,
  type CrawlScrollMode,
  type CrawlStartMode,
} from '../ozonBatchCrawl/autoCrawlFields'
import {
  applyCardFieldVisibilityAll,
  markCardFieldPreferenceLoaded,
  resetCardFieldPreferenceState,
  setCardFieldConfig,
} from './cardFieldStore'
import { refreshCardsDataByFieldConfig } from './cardDataRefresh'
import {
  cardFieldLabel,
  LIST_PAGE_HIDDEN_FIELD_KEYS,
  type CardFieldConfigItem,
} from './cardFields'
import { applyMpChartVisibleFromApi } from '../ozonMpChart/mpChartPreference'
import { refreshMpChartByConfig } from '../ozonMpChart/mpChartService'
import {
  fetchCardPreference,
  resetCardFieldOrder,
  saveCardPreference,
} from './cardPreferenceApi'
import {
  fetchSelectionRules,
  saveSelectionRules,
  SELECTION_MAX_RULES,
  type SelectionRuleItem,
} from './selectionRulesApi'
import { activateSelectionRules } from '../ozonSelectionRules/sync'
import { openRuleEditor } from '../ozonSelectionRules/ruleEditorController'
import { formatSelectionRuleTime } from '../ozonSelectionRules/filters'
import {
  fetchProfitCalcConfig,
  fetchDictByType,
  saveProfitCalcConfig,
  setCachedProfitCalcConfig,
  DICT_CARRIER,
  DICT_CATEGORY,
  DICT_SERVICE_TYPE,
  type DictItem,
  type ProfitCalcCategoryPref,
} from '../ozonProfitCalc/profitCalcApi'
import {
  applyCalcLocalPrefs,
  applyInlineProfitCalcConfig,
  setInlineProfitCarrierOptions,
} from '../ozonProfitCalc/inlineProfitCalc'
import {
  getCalcLocalPrefs,
  getDefaultCalcLocalPrefs,
  type CalcLocalPrefs,
} from '../ozonProfitCalc/calcLocalPrefs'
import {
  inspectShopCookieAvailability,
} from '../ozonBatchCrawl/crawlSkuApi'

export type SettingsTab = 'card' | 'selection' | 'autoCrawl' | 'calcConfig'
export type AutoCrawlCookieStatus = 'idle' | 'loading' | 'available' | 'unavailable'

export interface CalcConfigFormState {
  domesticCostCny: number
  adsRatePct: number
  otherRatePct: number
  defaultCarrier: string
  categoryPrefs: Array<{ logisticsCategory: string; defaultServiceType: string }>
}

function buildEmptyCalcConfig(): CalcConfigFormState {
  return {
    domesticCostCny: 0,
    adsRatePct: 0,
    otherRatePct: 0,
    defaultCarrier: '',
    categoryPrefs: [],
  }
}

export const settingsState = reactive({
  visible: false,
  loading: false,
  saving: false,
  activeTab: 'card' as SettingsTab,
  isListPage: true,
  cardFields: [] as CardFieldConfigItem[],
  selectionRules: [] as SelectionRuleItem[],
  autoCrawlConfig: buildDefaultAutoCrawlConfig() as AutoCrawlConfig,
  // 爬取起始位置 / 爬取模式：仅存 localStorage、不同步服务端（与 autoCrawlConfig 分离）
  crawlStartMode: getLocalCrawlStartMode() as CrawlStartMode,
  crawlScrollMode: getLocalCrawlScrollMode() as CrawlScrollMode,
  dragFromIndex: -1,
  // 计算器配置 tab
  calcConfig: buildEmptyCalcConfig(),
  // 计算器本地偏好（售价展示/利润率口径/公式系数/详情展开，仅存 localStorage）
  calcLocalPrefs: getDefaultCalcLocalPrefs() as CalcLocalPrefs,
  calcConfigLoaded: false,
  calcConfigLoading: false,
  calcConfigSaving: false,
  calcCarrierDict: [] as DictItem[],
  calcCategoryDict: [] as DictItem[],
  calcServiceTypeDict: [] as DictItem[],
  autoCrawlCookieStatus: 'idle' as AutoCrawlCookieStatus,
})

/** 列表页偏好设置入口：隐藏详情页专属字段 */
export function visibleCardFieldsForSettings(): CardFieldConfigItem[] {
  if (!settingsState.isListPage) return settingsState.cardFields
  return settingsState.cardFields.filter((f) => !LIST_PAGE_HIDDEN_FIELD_KEYS.has(f.key))
}

export function cardFieldDisplayLabel(key: string): string {
  return cardFieldLabel(key)
}

export async function preloadCardFieldPreference(): Promise<void> {
  try {
    const pref = await fetchCardPreference()
    setCardFieldConfig(pref.config)
    markCardFieldPreferenceLoaded(true)
    applyMpChartVisibleFromApi(pref.mpChartVisible)
    applyCardFieldVisibilityAll()
    refreshCardsDataByFieldConfig()
  } catch (e) {
    markCardFieldPreferenceLoaded(true)
    console.warn('[mjgd][settings] 预加载卡片偏好失败', e)
  }
}

export async function openSettings(options?: {
  tab?: SettingsTab
  isListPage?: boolean
  /** 卡片内齿轮仅字段配置：对齐旧版不触发 Cookie 检测 */
  cardOnly?: boolean
}) {
  settingsState.visible = true
  settingsState.loading = true
  settingsState.activeTab = options?.tab || 'card'
  settingsState.isListPage =
    options?.isListPage ?? isOzonListLikePage(resolveOzonPageType())

  if (!options?.cardOnly) {
    void checkAndCacheAutoCrawlCookieStatus()
  }

  // 直接打开「计算器配置」时，触发懒加载（与切 tab 走同一入口）
  if (settingsState.activeTab === 'calcConfig') {
    void loadCalcConfigTabIfNeeded()
  }

  try {
    const [cardPref, rules, crawlConfig] = await Promise.all([
      fetchCardPreference(),
      fetchSelectionRules(),
      fetchAutoCrawlPreference(),
    ])
    setCardFieldConfig(cardPref.config)
    markCardFieldPreferenceLoaded(true)
    applyMpChartVisibleFromApi(cardPref.mpChartVisible)
    settingsState.cardFields = cardPref.config.fields.map((f) => ({ ...f }))
    settingsState.selectionRules = rules.map((r) => ({ ...r }))
    settingsState.autoCrawlConfig = normalizeAutoCrawlConfig(crawlConfig)
    settingsState.crawlStartMode = getLocalCrawlStartMode()
    settingsState.crawlScrollMode = getLocalCrawlScrollMode()
    applyCookieStateToAutoCrawl()
  } catch (e: any) {
    showToast(e?.msg || e?.message || '加载偏好设置失败', 4000)
    settingsState.visible = false
  } finally {
    settingsState.loading = false
  }
}

export function closeSettings() {
  settingsState.visible = false
}

export function toggleCardFieldVisible(key: string, visible: boolean) {
  const item = settingsState.cardFields.find((f) => f.key === key)
  if (item) item.visible = visible
}

export function moveCardField(from: number, to: number) {
  if (from < 0 || to < 0 || from >= settingsState.cardFields.length || to >= settingsState.cardFields.length) {
    return
  }
  const list = settingsState.cardFields
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
}

export async function resetCardFieldsOrder() {
  try {
    const config = await resetCardFieldOrder()
    settingsState.cardFields = config.fields.map((f) => ({ ...f }))
    showToast('已恢复默认排序', 2000)
  } catch (e: any) {
    showToast(e?.message || '恢复默认排序失败', 3000)
  }
}

export function formatRuleUpdatedAt(ts?: string): string {
  return formatSelectionRuleTime(ts)
}

export async function toggleSelectionRuleEnabled(index: number, enabled: boolean) {
  const rule = settingsState.selectionRules[index]
  if (!rule) return
  rule.enabled = enabled
  rule.updatedAt = new Date().toISOString()
  try {
    settingsState.selectionRules = await saveSelectionRules(settingsState.selectionRules)
  } catch (e: any) {
    rule.enabled = !enabled
    showToast(e?.message || '更新启用状态失败', 3000)
  }
}

export function openNewSelectionRuleEditor() {
  void openRuleEditor({ isNew: true })
}

export function openEditSelectionRuleEditor(ruleId: string | number) {
  void openRuleEditor({ ruleId })
}

export async function removeSelectionRule(index: number) {
  const removed = settingsState.selectionRules[index]
  settingsState.selectionRules.splice(index, 1)
  try {
    settingsState.selectionRules = await saveSelectionRules(settingsState.selectionRules)
  } catch (e: any) {
    if (removed) settingsState.selectionRules.splice(index, 0, removed)
    showToast(e?.message || '删除规则失败', 3000)
  }
}

/** 规则生效：写入本地缓存并刷新列表打标（无需刷新页面） */
export async function activateSelectionRulesFromSettings() {
  try {
    const rules = await fetchSelectionRules()
    settingsState.selectionRules = rules.map((r) => ({ ...r }))
    activateSelectionRules(settingsState.selectionRules as any)
    showToast('选品规则已生效', 2500)
  } catch (e: any) {
    showToast(e?.message || '规则生效失败', 4000)
  }
}

export function toggleAutoCrawlField(key: string, checked: boolean) {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.fields.some((f) => f.key === key))
  if (cat && isAutoCrawlCategoryCookieLocked(cat.key)) return
  settingsState.autoCrawlConfig[key] = checked
}

export function toggleAutoCrawlCategory(catKey: string, checked: boolean) {
  if (isAutoCrawlCategoryCookieLocked(catKey)) return
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat) return
  cat.fields.forEach((f) => {
    settingsState.autoCrawlConfig[f.key] = checked
  })
}

/** 对齐旧版 checkAndCacheCookieStatus：打开偏好设置时静默检测并缓存 */
export async function checkAndCacheAutoCrawlCookieStatus(): Promise<boolean> {
  settingsState.autoCrawlCookieStatus = 'loading'
  const outcome = await inspectShopCookieAvailability({ dedupe: true })
  settingsState.autoCrawlCookieStatus = outcome.ok ? 'available' : 'unavailable'
  applyCookieStateToAutoCrawl()
  return outcome.ok
}

/** 对齐旧版 applyCookieStateToAutoSelect：无 Cookie 时清空销量/重量勾选 */
export function applyCookieStateToAutoCrawl() {
  if (settingsState.autoCrawlCookieStatus !== 'unavailable') return
  AUTO_CRAWL_CATEGORIES.forEach((cat) => {
    if (!cat.requiresCookie) return
    cat.fields.forEach((f) => {
      settingsState.autoCrawlConfig[f.key] = false
    })
  })
}

export function switchToAutoCrawlTab() {
  settingsState.activeTab = 'autoCrawl'
  applyCookieStateToAutoCrawl()
}

export function getAutoCrawlCategoryCookieUi(catKey: string): 'none' | 'loading' | 'tip' {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat?.requiresCookie) return 'none'
  if (settingsState.autoCrawlCookieStatus === 'loading') return 'loading'
  if (settingsState.autoCrawlCookieStatus === 'unavailable') return 'tip'
  return 'none'
}

export function isAutoCrawlCategoryCookieLocked(catKey: string): boolean {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat?.requiresCookie) return false
  return (
    settingsState.autoCrawlCookieStatus === 'loading'
    || settingsState.autoCrawlCookieStatus === 'unavailable'
  )
}

export function isAutoCrawlCategoryAllChecked(catKey: string): boolean {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat) return false
  return cat.fields.every((f) => !!settingsState.autoCrawlConfig[f.key])
}

export function isAutoCrawlCategoryPartial(catKey: string): boolean {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat) return false
  const checked = cat.fields.filter((f) => !!settingsState.autoCrawlConfig[f.key]).length
  return checked > 0 && checked < cat.fields.length
}

export async function saveSettings() {
  if (settingsState.saving) return
  settingsState.saving = true
  try {
    await saveCardPreference(settingsState.cardFields)
    setCardFieldConfig({ fields: settingsState.cardFields.map((f) => ({ ...f })) })
    markCardFieldPreferenceLoaded(true)
    applyCardFieldVisibilityAll()
    refreshCardsDataByFieldConfig()
    refreshMpChartByConfig()

    settingsState.selectionRules = await saveSelectionRules(settingsState.selectionRules)
    activateSelectionRules(settingsState.selectionRules as any)
    settingsState.autoCrawlConfig = await saveAutoCrawlPreference(settingsState.autoCrawlConfig)
    // 爬取起始位置 / 爬取模式仅本地保存，不走服务端
    saveLocalCrawlStartMode(settingsState.crawlStartMode)
    saveLocalCrawlScrollMode(settingsState.crawlScrollMode)

    showToast('偏好设置已保存', 2500)
    settingsState.visible = false
  } catch (e: any) {
    showToast(e?.msg || e?.message || '保存失败', 4000)
  } finally {
    settingsState.saving = false
  }
}

// ==================== 计算器配置 tab ====================
// 移植自旧插件 ozon_old/src/ozon/ozon/crawler.js loadPccTabIfNeeded / collectPccPayload

/**
 * 登出/切账号时重置「计算器配置」tab 的加载态与表单。
 * calcConfigLoaded 是「每页只懒加载一次」的 latch，不重置的话切账号后再打开该 tab 会命中
 * 上一个账号残留在 settingsState 里的 calcConfig/calcLocalPrefs（其余 tab 每次 openSettings 都重拉，不受影响）。
 */
export function resetCalcConfigTabCache(): void {
  settingsState.calcConfigLoaded = false
  settingsState.calcConfigLoading = false
  settingsState.calcConfig = buildEmptyCalcConfig()
  settingsState.calcLocalPrefs = getDefaultCalcLocalPrefs()
}

/** 切到「计算器配置」tab 时懒加载：配置 + 三套字典并行拉取 */
export async function loadCalcConfigTabIfNeeded(): Promise<void> {
  if (settingsState.calcConfigLoaded || settingsState.calcConfigLoading) return
  settingsState.calcConfigLoading = true
  try {
    const [cfg, carrierDict, categoryDict, serviceTypeDict] = await Promise.all([
      fetchProfitCalcConfig().catch(() => null),
      fetchDictByType(DICT_CARRIER).catch(() => [] as DictItem[]),
      fetchDictByType(DICT_CATEGORY).catch(() => [] as DictItem[]),
      fetchDictByType(DICT_SERVICE_TYPE).catch(() => [] as DictItem[]),
    ])
    settingsState.calcCarrierDict = carrierDict
    settingsState.calcCategoryDict = categoryDict
    settingsState.calcServiceTypeDict = serviceTypeDict
    // 同步承运商字典给卡片内嵌面板（覆盖初始化时可能失败的那次拉取）
    setInlineProfitCarrierOptions(carrierDict)
    // 同步全局缓存
    if (cfg) setCachedProfitCalcConfig(cfg)
    // 填充表单
    settingsState.calcConfig = {
      domesticCostCny: Number(cfg?.domesticCostCny) || 0,
      adsRatePct: Number(cfg?.adsRatePct) || 0,
      otherRatePct: Number(cfg?.otherRatePct) || 0,
      defaultCarrier: cfg?.defaultCarrier || '',
      categoryPrefs: rebuildCategoryPrefs(cfg?.categoryPrefs || [], categoryDict),
    }
    // 本地偏好（仅 localStorage）
    settingsState.calcLocalPrefs = getCalcLocalPrefs()
    settingsState.calcConfigLoaded = true
  } catch (e: any) {
    showToast(e?.message || '加载计算器配置失败', 3000)
  } finally {
    settingsState.calcConfigLoading = false
  }
}

/** 把后端 categoryPrefs 与字典对齐：所有字典分类都生成一行，缺失的默认 Standard */
function rebuildCategoryPrefs(
  prefs: ProfitCalcCategoryPref[],
  categoryDict: DictItem[],
): Array<{ logisticsCategory: string; defaultServiceType: string }> {
  const prefMap: Record<string, string> = {}
  for (const p of prefs || []) {
    if (p && p.logisticsCategory) {
      prefMap[p.logisticsCategory] = p.defaultServiceType || 'Standard'
    }
  }
  const out: Array<{ logisticsCategory: string; defaultServiceType: string }> = []
  for (const cat of categoryDict || []) {
    const catVal = String(cat.dictValue || '')
    if (!catVal) continue
    out.push({
      logisticsCategory: catVal,
      defaultServiceType: prefMap[catVal] || 'Standard',
    })
  }
  return out
}

/** 全部 Standard / Economy / Express */
export function setAllCalcServiceType(v: string) {
  settingsState.calcConfig.categoryPrefs.forEach((p) => {
    p.defaultServiceType = v || 'Standard'
  })
}

/** 重置表单（不写入服务端，与旧插件保持一致） */
export function resetCalcConfigForm() {
  settingsState.calcConfig.domesticCostCny = 0
  settingsState.calcConfig.adsRatePct = 0
  settingsState.calcConfig.otherRatePct = 0
  const firstCarrier = settingsState.calcCarrierDict.find((d) => !!d.dictValue)?.dictValue || ''
  settingsState.calcConfig.defaultCarrier = firstCarrier
  settingsState.calcConfig.categoryPrefs.forEach((p) => {
    p.defaultServiceType = 'Standard'
  })
  settingsState.calcLocalPrefs = getDefaultCalcLocalPrefs()
}

/** 确认应用：校验 + PUT */
export async function applyCalcConfig() {
  if (settingsState.calcConfigSaving) return
  const cfg = settingsState.calcConfig
  if (!Number.isFinite(cfg.domesticCostCny) || cfg.domesticCostCny < 0) {
    showToast('国内运费+代贴单不能小于0', 3000)
    return
  }
  if (!Number.isFinite(cfg.adsRatePct) || cfg.adsRatePct < 0 || cfg.adsRatePct > 100) {
    showToast('广告占比必须在0~100之间', 3000)
    return
  }
  if (!Number.isFinite(cfg.otherRatePct) || cfg.otherRatePct < 0 || cfg.otherRatePct > 100) {
    showToast('其他占比必须在0~100之间', 3000)
    return
  }
  const lp = settingsState.calcLocalPrefs
  if (!Number.isFinite(lp.realPriceCoeff) || lp.realPriceCoeff <= 0) {
    showToast('实际售价公式系数必须大于0', 3000)
    return
  }
  if (!Number.isFinite(lp.recommendRatePct) || lp.recommendRatePct < 0 || lp.recommendRatePct > 100) {
    showToast('推荐售价比例必须在0~100之间', 3000)
    return
  }
  settingsState.calcConfigSaving = true
  try {
    const payload = {
      domesticCostCny: cfg.domesticCostCny,
      adsRatePct: cfg.adsRatePct,
      otherRatePct: cfg.otherRatePct,
      defaultCarrier: cfg.defaultCarrier || null,
      remark: null,
      categoryPrefs: cfg.categoryPrefs.map((p, idx) => ({
        logisticsCategory: p.logisticsCategory,
        defaultServiceType: p.defaultServiceType || 'Standard',
        sortOrder: idx,
      })),
      // 展示/公式偏好随配置一起存后端（原先仅存 localStorage）
      detailExpandDefault: lp.detailExpandDefault,
      priceDisplayMode: lp.priceDisplayMode,
      realPriceCoeff: lp.realPriceCoeff,
      recommendRatePct: lp.recommendRatePct,
      profitMarginMode: lp.profitMarginMode,
    }
    const saved = await saveProfitCalcConfig(payload)
    // 后端返回的配置已含 5 个偏好：setCachedProfitCalcConfig 会灌入内存缓存，
    // 随后 applyCalcLocalPrefs / applyInlineProfitCalcConfig 据此刷新卡片
    setCachedProfitCalcConfig(saved)
    applyCalcLocalPrefs()
    applyInlineProfitCalcConfig(saved)
    showToast('计算器配置已保存', 2500)
    settingsState.visible = false
  } catch (e: any) {
    showToast(e?.message || '保存失败', 4000)
  } finally {
    settingsState.calcConfigSaving = false
  }
}

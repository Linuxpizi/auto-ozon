import { reactive, computed } from 'vue'
import { showToast } from '../../../utils/toast'
import { isOzonListLikePage, resolveOzonPageType } from '../ozonList/ozonPageContext'
import { collectListPageSkuRows } from './collectListSkus'
import {
  fetchOzonShops,
  fetchShopRecordQuota,
  fetchShopWarehouses,
  fetchUpperTemplates,
  resolveBrandIdByName,
  submitQuickShelve,
  submitQuickShelveV2,
} from './quickShelveApi'
import {
  fetchSkuDetailFromMainWorld,
  loadQuickShelveSkuRowsFromMainWorld,
  resolveColorImageFromMainWorld,
  resolveDetailSkuCommonFromMainWorld,
  setQuickShelveProgressHandler,
} from './quickShelveMainWorld'
import { buildEditUploadDataList } from './editModeSubmit'
import { convertListPriceToSaleCurrency, loadExchangeRates } from './exchangeRateStore'
import { computeVisibleSkus, validateFilterRanges, type SkuRowFilter } from './skuRowFilter'
import { applyPrefixToGoodsNo, generateGoodsNo } from './goodsNoGenerator'
import { resolveRowSourcePriceText } from './priceSourceResolver'
import {
  extractGreenBlackFromDetailDomWebPrice,
  fetchSkuWebPriceBundle,
} from '../ozonProfitCalc/ozonProductPriceApi'
import { extractDetailPageSku } from '../ozonList/detailPageContext'
import { defaultSubmitFlags, flagsFromTemplateItem, shopWarehouseConfigsFromTemplate } from './templateState'
import { getCachedSkuData } from '../ozonList/skuDataCache'
import {
  formatNumericPriceForCopy,
  formatSkuRowCreateDate,
  parseOzonRubPriceText,
} from '../ozonListShared/formatters'
import type {
  OzonShopInfo,
  QuickShelveOpenOptions,
  QuickShelvePriceCurrency,
  QuickShelvePriceSource,
  QuickShelveSkuRow,
  QuickShelveSubmitFlags,
  ShopWarehouseConfig,
  TemplateShopWarehouseConfig,
  UpperTemplateItem,
  VariantLoadProgress,
} from './types'

const SKU_PAGE_SIZE = 100

// ===== 跨次打开复用的缓存（对齐旧版：上品模板 document.ready 一次，店铺/变体可重用） =====
//
// 旧版行为：
//   - 上品模板：document.ready 时 upperTpl_fetchList 拉取一次，之后所有 cj_sale 点击复用
//   - 店铺：每次 cj_sale 都重拉（但因 offf 死代码，对比意义有限）
//   - 变体：detail 页打开复用 C.skus；卡片"急速上架"用 _bcsQuickUploadAllVariantsPrefetched 标记避免重拉
//
// 新版优化：保留 reactive state 不变（弹窗 UI 仍可直接绑定），仅在底层加模块级缓存。
//   - 模板/店铺：第一次取后写入缓存，后续打开直接复用；提供 invalidate 钩子供必要时刷新
//   - SKU 变体：用 effective SKU（targetSku 或当前详情页 SKU）做 key；同 SKU 重开时
//     不再向 MAIN 世界传 reset:true，让 _productResponses + _btFetchedSkus 缓存继续生效
let _shopsCache: OzonShopInfo[] | null = null
let _templatesCache: UpperTemplateItem[] | null = null
let _lastEffectiveSkuForVariants = ''
/** 店铺列表尚未就绪时，暂存待应用的模板店铺配置（对齐旧版 applyShopWarehouseConfigs 重试） */
let _pendingShopWarehouseConfigs: TemplateShopWarehouseConfig[] | null = null

/** 模板编辑成功 / 店铺管理变动后调用，强制下次打开重拉 */
export function invalidateQuickShelveCaches(target: 'shops' | 'templates' | 'all' = 'all') {
  if (target === 'shops' || target === 'all') _shopsCache = null
  if (target === 'templates' || target === 'all') _templatesCache = null
  if (target === 'all') {
    _lastEffectiveSkuForVariants = ''
    _pendingShopWarehouseConfigs = null
  }
}

export const quickShelveState = reactive({
  visible: false,
  /** 已弃用：旧版无全屏 loading，弹窗立即可见；保留字段避免破坏旧引用 */
  loading: false,
  submitting: false,
  /** 店铺列表加载中（左栏店铺区独立指示） */
  shopsLoading: false,
  /** 上品模板加载中（左栏模板下拉独立指示） */
  templatesLoading: false,
  /** SKU 变体加载中（表格区进度条） */
  skuLoading: false,
  targetSku: '' as string,
  skuRows: [] as QuickShelveSkuRow[],
  /** 当前筛选可见的 SKU 集合（旧版"隐藏不符合行"模式） */
  visibleSkus: new Set<string>() as Set<string>,
  /** 表格勾选的 SKU（跟卖币种 / 价格调整仅作用于勾选行） */
  selectedSkus: new Set<string>() as Set<string>,
  variantLoadProgress: { current: 0, total: 0, pending: 0 } as VariantLoadProgress,
  skuPage: 1,
  shops: [] as OzonShopInfo[],
  selectedShopIds: [] as string[],
  shopWarehouses: {} as Record<string, ShopWarehouseConfig>,
  templates: [] as UpperTemplateItem[],
  selectedTemplateId: '',
  submitFlags: defaultSubmitFlags() as QuickShelveSubmitFlags,
  goodsNoPrefix: '',
  batchStock: '',
  /** null = 未选币种，UI 不高亮；点击后才换算填入售价（对齐旧版 lbPrice 等按钮） */
  priceCurrency: null as QuickShelvePriceCurrency | null,
  priceSource: 'now' as QuickShelvePriceSource,
  priceOpType: 'fixed' as 'fixed' | 'add' | 'sub' | 'mul' | 'div',
  priceOpValue: '',
  filterPriceMin: '',
  filterPriceMax: '',
  filterSalesMin: '',
  filterSalesMax: '',
  filterDateMin: '',
  filterDateMax: '',
  goodsNoPrefixModalVisible: false,
})

function resetState() {
  quickShelveState.skuRows = []
  quickShelveState.visibleSkus = new Set<string>()
  quickShelveState.selectedSkus = new Set<string>()
  quickShelveState.variantLoadProgress = { current: 0, total: 0, pending: 0 }
  quickShelveState.skuPage = 1
  quickShelveState.selectedShopIds = []
  quickShelveState.shopWarehouses = {}
  _pendingShopWarehouseConfigs = null
  quickShelveState.selectedTemplateId = ''
  quickShelveState.submitFlags = defaultSubmitFlags()
  quickShelveState.goodsNoPrefix = ''
  quickShelveState.batchStock = ''
  quickShelveState.priceCurrency = null
  quickShelveState.priceOpValue = ''
  quickShelveState.filterPriceMin = ''
  quickShelveState.filterPriceMax = ''
  quickShelveState.filterSalesMin = ''
  quickShelveState.filterSalesMax = ''
  quickShelveState.filterDateMin = ''
  quickShelveState.filterDateMax = ''
  quickShelveState.goodsNoPrefixModalVisible = false
}

function currentFilter(): SkuRowFilter {
  return {
    priceMin: quickShelveState.filterPriceMin,
    priceMax: quickShelveState.filterPriceMax,
    salesMin: quickShelveState.filterSalesMin,
    salesMax: quickShelveState.filterSalesMax,
    dateMin: quickShelveState.filterDateMin,
    dateMax: quickShelveState.filterDateMax,
  }
}

/** 全部可见行（已过滤，跨页；仅用于分页/计数） */
export const visibleRows = computed<QuickShelveSkuRow[]>(() =>
  quickShelveState.skuRows.filter((r) => quickShelveState.visibleSkus.has(r.sku)),
)

/**
 * 当前页可见行（分页切片）。对齐旧版 crawler.js：SKU 表只把当前页 100 条渲染进 DOM，
 * 全选 / 批量改价 / 跟卖币种 / 复制 / 上架 全部只作用当前页，避免一次提交超过后端 100 条上限（整单拒绝）。
 */
export const pagedVisibleRows = computed<QuickShelveSkuRow[]>(() => {
  const rows = visibleRows.value
  const start = (quickShelveState.skuPage - 1) * SKU_PAGE_SIZE
  return rows.slice(start, start + SKU_PAGE_SIZE)
})

/** 当前页且已勾选的行（跟卖币种 / 批量改价 / 复制作用范围，均限当前页） */
export const selectedVisibleRows = computed<QuickShelveSkuRow[]>(() =>
  pagedVisibleRows.value.filter((r) => quickShelveState.selectedSkus.has(r.sku)),
)

export const allVisibleSkuRowsSelected = computed(() => {
  const rows = pagedVisibleRows.value
  if (!rows.length) return false
  return rows.every((r) => quickShelveState.selectedSkus.has(r.sku))
})

export const someVisibleSkuRowsSelected = computed(() => {
  const rows = pagedVisibleRows.value
  if (!rows.length) return false
  return rows.some((r) => quickShelveState.selectedSkus.has(r.sku))
})

function touchSelectedSkus() {
  quickShelveState.selectedSkus = new Set(quickShelveState.selectedSkus)
}

function selectAllSkuRows(rows: QuickShelveSkuRow[]) {
  quickShelveState.selectedSkus = new Set(rows.map((r) => r.sku))
}

export function isSkuRowSelected(sku: string): boolean {
  return quickShelveState.selectedSkus.has(sku)
}

export function toggleSkuRowSelection(sku: string, checked: boolean) {
  if (checked) quickShelveState.selectedSkus.add(sku)
  else quickShelveState.selectedSkus.delete(sku)
  touchSelectedSkus()
}

export function toggleSelectAllVisibleSkuRows(checked: boolean) {
  // 全选只作用当前页（对齐旧版：另一页是另一页的事情）
  pagedVisibleRows.value.forEach((r) => {
    if (checked) quickShelveState.selectedSkus.add(r.sku)
    else quickShelveState.selectedSkus.delete(r.sku)
  })
  touchSelectedSkus()
}

export function getQuickShelvePagedRows(): QuickShelveSkuRow[] {
  return pagedVisibleRows.value
}

export function getQuickShelveTotalPages(): number {
  return Math.max(1, Math.ceil(visibleRows.value.length / SKU_PAGE_SIZE))
}

export function getVisibleRowCount(): number {
  return visibleRows.value.length
}

export async function openQuickShelve(options: QuickShelveOpenOptions = {}) {
  resetState()
  // 对齐旧版：直接打开 #mark 弹窗，不阻塞等待任何数据
  quickShelveState.visible = true
  quickShelveState.targetSku = options.targetSku || ''

  // 三路并发加载，互不阻塞、互不卡弹窗（对齐旧版 #cj_sale click 行为）
  void loadShopsAsync()
  void loadTemplatesAsync()
  void loadExchangeRates().catch((e) => console.warn('[quickShelve] 加载汇率失败', e))
  void reloadSkuRowsAsync()
}

async function loadShopsAsync(opts: { force?: boolean } = {}) {
  // 命中缓存：直接回填，跳过 GET /shopInfo；force=true 时绕过缓存重拉（后台改了店铺数据需刷新）
  if (_shopsCache && !opts.force) {
    quickShelveState.shops = _shopsCache
    flushPendingShopWarehouseConfigs()
    return
  }
  quickShelveState.shopsLoading = true
  try {
    const shops = await fetchOzonShops()
    _shopsCache = shops
    quickShelveState.shops = shops
  } catch (e: any) {
    console.warn('[quickShelve] 加载店铺失败', e)
    showToast(e?.msg || e?.message || '加载店铺失败', 3000)
  } finally {
    quickShelveState.shopsLoading = false
    flushPendingShopWarehouseConfigs()
  }
}

/** 店铺列表就绪后应用此前因竞态暂存的模板店铺配置 */
function flushPendingShopWarehouseConfigs() {
  if (_pendingShopWarehouseConfigs === null || !quickShelveState.shops.length) return
  const pending = _pendingShopWarehouseConfigs
  _pendingShopWarehouseConfigs = null
  void applyShopWarehouseConfigs(pending)
}

/**
 * 将模板的默认店铺/仓库/库存回显到外层店铺区（对齐旧版 applyShopWarehouseConfigs）。
 * 要求 quickShelveState.shops 已加载；否则写入 pending 待 loadShopsAsync 完成后重试。
 */
async function applyShopWarehouseConfigs(configs: TemplateShopWarehouseConfig[]): Promise<boolean> {
  if (!quickShelveState.shops.length) {
    _pendingShopWarehouseConfigs = configs
    return false
  }
  _pendingShopWarehouseConfigs = null

  // 空数组：模板显式未配置任何店铺，取消全部勾选
  if (!configs.length) {
    quickShelveState.selectedShopIds = []
    quickShelveState.shopWarehouses = {}
    return true
  }

  const targetMap: Record<string, TemplateShopWarehouseConfig> = {}
  configs.forEach((c) => {
    if (c?.shopId) targetMap[String(c.shopId)] = c
  })

  const shopIdSet = new Set(quickShelveState.shops.map((s) => String(s.id)))
  const selectedIds = Object.keys(targetMap).filter((sid) => shopIdSet.has(sid))
  quickShelveState.selectedShopIds = selectedIds

  Object.keys(quickShelveState.shopWarehouses).forEach((sid) => {
    if (!selectedIds.includes(sid)) delete quickShelveState.shopWarehouses[sid]
  })

  await Promise.all(
    selectedIds.map(async (shopId) => {
      const tplCfg = targetMap[shopId]
      const wh = await ensureShopWarehouseData(shopId)
      if (tplCfg.warehouseId != null && tplCfg.warehouseId !== '') {
        const targetVal = String(tplCfg.warehouseId)
        if (wh.warehouseList.some((w) => String(w.warehouse_id) === targetVal)) {
          wh.warehouseId = targetVal
        }
      }
      const stockVal = parseInt(String(tplCfg.stock ?? ''), 10)
      wh.stock = Number.isFinite(stockVal) && stockVal >= 0 ? stockVal : 0
    }),
  )
  return true
}

/** 切换/初始化上品模板：同步规则开关 + 店铺仓库默认选中（对齐旧版 upperTpl_apply） */
async function applyUpperTemplateItem(tpl: UpperTemplateItem | null) {
  quickShelveState.submitFlags = flagsFromTemplateItem(tpl)
  const configs = shopWarehouseConfigsFromTemplate(tpl)
  if (configs === null) return
  await applyShopWarehouseConfigs(configs)
}

async function loadTemplatesAsync() {
  // 命中缓存：直接回填模板列表与默认选项，对齐旧版 document.ready 一次取后复用
  if (_templatesCache) {
    quickShelveState.templates = _templatesCache
    if (_templatesCache.length) {
      quickShelveState.selectedTemplateId = _templatesCache[0].id
      await applyUpperTemplateItem(_templatesCache[0])
    }
    return
  }
  quickShelveState.templatesLoading = true
  try {
    const templates = await fetchUpperTemplates()
    _templatesCache = templates
    quickShelveState.templates = templates
    if (templates.length) {
      quickShelveState.selectedTemplateId = templates[0].id
      await applyUpperTemplateItem(templates[0])
    }
  } catch (e: any) {
    console.warn('[quickShelve] 加载上品模板失败', e)
    showToast(e?.msg || e?.message || '加载上品模板失败', 3000)
  } finally {
    quickShelveState.templatesLoading = false
  }
}

async function reloadSkuRowsAsync() {
  try {
    await reloadSkuRows()
  } catch (e: any) {
    console.warn('[quickShelve] 加载 SKU 行失败', e)
    showToast(e?.msg || e?.message || '加载商品变体失败', 4000)
  }
}

export function closeQuickShelve() {
  quickShelveState.visible = false
  quickShelveState.goodsNoPrefixModalVisible = false
}

export function openGoodsNoPrefixModal() {
  quickShelveState.goodsNoPrefixModalVisible = true
}

export function closeGoodsNoPrefixModal() {
  quickShelveState.goodsNoPrefixModalVisible = false
}

export function onTemplateChange(templateId: string) {
  quickShelveState.selectedTemplateId = templateId
  const tpl = quickShelveState.templates.find((t) => t.id === templateId) || null
  void applyUpperTemplateItem(tpl)
}

async function loadShopQuotaHtml(shopId: string, opts: { force?: boolean } = {}) {
  const cfg = quickShelveState.shopWarehouses[shopId]
  if (!cfg || cfg.quotaLoading) return
  // force=true 时即使已有额度也重拉（后台调整了店铺额度需刷新）
  if (cfg.quotaHtml && !opts.force) return
  cfg.quotaLoading = true
  try {
    cfg.quotaHtml = await fetchShopRecordQuota(shopId)
  } finally {
    cfg.quotaLoading = false
  }
}

/**
 * 勾选店铺时拉取仓库列表与额度信息。
 * force=true 时强制从后端重拉仓库列表与额度，但保留用户已填库存与已选仓库（仓库仍存在时），
 * 用于「上品模板设置」弹窗打开时刷新后台改动的店铺数据。
 */
export async function ensureShopWarehouseData(shopId: string, opts: { force?: boolean } = {}) {
  const existing = quickShelveState.shopWarehouses[shopId]
  if (!existing) {
    quickShelveState.shopWarehouses[shopId] = await fetchShopWarehouses(shopId)
  } else if (opts.force) {
    const fresh = await fetchShopWarehouses(shopId)
    const keepWarehouseId =
      existing.warehouseId && fresh.warehouseList.some((w) => w.warehouse_id === existing.warehouseId)
        ? existing.warehouseId
        : fresh.warehouseId
    // 原地修改保留响应式引用：刷新可选仓库列表，保留用户已填库存
    existing.warehouseList = fresh.warehouseList
    existing.warehouseId = keepWarehouseId
    existing.quotaHtml = undefined
  }
  void loadShopQuotaHtml(shopId, { force: opts.force })
  return quickShelveState.shopWarehouses[shopId]
}

/**
 * 「上品模板设置」弹窗打开时调用：强制从后端刷新店铺列表 + 已选店铺的仓库/额度。
 * 对齐旧版每次开弹窗都重拉 shopInfo 的行为，避免后台改了店铺数据后插件读旧缓存。
 */
export async function refreshTemplateEditShopData() {
  await loadShopsAsync({ force: true })
  await Promise.all(
    quickShelveState.selectedShopIds.map((id) => ensureShopWarehouseData(id, { force: true })),
  )
}

export async function toggleShopSelection(shopId: string, checked: boolean) {
  if (checked) {
    if (!quickShelveState.selectedShopIds.includes(shopId)) {
      quickShelveState.selectedShopIds.push(shopId)
    }
    await ensureShopWarehouseData(shopId)
  } else {
    quickShelveState.selectedShopIds = quickShelveState.selectedShopIds.filter((id) => id !== shopId)
  }
}

export function toggleSelectAllShops(checked: boolean) {
  if (!checked) {
    quickShelveState.selectedShopIds = []
    return
  }
  quickShelveState.selectedShopIds = quickShelveState.shops.map((s) => String(s.id))
  void Promise.all(
    quickShelveState.selectedShopIds.map((shopId) => ensureShopWarehouseData(shopId)),
  )
}

export function removeSkuRow(sku: string) {
  quickShelveState.skuRows = quickShelveState.skuRows.filter((r) => r.sku !== sku)
  quickShelveState.visibleSkus.delete(sku)
  quickShelveState.selectedSkus.delete(sku)
  // 触发响应式：构造新的 Set
  quickShelveState.visibleSkus = new Set(quickShelveState.visibleSkus)
  touchSelectedSkus()
  // 修正当前页
  const total = getQuickShelveTotalPages()
  if (quickShelveState.skuPage > total) quickShelveState.skuPage = total
}

export function adjustShopStock(shopId: string, delta: number) {
  const cfg = quickShelveState.shopWarehouses[shopId]
  if (!cfg) return
  const next = Math.max(0, (Number(cfg.stock) || 0) + delta)
  cfg.stock = next
}

export function applyGoodsNoPrefix() {
  const prefix = quickShelveState.goodsNoPrefix.trim()
  if (!prefix) {
    showToast('请输入货号前缀', 2500)
    return
  }
  // 对全部可见行覆盖：保留尾 4 位（若原有），否则随机
  visibleRows.value.forEach((row) => {
    row.goodsNo = applyPrefixToGoodsNo(row.goodsNo || generateGoodsNo(row.sku), prefix)
  })
  showToast(`已为 ${visibleRows.value.length} 个 SKU 应用货号前缀`, 2500)
}

export function applyBatchStock() {
  const stock = parseInt(quickShelveState.batchStock, 10)
  if (!Number.isFinite(stock) || stock < 0) {
    showToast('请输入非负库存数', 2500)
    return
  }
  if (!quickShelveState.selectedShopIds.length) {
    showToast('请先选择店铺', 2500)
    return
  }
  quickShelveState.selectedShopIds.forEach((shopId) => {
    const cfg = quickShelveState.shopWarehouses[shopId]
    if (cfg) cfg.stock = stock
  })
  showToast(`已为 ${quickShelveState.selectedShopIds.length} 个店铺批量设置库存`, 2500)
}

function parsePriceNumber(text: string): number {
  const n = parseFloat(String(text || '').replace(/[^\d.,]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** 批量改价基准：仅读售价输入框，空或非数按 0（对齐旧版 Number(input.val()) || 0） */
function getRowPriceBase(row: QuickShelveSkuRow): number {
  const sale = parsePriceNumber(row.salePrice)
  return Number.isFinite(sale) ? sale : 0
}

function applyPriceSettingsToSelectedRows() {
  const rows = selectedVisibleRows.value
  if (!rows.length) {
    showToast('请先勾选要改价的 SKU', 2500)
    return false
  }
  const currency = quickShelveState.priceCurrency
  if (!currency) return false
  const source = quickShelveState.priceSource
  let filled = 0
  rows.forEach((row) => {
    const priceText = resolveRowSourcePriceText(row, source)
    const converted = convertListPriceToSaleCurrency(priceText, currency)
    if (converted != null && converted > 0) {
      row.salePrice = converted.toFixed(2)
      filled += 1
    } else {
      // 所选价格类型无值时清空售价，避免残留上一档换算结果
      row.salePrice = ''
    }
  })
  if (!filled) {
    showToast('没有可换算的价格', 2500)
    return false
  }
  return true
}

/** 价格选择切换：切换展示列；已选跟卖币种时同步换算填入售价 */
export function applyPriceSourceToSkuRows(source: QuickShelvePriceSource) {
  quickShelveState.priceSource = source
  if (quickShelveState.priceCurrency) applyPriceSettingsToSelectedRows()
}

/** 跟卖币种切换：点击后高亮并将所选价格源换算后填入售价 */
export function applyCurrencyToSkuRows(currency: QuickShelvePriceCurrency) {
  quickShelveState.priceCurrency = currency
  applyPriceSettingsToSelectedRows()
}

export function applyBatchPrice() {
  const opValRaw = quickShelveState.priceOpValue.trim()
  if (!opValRaw) {
    showToast('请输入改价数值', 2500)
    return
  }
  const isPercent = opValRaw.endsWith('%')
  const opNum = parseFloat(isPercent ? opValRaw.slice(0, -1) : opValRaw)
  if (!Number.isFinite(opNum)) {
    showToast('请输入有效数字', 2500)
    return
  }
  if ((quickShelveState.priceOpType === 'mul' || quickShelveState.priceOpType === 'div') && opNum <= 0) {
    showToast('乘数或除数应大于 0', 2500)
    return
  }

  const rows = selectedVisibleRows.value
  if (!rows.length) {
    showToast('请先勾选要改价的 SKU', 2500)
    return
  }

  rows.forEach((row) => {
    const base = getRowPriceBase(row)
    let next = base
    switch (quickShelveState.priceOpType) {
      case 'fixed':
        next = opNum
        break
      case 'add':
        next = isPercent ? base * (1 + opNum / 100) : base + opNum
        break
      case 'sub':
        next = isPercent ? base * (1 - opNum / 100) : base - opNum
        break
      case 'mul':
        next = base * opNum
        break
      case 'div':
        next = opNum !== 0 ? base / opNum : base
        break
      default:
        break
    }
    // 对齐旧版：不论正负都写入 toFixed(2)
    row.salePrice = next.toFixed(2)
  })
}

function rebuildVisibleSkus() {
  quickShelveState.visibleSkus = computeVisibleSkus(quickShelveState.skuRows, currentFilter())
  // 重置到第一页
  quickShelveState.skuPage = 1
}

/** 急速上架弹窗"时间"列：只从全局 SKU 缓存（卡片渲染时落的 /skuss/new 数据）回填 createDate，
 *  对齐旧版 C.goodsSaleData —— 弹窗只读缓存、不主动补取。
 *  详情页：一个商品的所有变体共享同一个上架时间，用当前主 SKU 的 createDate 应用到全部行
 *  （对齐旧版：isProductPage 时 detailCreateDate 优先用于每一行）。Ozon 变体接口(/product/)不含
 *  上架时间，主 SKU 的时间由详情页卡片渲染时的 /skuss/new 落进缓存（detailPageService）。
 *  写入前一律走 formatSkuRowCreateDate（对齐旧版 formatDate 的 UTC YYYY.MM.DD）。 */
function enrichRowsWithCreateDate(rows: QuickShelveSkuRow[], isDetailPage: boolean): void {
  // 详情页主 SKU 的上架时间（变体共享商品创建时间），优先应用到所有变体行
  let detailCreateDate = ''
  if (isDetailPage) {
    const detailSku =
      extractDetailPageSku() || window.location.pathname.match(/(\d{7,})/)?.[1] || ''
    if (detailSku) {
      detailCreateDate = formatSkuRowCreateDate(getCachedSkuData(detailSku)?.createDate) || ''
    }
  }
  rows.forEach((row) => {
    // 本行自身可用的时间：MAIN 世界给的（归一化，可能是 ISO 串）→ 全局缓存里的
    let own = row.createdAt ? formatSkuRowCreateDate(row.createdAt) || '' : ''
    if (!own) own = formatSkuRowCreateDate(getCachedSkuData(row.sku)?.createDate) || ''
    // 详情页主 SKU 时间优先（对齐旧版 detailCreateDate || item.createDate），否则用本行自身
    row.createdAt = detailCreateDate || own
  })
}

function enrichDetailCurrentSkuFromDom(rows: QuickShelveSkuRow[]) {
  const pageSku =
    extractDetailPageSku() || window.location.pathname.match(/(\d{7,})/)?.[1] || ''
  if (!pageSku) return
  const row = rows.find((r) => String(r.sku) === String(pageSku))
  if (!row || row.pricePairSource === 'api') return
  const bundle = extractGreenBlackFromDetailDomWebPrice()
  if (!bundle) return
  row.price = bundle.greenText
  row.blackPrice = bundle.blackText
  if (!row.originalPrice && bundle.strikeText) row.originalPrice = bundle.strikeText
  row.pricePairSource = 'dom'
}

function applyWebPriceBundleToRow(row: QuickShelveSkuRow, bundle: { greenText: string; blackText: string; strikeText: string }) {
  if (bundle.greenText) row.price = bundle.greenText
  if (bundle.blackText) row.blackPrice = bundle.blackText
  // 划线原价保留列表已有值；仅缺失时用 API 补齐
  if (!row.originalPrice && bundle.strikeText) row.originalPrice = bundle.strikeText
  row.pricePairSource = 'api'
}

/** 列表页：批量拉 webPrice 绿黑价（与利润计算器 ensureListSkuRealPrice 同源），供四宫格实际/推荐售价 */
async function enrichListPageSkuRowPrices(rows: QuickShelveSkuRow[]): Promise<void> {
  const pending = rows.filter((r) => r.pricePairSource !== 'api')
  if (!pending.length) return

  const CONCURRENCY = 6
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < pending.length) {
      const row = pending[cursor++]
      try {
        const bundle = await fetchSkuWebPriceBundle(row.sku)
        if (!bundle) continue
        applyWebPriceBundleToRow(row, bundle)
      } catch {
        /* 单条失败不打断，让其他 worker 继续 */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
}

// 注册一次：MAIN 世界变体加载进度 → 写入 reactive state
setQuickShelveProgressHandler(({ current, total, pending }) => {
  quickShelveState.variantLoadProgress.current = current
  quickShelveState.variantLoadProgress.total = total
  quickShelveState.variantLoadProgress.pending = pending
})

async function reloadSkuRows() {
  // 重置进度
  quickShelveState.variantLoadProgress.current = 0
  quickShelveState.variantLoadProgress.total = 0
  quickShelveState.variantLoadProgress.pending = 0
  quickShelveState.skuLoading = true
  try {
    const pageType = resolveOzonPageType()
    const targetSku = quickShelveState.targetSku

    let rows: QuickShelveSkuRow[] = []
    if (targetSku || pageType === 'detail') {
      // effective SKU = 卡片传入 targetSku；否则取当前详情页路径上的主 SKU
      const pageSku = window.location.pathname.match(/(\d{7,})/)?.[1] || ''
      const effectiveSku = targetSku || pageSku
      // 同一个 effective SKU 重开时不要让 MAIN 世界 reset _productResponses + _btFetchedSkus；
      // 这样 getBt 内部的 _btFetchedSkus dedupe 与 _productResponses 收集都能短路重用，
      // 避免每次点开急速上架都重新爬一遍 Page1/Page2 + 全部变体（最耗时的部分）。
      // 不同 SKU 之间仍需 reset，否则 bcsCollectQuickShelveSkuRows 会把上次的变体混进来。
      const sameAsLast = !!effectiveSku && effectiveSku === _lastEffectiveSkuForVariants
      const result = await loadQuickShelveSkuRowsFromMainWorld({
        targetSku: targetSku || undefined,
        prefetchPageSku: !targetSku,
        reset: !sameAsLast,
      })
      rows = result.rows
      if (effectiveSku) _lastEffectiveSkuForVariants = effectiveSku
      // 受限提示：验证码/整页受限 → 已停止；429 重试超限 → 部分加载
      if (result.blocked) {
        showToast('检测到访问受限，已停止加载变体，请稍后再试', 4000)
      } else if (result.dropped > 0) {
        showToast(`部分变体加载受限，已加载 ${rows.length}/${result.total || rows.length}，可稍后重试`, 4000)
      }
    } else if (isOzonListLikePage(pageType)) {
      rows = collectListPageSkuRows()
      // 列表页 DOM 收集不依赖 MAIN 世界缓存，下次切到详情页打开仍按 SKU 比对
      _lastEffectiveSkuForVariants = ''
    }

    // 默认填充货号（对齐旧版 bcsGenerateGoodsNo 每行自动 `<sku>-<4rand>`）
    rows.forEach((r) => {
      if (!r.goodsNo) r.goodsNo = generateGoodsNo(r.sku)
    })

    // 对齐旧版 C.goodsSaleData：只从全局 SKU 缓存回填 createDate（弹窗不主动补取，不再每次重刷 skuss/new）。
    // 详情页：变体共享商品上架时间，用主 SKU 的 createDate 铺到所有变体行（对齐旧版 detailCreateDate）。
    enrichRowsWithCreateDate(rows, pageType === 'detail')

    if (pageType === 'detail') {
      enrichDetailCurrentSkuFromDom(rows)
    }

    quickShelveState.skuRows = rows
    rebuildVisibleSkus()
    // 初始只勾选当前页（rebuildVisibleSkus 已把 skuPage 重置为 1），与"全选/批量/复制/提交仅作用当前页"保持一致；
    // 翻页时全选框与各行勾选是响应式 computed，会自动按新页重算（另一页默认未勾选，另一页是另一页的事情）
    selectAllSkuRows(pagedVisibleRows.value)

    // 列表页：对齐利润计算器，后台批量拉各 SKU 的 webPrice 绿黑价以展示实际/推荐售价
    if (isOzonListLikePage(pageType)) {
      void enrichListPageSkuRowPrices(quickShelveState.skuRows)
    }

    if (!rows.length) {
      showToast('未找到可上架的商品变体', 3000)
    }
  } finally {
    quickShelveState.skuLoading = false
  }
}

function buildShopWarehouseConfigs() {
  return quickShelveState.selectedShopIds
    .map((shopId) => {
      const cfg = quickShelveState.shopWarehouses[shopId]
      if (!cfg?.warehouseId) return null
      return {
        shopId,
        warehouseId: cfg.warehouseId,
        stock: cfg.stock ?? 0,
      }
    })
    .filter(Boolean)
}

export function applyFilters() {
  const err = validateFilterRanges(currentFilter())
  if (err) {
    showToast(err, 3000)
    return
  }
  rebuildVisibleSkus()
  showToast(`筛选完成：${visibleRows.value.length} / ${quickShelveState.skuRows.length}`, 2500)
}

export function clearFilters() {
  quickShelveState.filterPriceMin = ''
  quickShelveState.filterPriceMax = ''
  quickShelveState.filterSalesMin = ''
  quickShelveState.filterSalesMax = ''
  quickShelveState.filterDateMin = ''
  quickShelveState.filterDateMax = ''
  rebuildVisibleSkus()
  showToast('已重置筛选', 2000)
}

export async function copyQuickShelveSkuPrice() {
  const rows = selectedVisibleRows.value
  if (!rows.length) {
    showToast('请先勾选要复制的 SKU', 2500)
    return
  }
  const lines = rows.map((r) => {
    // 对齐旧版 #copy：填了「售价」用售价，未填回退商品现价；现价原文带 ₽/¥ 等单位，
    // 复制时统一解析成纯数字（去单位、去千分位空格），保持「SKU,价格」可直接粘贴。
    let price = r.salePrice.trim()
    if (!price) {
      const n = parseOzonRubPriceText(r.price)
      price = Number.isFinite(n) ? formatNumericPriceForCopy(n) : ''
    }
    return `${r.sku},${price}`
  })
  await navigator.clipboard.writeText(lines.join('\n'))
  showToast(`已复制 ${lines.length} 条 SKU,价格`, 2500)
}

export async function copyQuickShelveSkuOnly() {
  const rows = selectedVisibleRows.value
  if (!rows.length) {
    showToast('请先勾选要复制的 SKU', 2500)
    return
  }
  const skus = rows.map((r) => r.sku)
  await navigator.clipboard.writeText(skus.join('\n'))
  showToast(`已复制 ${skus.length} 个 SKU`, 2500)
}

export async function copyQuickShelvePriceOnly() {
  const rows = selectedVisibleRows.value
  if (!rows.length) {
    showToast('请先勾选要复制的 SKU', 2500)
    return
  }
  // 对齐旧版 #copyPrice：只复制「售价」输入框内容，不回退实际现价（现价带 ₽ 等单位且非用户期望值）。
  // salePrice 始终是 toFixed(2) 的纯数字，天然不带单位；未填写的行用「价格未设置」占位以保持与 SKU 行对应。
  if (rows.every((r) => !r.salePrice.trim())) {
    showToast('请输入价格后再复制', 2500)
    return
  }
  const lines = rows.map((r) => r.salePrice.trim() || '价格未设置')
  await navigator.clipboard.writeText(lines.join('\n'))
  showToast(`已复制 ${lines.length} 个价格`, 2500)
}

/** 提交前解析自定义品牌 ID（对齐旧版 resolveBrandIdByName + 品牌校验） */
async function resolveSubmitBrandFlags(
  flags: QuickShelveSubmitFlags,
): Promise<QuickShelveSubmitFlags | null> {
  const f = { ...flags }
  if (!f.brandStatus) {
    f.brand = null
    f.brandId = null
    return f
  }
  if (f.brand) {
    if (!f.brandId) {
      const id = await resolveBrandIdByName(f.brand)
      if (id) f.brandId = id
    }
    if (!f.brandId) {
      showToast('未能解析自定义品牌，请从下拉列表中选择品牌后再提交', 4000)
      return null
    }
  } else {
    f.brandId = null
  }
  return f
}

function buildSkuPricePayloadItem(
  row: { sku: string; salePrice: string; goodsNo: string; image: string; title: string },
  detail: Record<string, unknown>,
): Record<string, unknown> {
  return {
    sku: row.sku,
    price: row.salePrice,
    offerId: row.goodsNo,
    primaryImage: row.image,
    title: row.title,
    video_cover: detail.video_cover || [],
    video_poster: detail.video_poster || [],
    description: detail.description || '',
    hashtags: detail.hashtags || [],
    richAnnotationJson: detail.richAnnotationJson
      ? JSON.stringify(detail.richAnnotationJson)
      : '',
  }
}

async function buildSkuPricePayloadItemWithExtras(
  row: { sku: string; salePrice: string; goodsNo: string; image: string; title: string },
  detail: Record<string, unknown>,
  flags: QuickShelveSubmitFlags,
  isDetail: boolean,
): Promise<Record<string, unknown>> {
  const item = buildSkuPricePayloadItem(row, detail)
  if (flags.upperShelveDirect) {
    const colorImage = isDetail
      ? await resolveColorImageFromMainWorld(row.sku, null)
      : String(detail.color_image || '')
    if (colorImage) item.color_image = colorImage
  }
  return item
}

export async function submitQuickShelveForm() {
  if (quickShelveState.submitting) return
  if (!quickShelveState.selectedShopIds.length) {
    showToast('请至少选择一个店铺', 3000)
    return
  }

  // 编辑模式启用且未选签名模板时拦截
  let flags = quickShelveState.submitFlags
  if (flags.antiFollowEnabled === 1 && !flags.antiFollowTemplateId) {
    showToast('已启用防跟卖签名，请选择签名模板', 3000)
    return
  }

  const resolvedFlags = await resolveSubmitBrandFlags(flags)
  if (!resolvedFlags) return
  flags = resolvedFlags
  quickShelveState.submitFlags = resolvedFlags

  // 只提交当前页设了价的行（对齐旧版：一页 100 条 = 一次上架，天生不超后端上限）
  const pricedRows = pagedVisibleRows.value.filter((r) => r.salePrice.trim() !== '')
  if (!pricedRows.length) {
    showToast('请为当前页至少一个 SKU 填写售价', 3000)
    return
  }

  const missingGoodsNo = pricedRows.some((r) => !r.goodsNo.trim())
  if (missingGoodsNo) {
    showToast('设置了售价的商品，货号不能为空', 4000)
    return
  }

  quickShelveState.submitting = true
  try {
    const pageType = resolveOzonPageType()
    const isDetail = pageType === 'detail'
    const mainSku =
      quickShelveState.targetSku ||
      extractDetailPageSku() ||
      (document.querySelector('[data-widget="webDetailSKU"]')?.textContent || '').match(/\d+/)?.[0] ||
      ''

    const detailSkuCommonMap: Record<string, Record<string, unknown>> = {}
    if (flags.upperShelveDirect && isDetail && pricedRows.length > 0) {
      const commons = await Promise.all(
        pricedRows.map((row) => resolveDetailSkuCommonFromMainWorld(row.sku, mainSku)),
      )
      pricedRows.forEach((row, i) => {
        detailSkuCommonMap[row.sku] = commons[i]
      })
    }

    const skuPrices = []
    for (const row of pricedRows) {
      let detail: Record<string, unknown> = {}
      if (flags.upperShelveDirect) {
        if (!isDetail) {
          detail = await fetchSkuDetailFromMainWorld(row.sku)
        } else {
          detail = detailSkuCommonMap[row.sku] || {}
        }
      }
      skuPrices.push(await buildSkuPricePayloadItemWithExtras(row, detail, flags, isDetail))
    }

    const shopWarehouseConfigs = buildShopWarehouseConfigs()
    const payload: Record<string, unknown> = {
      skuPrices,
      shopIds: quickShelveState.selectedShopIds,
      aiImage: flags.aiImage,
      oModel: flags.oModel,
      handMovementStatus: flags.handMovementStatus,
      Btxh: flags.Btxh,
      madeCountryStatus: flags.madeCountryStatus,
      jsonStatus: flags.jsonStatus,
      tagStatus: flags.tagStatus,
      bigmodelAi: flags.bigmodelAi,
      pricateStatus: flags.pricateStatus,
      removeBrandText: flags.removeBrandText,
      generateBarcode: flags.generateBarcode,
      antiFollowEnabled: flags.antiFollowEnabled,
      antiFollowTemplateId: flags.antiFollowTemplateId,
      brandStatus: flags.brandStatus,
      brand: flags.brand,
      brandId: flags.brandId,
      productSuffix: flags.productSuffix,
      diyName: flags.productSuffix,
      aiTemplateId: flags.aiTemplateId,
      updateSku: false,
      offerDIY: null,
      isMultiShopMode: shopWarehouseConfigs.length > 0,
      shopWarehouseConfigs,
      btxh: null,
    }

    if (!flags.upperShelveDirect) {
      // 编辑模式 V2：采集完整商品数据后提交采集箱
      const editUploadDataList = await buildEditUploadDataList(skuPrices as any)

      if (!editUploadDataList.length) {
        // 对齐旧版 crawler.js:6452-6457：V2 全失败 → 自动回退 V1 直上
        showToast('编辑模式数据采集失败，自动切换到直上模式', 3500)
        // 重新拼装 skuPrices（编辑模式没拉过 detail，对 V1 直上需要逐 SKU 拉）
        const v1SkuPrices = []
        for (const row of pricedRows) {
          let detail: Record<string, unknown> = {}
          if (!isDetail) {
            detail = await fetchSkuDetailFromMainWorld(row.sku)
          } else {
            detail =
              detailSkuCommonMap[row.sku] || (await resolveDetailSkuCommonFromMainWorld(row.sku, mainSku))
          }
          v1SkuPrices.push(await buildSkuPricePayloadItemWithExtras(row, detail, flags, isDetail))
        }
        const fallbackPayload: Record<string, unknown> = { ...payload, skuPrices: v1SkuPrices }
        delete fallbackPayload.status
        delete fallbackPayload.editUploadDataList
        const fallbackRes = await submitQuickShelve(fallbackPayload)
        if (fallbackRes?.code === 200) {
          showToast('任务已提交，请耐心等待或在后台查看', 4000)
          closeQuickShelve()
          return
        }
        showToast(fallbackRes?.msg || '回退 V1 直上提交失败', 4000)
        return
      }

      payload.status = 'preparing'
      payload.editUploadDataList = editUploadDataList
      delete payload.skuPrices

      const resV2 = await submitQuickShelveV2(payload)
      if (resV2?.code === 200) {
        showToast('采集任务已排队，可稍后前往采集箱查看', 4000)
        closeQuickShelve()
        return
      }
      showToast(resV2?.msg || '提交失败', 4000)
      return
    }

    const res = await submitQuickShelve(payload)
    if (res?.code === 200) {
      showToast('任务已提交，请耐心等待或在后台查看', 4000)
      closeQuickShelve()
      return
    }
    showToast(res?.msg || '提交失败', 4000)
  } catch (e: any) {
    showToast(e?.msg || e?.message || '提交失败', 4000)
  } finally {
    quickShelveState.submitting = false
  }
}

export interface AutoCrawlFieldDef {
  key: string
  label: string
}

export interface AutoCrawlCategoryDef {
  key: string
  title: string
  desc: string
  defaultChecked: boolean
  requiresCookie?: boolean
  showSelectAll: boolean
  fields: AutoCrawlFieldDef[]
}

/** 自动爬取导出字段分类（对齐旧版 BCS_AUTO_SELECT_CATEGORIES） */
export const AUTO_CRAWL_CATEGORIES: AutoCrawlCategoryDef[] = [
  {
    key: 'basic',
    title: '基础数据',
    desc: '商品基础信息、价格、评分及活动基础字段',
    defaultChecked: true,
    showSelectAll: true,
    fields: [
      { key: 'listingFormat', label: '上品格式' },
      { key: 'sku', label: 'SKU' },
      { key: 'productTitle', label: '商品标题' },
      { key: 'productImage', label: '商品图片' },
      { key: 'imageLink', label: '图片链接' },
      { key: 'productLink', label: '商品链接' },
      { key: 'priceCny', label: '价格（人民币）' },
      { key: 'price', label: '价格' },
      { key: 'originalPrice', label: '原价' },
      { key: 'discount', label: '折扣' },
      { key: 'promoStatus', label: '促销活动状态' },
      { key: 'promoActivity', label: '促销活动' },
      { key: 'promoStock', label: '活动库存' },
      { key: 'rating', label: '评分' },
      { key: 'reviewCount', label: '评论数量' },
      { key: 'ratingDistribution', label: '评分分布/卢布' },
      { key: 'brandCert', label: '品牌认证' },
    ],
  },
  {
    key: 'follow',
    title: '跟卖',
    desc: '围绕被跟卖数量、跟卖价格与链接信息',
    defaultChecked: false,
    showSelectAll: true,
    fields: [
      { key: 'followCount', label: '被跟数量' },
      { key: 'followPriceRange', label: '被跟最低/最高价' },
      { key: 'followMinLink', label: '被跟最低链接' },
      { key: 'followMaxLink', label: '被跟最高链接' },
    ],
  },
  {
    key: 'sales',
    title: '销量',
    desc: '围绕销量、流量、转化与推广表现',
    defaultChecked: false,
    requiresCookie: true,
    showSelectAll: true,
    fields: [
      { key: 'articleNumber', label: '货号' },
      { key: 'brand', label: '品牌' },
      { key: 'category', label: '类目' },
      { key: 'fbsCommission', label: 'FBS佣金' },
      { key: 'fbpCommission', label: 'FBP佣金' },
      { key: 'promo28d', label: '促销活动（28天参与）' },
      { key: 'paidPromo28d', label: '付费推广（28天参与）' },
      { key: 'monthlySalesAmount', label: '月销售额' },
      { key: 'adCostRatio', label: '广告费用占比' },
      { key: 'weeklySales', label: '周销量' },
      { key: 'monthlySalesVolume', label: '月销量' },
      { key: 'turnoverDynamic', label: '周转动态' },
      { key: 'totalImpressions', label: '商品展示总量' },
      { key: 'impressionConvRate', label: '展示转化率' },
      { key: 'productClicks', label: '商品点击量' },
      { key: 'cartConvRate', label: '购物车转化率' },
      { key: 'promoDiscount', label: '促销活动折扣' },
      { key: 'promoConvRate', label: '促销活动转化率' },
      { key: 'volumeLiter', label: '体积/公升' },
      { key: 'avgPrice', label: '平均价格' },
      { key: 'sellerType', label: '卖家类型' },
      { key: 'searchTraffic', label: '搜索中的浏览量' },
      { key: 'searchCartRate', label: '搜索目录加购率' },
      { key: 'clickRate', label: '商品点击率' },
      { key: 'returnRate', label: '退货取消率' },
      { key: 'createTime', label: '商品创建时间' },
    ],
  },
  {
    key: 'weight',
    title: '重量',
    desc: '围绕体积、尺寸和重量数据',
    defaultChecked: false,
    requiresCookie: true,
    showSelectAll: true,
    fields: [
      { key: 'lengthMm', label: '长度/mm' },
      { key: 'widthMm', label: '宽度/mm' },
      { key: 'heightMm', label: '高度/mm' },
      { key: 'weightG', label: '重量/g' },
    ],
  },
]

export const EXPORT_SPEED_MODES = {
  // concurrency：限制「同时在途」请求数，防连接堆积；
  // shopsRate / salesRate：两个后端接口各自的目标速率(req/s)，均低于服务端硬限
  //   （shopsClawler=重量 15/s、newClawler=销量 20/s），由 requestRateLimiter 强制执行。
  //   模式差异体现在速率上——「快速」= 服务端允许范围内尽量快，而非无限冲。
  steady: { label: '稳速模式', concurrency: 4, shopsRate: 6, salesRate: 8 },
  balanced: { label: '均衡模式', concurrency: 6, shopsRate: 8, salesRate: 10 },
  fast: { label: '快速模式', concurrency: 8, shopsRate: 10, salesRate: 11 },
} as const

export type ExportSpeedMode = keyof typeof EXPORT_SPEED_MODES
export const DEFAULT_EXPORT_SPEED_MODE: ExportSpeedMode = 'balanced'

/**
 * 爬取起始位置：pageTop=先滚到页面顶部从第一个商品完整采集；viewport=从当前视口第一个商品开始向下，整次任务不采上方商品。
 * 仅影响「新任务」的起始定位，不影响续爬/恢复上次位置。
 * 仅存浏览器 localStorage、不同步服务端（对齐计算器本地偏好 calcLocalPrefs 的做法）。
 */
export type CrawlStartMode = 'pageTop' | 'viewport'
export const DEFAULT_CRAWL_START_MODE: CrawlStartMode = 'pageTop'
export const CRAWL_START_MODE_OPTIONS: { value: CrawlStartMode; label: string }[] = [
  { value: 'pageTop', label: '从页面顶部开始' },
  { value: 'viewport', label: '从当前视口开始' },
]

const CRAWL_START_MODE_STORAGE_KEY = 'bcs_crawl_start_mode'

/** 读取本地保存的爬取起始位置，缺失/非法回退默认（页面顶部） */
export function getLocalCrawlStartMode(): CrawlStartMode {
  try {
    const raw = localStorage.getItem(CRAWL_START_MODE_STORAGE_KEY)
    if (raw === 'viewport' || raw === 'pageTop') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_CRAWL_START_MODE
}

/** 保存爬取起始位置到 localStorage */
export function saveLocalCrawlStartMode(mode: CrawlStartMode): CrawlStartMode {
  const normalized: CrawlStartMode = mode === 'viewport' ? 'viewport' : DEFAULT_CRAWL_START_MODE
  try {
    localStorage.setItem(CRAWL_START_MODE_STORAGE_KEY, normalized)
  } catch {
    /* ignore */
  }
  return normalized
}

/**
 * 爬取模式（列表滚动采集速度）：fast=13ms 步进；normal=26ms 步进。
 * 仅存 localStorage、不同步服务端。
 */
export const CRAWL_SCROLL_MODES = {
  normal: {
    label: '普通模式',
    scrollIntervalMs: 26,
    hint: '正常速度爬取，限频风险小，适合长时间爬取',
  },
  fast: {
    label: '快速模式',
    scrollIntervalMs: 13,
    hint: '爬取速度快，容易被 Ozon 限频，导致无法操作 Ozon 相关页面',
  },
} as const

export type CrawlScrollMode = keyof typeof CRAWL_SCROLL_MODES
export const DEFAULT_CRAWL_SCROLL_MODE: CrawlScrollMode = 'normal'

export const CRAWL_SCROLL_MODE_OPTIONS: {
  value: CrawlScrollMode
  label: string
  hint: string
}[] = (Object.keys(CRAWL_SCROLL_MODES) as CrawlScrollMode[]).map((key) => ({
  value: key,
  label: CRAWL_SCROLL_MODES[key].label,
  hint: CRAWL_SCROLL_MODES[key].hint,
}))

const CRAWL_SCROLL_MODE_STORAGE_KEY = 'bcs_crawl_scroll_mode'

export function getLocalCrawlScrollMode(): CrawlScrollMode {
  try {
    const raw = localStorage.getItem(CRAWL_SCROLL_MODE_STORAGE_KEY)
    if (raw === 'fast' || raw === 'normal') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_CRAWL_SCROLL_MODE
}

export function saveLocalCrawlScrollMode(mode: CrawlScrollMode): CrawlScrollMode {
  const normalized: CrawlScrollMode =
    mode === 'fast' || mode === 'normal' ? mode : DEFAULT_CRAWL_SCROLL_MODE
  try {
    localStorage.setItem(CRAWL_SCROLL_MODE_STORAGE_KEY, normalized)
  } catch {
    /* ignore */
  }
  return normalized
}

export function getCrawlScrollIntervalMs(mode?: CrawlScrollMode): number {
  const key = mode ?? getLocalCrawlScrollMode()
  return CRAWL_SCROLL_MODES[key]?.scrollIntervalMs ?? CRAWL_SCROLL_MODES.normal.scrollIntervalMs
}

export type AutoCrawlConfig = Record<string, boolean | string>

const AUTO_CRAWL_PREFERENCE_STORAGE_KEY = 'ozon_replica_auto_crawl_preference'

async function readLocalAutoCrawlPreference(): Promise<AutoCrawlConfig | null> {
  const chromeApi = (globalThis as any).chrome
  try {
    if (chromeApi?.storage?.local) {
      const stored = await chromeApi.storage.local.get(AUTO_CRAWL_PREFERENCE_STORAGE_KEY)
      const value = stored[AUTO_CRAWL_PREFERENCE_STORAGE_KEY]
      return value && typeof value === 'object' ? value as AutoCrawlConfig : null
    }
    const raw = globalThis.localStorage?.getItem(AUTO_CRAWL_PREFERENCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as AutoCrawlConfig : null
  } catch (error) {
    console.warn('[mjgd][crawl] 读取本地自动爬取偏好失败，使用默认配置', error)
    return null
  }
}

async function writeLocalAutoCrawlPreference(config: AutoCrawlConfig): Promise<void> {
  const chromeApi = (globalThis as any).chrome
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [AUTO_CRAWL_PREFERENCE_STORAGE_KEY]: config })
    return
  }
  globalThis.localStorage?.setItem(AUTO_CRAWL_PREFERENCE_STORAGE_KEY, JSON.stringify(config))
}

export function buildDefaultAutoCrawlConfig(): AutoCrawlConfig {
  const config: AutoCrawlConfig = {}
  AUTO_CRAWL_CATEGORIES.forEach((cat) => {
    cat.fields.forEach((f) => {
      config[f.key] = cat.defaultChecked
    })
  })
  config.exportSpeedMode = DEFAULT_EXPORT_SPEED_MODE
  return config
}

export function normalizeAutoCrawlConfig(raw?: AutoCrawlConfig | null): AutoCrawlConfig {
  const base = buildDefaultAutoCrawlConfig()
  const input = raw && typeof raw === 'object' ? raw : {}
  AUTO_CRAWL_CATEGORIES.forEach((cat) => {
    cat.fields.forEach((f) => {
      if (f.key in input) base[f.key] = !!input[f.key]
    })
  })
  // 旧版 turnoverDynamic2 与 turnoverDynamic 内容相同，合并为单一字段
  if (input.turnoverDynamic2 && !base.turnoverDynamic) {
    base.turnoverDynamic = true
  }
  const mode = String(input.exportSpeedMode || DEFAULT_EXPORT_SPEED_MODE) as ExportSpeedMode
  base.exportSpeedMode = EXPORT_SPEED_MODES[mode] ? mode : DEFAULT_EXPORT_SPEED_MODE
  return base
}

/** 读取浏览器本地自动爬取偏好，缺失或损坏时回退默认配置。 */
export async function fetchAutoCrawlPreference(): Promise<AutoCrawlConfig> {
  const stored = await readLocalAutoCrawlPreference()
  return stored ? normalizeAutoCrawlConfig(stored) : buildDefaultAutoCrawlConfig()
}

export function getCheckedExportFields(config: AutoCrawlConfig): AutoCrawlFieldDef[] {
  const fields: AutoCrawlFieldDef[] = []
  AUTO_CRAWL_CATEGORIES.forEach((cat) => {
    cat.fields.forEach((f) => {
      if (config[f.key]) fields.push(f)
    })
  })
  return fields
}

export function exportNeedsCookie(config: AutoCrawlConfig): boolean {
  return AUTO_CRAWL_CATEGORIES.some(
    (cat) => cat.requiresCookie && cat.fields.some((f) => config[f.key]),
  )
}

export function getExportConcurrency(config: AutoCrawlConfig): number {
  const mode = String(config.exportSpeedMode || DEFAULT_EXPORT_SPEED_MODE) as ExportSpeedMode
  return EXPORT_SPEED_MODES[mode]?.concurrency || EXPORT_SPEED_MODES.steady.concurrency
}

/** shopsClawler(重量)接口的导出目标速率，随速度模式变化，均 ≤ 服务端 15/s */
export function getExportShopsRate(config: AutoCrawlConfig): number {
  const mode = String(config.exportSpeedMode || DEFAULT_EXPORT_SPEED_MODE) as ExportSpeedMode
  return EXPORT_SPEED_MODES[mode]?.shopsRate ?? EXPORT_SPEED_MODES.steady.shopsRate
}

/** newClawler(销量)接口的导出目标速率，随速度模式变化，均 ≤ 服务端 20/s */
export function getExportSalesRate(config: AutoCrawlConfig): number {
  const mode = String(config.exportSpeedMode || DEFAULT_EXPORT_SPEED_MODE) as ExportSpeedMode
  return EXPORT_SPEED_MODES[mode]?.salesRate ?? EXPORT_SPEED_MODES.steady.salesRate
}

export function categoryNeedsEnrichment(catKey: string, config: AutoCrawlConfig): boolean {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === catKey)
  if (!cat) return false
  return cat.fields.some((f) => config[f.key])
}

/** 保存自动爬取偏好到浏览器本地存储。 */
export async function saveAutoCrawlPreference(config: AutoCrawlConfig): Promise<AutoCrawlConfig> {
  const normalized = normalizeAutoCrawlConfig(config)
  await writeLocalAutoCrawlPreference(normalized)
  return normalized
}

export function countCheckedAutoCrawlFields(config: AutoCrawlConfig): number {
  let count = 0
  AUTO_CRAWL_CATEGORIES.forEach((cat) => {
    cat.fields.forEach((f) => {
      if (config[f.key]) count += 1
    })
  })
  return count
}

export function isExportSpeedVisible(config: AutoCrawlConfig): boolean {
  return ['follow', 'sales', 'weight'].some((catKey) => categoryNeedsEnrichment(catKey, config))
}

/** 平台类型 */
export type Platform = 'ozon' | 'wb' | '1688' | 'pdd'

/** 页面/API 中可核验的单个变体维度。 */
export interface ProductVariantValue {
  name: string
  value: string
}

/**
 * 商品的一个真实可售 SKU/变体组合。
 *
 * 不允许根据标题或默认值构造；只保存页面 DOM、页面内嵌数据或平台接口
 * 明确提供的字段。`values` 必须描述该 SKU 的完整变体组合；对于平台明确
 * 只有一个 Offer 且不存在颜色/尺码等变体维度的普通商品，完整组合是空数组。
 */
export interface ProductVariant {
  sku: string
  barcode?: string
  values: ProductVariantValue[]
  price?: number
  oldPrice?: number
  stock?: number
  imageUrl?: string
  /** 变体事实来源，便于区分页面结构化数据、DOM 与平台接口。 */
  sourcePath?: string
}

export interface ProductSpec {
  weight_g?: number
  depth_mm?: number
  height_mm?: number
  width_mm?: number
  package_weight_g?: number
  package_depth_mm?: number
  package_width_mm?: number
  package_height_mm?: number
  volume_cm3?: number
  [key: string]: unknown
}

/** 采集的商品数据 */
export interface ScrapedProduct {
  platform: Platform
  sourceId: string
  title: string
  /** 币种: CNY/RUB/USD 等,默认根据平台推断 */
  currency: string
  price: number
  oldPrice: number
  images: string[]
  rating: number
  reviewCount: number
  brand?: string
  category?: string
  sellerName?: string
  sellerUrl?: string
  description?: string
  sourceUrl: string
  scrapedAt: string

  // ── 多值字段 (JSON arrays) ──
  /** 商品视频 URL 列表 */
  videoUrls?: string[]
  /** 页面事实中的 SKU + 条形码标识列表。 */
  skuList: Array<{ sku: string; barcode: string }>
  /** 所有可售 SKU 及其完整变体组合。 */
  variants: ProductVariant[]
  /** 规格列表 [{weight_g, depth_mm, height_mm, width_mm, color, size, ...}] */
  specList: ProductSpec[]
  /** 商品标签 (品牌、分类、促销标签等) */
  tags?: string[]

  // ── 新增:Ozon 内部分类(从内部 API 获取) ──
  /** Ozon description_category_id */
  ozonCategoryId?: number
  /** Ozon type_id */
  ozonTypeId?: number

  /** Ozon 强制采集指标，按 docs/采集强制要求.md 固定输出 */
  ozonMetrics?: OzonMetrics

  // ── Ozon 物流采集字段 (docs/采集强制要求.md 推荐模型) ──
  warehouse?: string
  warehouseId?: string
  logisticsType?: string
  deliveryMethod?: string
  deliveryRegion?: string
  deliveryDays?: number

  /** 折扣文本 (如 -52%) */
  discount?: string
  /** 库存文本 (如 Осталось 5 штук) */
  stock?: string

  // ── 1688 专有字段 ──
  /** 阶梯价格 [{minQty, maxQty, price}] */
  priceRanges?: Array<{ minQty: number; maxQty: number; price: number }>
  /** 起订量 */
  minOrderQty?: number
  /** 供应商店铺 URL */
  supplierUrl?: string
  /** 成交量 */
  tradeQuantity?: number
}

export type RequiredProductField = 'skuList' | 'variants'

export interface ProductCompleteness {
  complete: boolean
  missing: RequiredProductField[]
}

export interface OzonMetrics {
  /** SKU */
  sku: string
  /** 货号 / Артикул */
  articleNumber: string
  brand: string
  category: string
  /** 促销活动 */
  promotions: string[]
  /** 付费推广 */
  paidPromotion: string
  /** 月销售额，RUB */
  monthlyRevenue: number
  /** 月销量 */
  monthlySales: number
  /** 周转动态 */
  turnoverDynamics: string
  /** 被跟数量 */
  followersCount: number
  minPrice: number
  maxPrice: number
  rfbsCommission: number
  fbpCommission: number
  /** 成交率，百分比数值 */
  conversionRate: number
  /** 体积，cm³ */
  volumeCm3: number
  lengthMm: number
  widthMm: number
  heightMm: number
  weightG: number
  /** 包装重量与包装长宽高，区别于 SKU 规格 */
  packageWeightG: number
  packageLengthMm: number
  packageWidthMm: number
  packageHeightMm: number
  /** 仓库/配送/物流模式 */
  warehouse: string
  warehouseId: string
  logisticsType: string
  deliveryMethod: string
  deliveryRegion: string
  deliveryDays: number
  /** 上架时间 */
  listedAt: string
  /** 当前页面/API 未能可靠命中的强制字段，便于后续补采排查 */
  missingFields: string[]
}

/** 单个平台的采集条件 */
export interface PlatformScrapingConfig {
  /** 价格区间 */
  priceMin: number
  priceMax: number
  /** 最低评分 */
  minRating: number
  /** 最低评价数量 */
  minReviews: number
  /** 品牌白名单 (仅采集这些品牌,空=不限) */
  brandWhitelist: string[]
  /** 品牌黑名单 (不采集这些品牌) */
  brandBlacklist: string[]
  /** 列表采集:最大采集数量 */
  maxItems: number
  /** 列表采集:每次滚动间隔 (ms) */
  scrollDelay: number
  /** 列表采集:每批次上报数量 (增量上报) */
  batchSize: number
}

/** 插件设置 */
export interface PluginSettings {
  /** 后端 API 地址 */
  apiBaseUrl: string
  /** 自动采集 */
  autoScrape: boolean
  /** Ozon 采集条件 */
  ozon: PlatformScrapingConfig
  /** Wildberries 采集条件 */
  wb: PlatformScrapingConfig
  /** 1688 采集条件 */
  '1688': PlatformScrapingConfig
  /** 拼多多采集条件 */
  pdd: PlatformScrapingConfig
}

/** 列表采集的商品摘要(非完整商品数据) */
export interface ListProductSummary {
  platform: Platform
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  rating: number
  reviewCount: number
  sourceUrl: string
  scrapedAt: string
}

const defaultPlatformConfig: PlatformScrapingConfig = {
  priceMin: 0,
  priceMax: 0,
  minRating: 0,
  minReviews: 0,
  brandWhitelist: [],
  brandBlacklist: [],
  maxItems: 50,
  scrollDelay: 1500,
  batchSize: 10,
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiBaseUrl: 'http://localhost:9000',
  autoScrape: true,
  ozon: { ...defaultPlatformConfig },
  wb: { ...defaultPlatformConfig },
  '1688': { ...defaultPlatformConfig },
  pdd: { ...defaultPlatformConfig },
}

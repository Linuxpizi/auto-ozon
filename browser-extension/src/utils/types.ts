/** 平台类型 */
export type Platform = 'ozon' | 'wb' | '1688'

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
  brand: string
  category: string
  sellerName: string
  sellerUrl: string
  attributes: ProductAttribute[]
  description: string
  sourceUrl: string
  scrapedAt: string

  // ── 多值字段 (JSON arrays) ──
  /** 商品视频 URL 列表 */
  videoUrls: string[]
  /** SKU + 条形码列表 [{sku, barcode}] */
  skuList: Array<{ sku: string; barcode: string }>
  /** 规格列表 [{weight_g, depth_mm, height_mm, width_mm, color, size, ...}] */
  specList: Array<{ weight_g: number; depth_mm: number; height_mm: number; width_mm: number; [key: string]: any }>

  // ── 新增:Ozon 内部分类(从内部 API 获取) ──
  /** Ozon description_category_id */
  ozonCategoryId: number
  /** Ozon type_id */
  ozonTypeId: number

  // ── 1688 专有字段 ──
  /** 阶梯价格 [{minQty, maxQty, price}] */
  priceRanges: Array<{ minQty: number; maxQty: number; price: number }>
  /** 起订量 */
  minOrderQty: number
  /** 供应商店铺 URL */
  supplierUrl: string
  /** 成交量 */
  tradeQuantity: number
}

export interface ProductAttribute {
  name: string
  value: string
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
}

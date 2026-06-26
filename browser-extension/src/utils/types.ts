/** 平台类型 */
export type Platform = 'ozon' | 'wb'

/** 采集的商品数据 */
export interface ScrapedProduct {
  platform: Platform
  sourceId: string
  title: string
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
  apiBaseUrl: 'http://localhost:8000',
  autoScrape: true,
  ozon: { ...defaultPlatformConfig },
  wb: { ...defaultPlatformConfig },
}

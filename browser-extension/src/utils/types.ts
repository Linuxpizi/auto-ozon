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

/** 存储在 Chrome Storage 中的带 ID 记录 */
export interface StoredProduct extends ScrapedProduct {
  id: string
  synced: boolean
}

/** 插件设置 */
export interface PluginSettings {
  apiBaseUrl: string
  autoScrape: boolean
  priceMin: number
  priceMax: number
  minRating: number
  minReviews: number
  brandWhitelist: string[]
  brandBlacklist: string[]
  /** 列表采集设置 */
  listScraping: ListScrapingConfig
}

/** 列表采集配置 */
export interface ListScrapingConfig {
  enabled: boolean
  maxItems: number
  scrollDelay: number
  scrollStep: number
  autoScroll: boolean
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

export const DEFAULT_SETTINGS: PluginSettings = {
  apiBaseUrl: 'http://localhost:8000',
  autoScrape: true,
  priceMin: 0,
  priceMax: 0,
  minRating: 0,
  minReviews: 0,
  brandWhitelist: [],
  brandBlacklist: [],
  listScraping: {
    enabled: true,
    maxItems: 50,
    scrollDelay: 1000,
    scrollStep: 500,
    autoScroll: true,
  },
}

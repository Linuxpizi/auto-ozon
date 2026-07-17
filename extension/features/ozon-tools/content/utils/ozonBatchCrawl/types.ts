export type CrawlStatus =
  | 'idle'
  | 'collecting'
  | 'paused'
  | 'stopped'
  | 'cleared_ready'
  | 'export_done'

export type CrawlLogLevel = 'info' | 'success' | 'warn' | 'stop'

export interface CrawlLogEntry {
  id: string
  time: string
  level: CrawlLogLevel
  message: string
}

export interface CrawlProductRecord {
  sku: string
  title: string
  imageUrl: string
  imageBase64?: string
  productUrl: string
  price: string
  originalPrice: string
  discount: string
  promoJoined: string
  promoName: string
  promoStock: string
  rating: string
  reviewCount: string
  pointsReview: string
  brandCert: string
}

export interface CrawlStateSnapshot {
  visible: boolean
  status: CrawlStatus
  count: number
  logs: CrawlLogEntry[]
  exportProgress: number
  exportTotal: number
  isExporting: boolean
  isCookieChecking: boolean
}
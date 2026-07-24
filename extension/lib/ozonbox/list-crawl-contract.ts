export interface OzonListCardIdentity {
  sku: string
  sourceUrl: string
}

export type OzonListCrawlStatus =
  | 'idle'
  | 'collecting'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'stopped'
  | 'error'

export interface OzonListCrawlSnapshot {
  status: OzonListCrawlStatus
  collected: number
  saved: number
  skipped: number
  pending: number
  failed: number
  message: string
}

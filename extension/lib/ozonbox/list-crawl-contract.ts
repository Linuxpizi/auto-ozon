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
  /** 命中启用规则并成功同步的目标商品数。 */
  target: number
  collected: number
  saved: number
  skipped: number
  pending: number
  failed: number
  message: string
}

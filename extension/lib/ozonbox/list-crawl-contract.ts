export interface OzonListCardIdentity {
  sku: string
  sourceUrl: string
}

export const DEFAULT_OZON_LIST_TARGET = 100
export const DEFAULT_OZON_LIST_COLLECT_VARIANTS = false

export interface OzonListCrawlProcessConfig {
  collectVariants: boolean
  selectionRuleIds: number[]
}

export interface OzonListCrawlStartConfig extends OzonListCrawlProcessConfig {
  target: number
}

function requireSelectionRuleIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('启动爬虫必须明确选择选品规则')
  const ids = value.map((id) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new Error('选品规则 ID 必须是正整数')
    }
    return id
  })
  if (new Set(ids).size !== ids.length) throw new Error('选品规则 ID 不能重复')
  return ids
}

export function assertOzonListCrawlProcessConfig(value: unknown): OzonListCrawlProcessConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('商品处理配置必须是对象')
  }
  const config = value as Record<string, unknown>
  if (typeof config.collectVariants !== 'boolean') throw new Error('必须明确是否采集 SKU 变体')
  return {
    collectVariants: config.collectVariants,
    selectionRuleIds: requireSelectionRuleIds(config.selectionRuleIds),
  }
}

export function assertOzonListCrawlStartConfig(value: unknown): OzonListCrawlStartConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('启动爬虫配置必须是对象')
  }
  const config = value as Record<string, unknown>
  if (typeof config.target !== 'number' || !Number.isInteger(config.target) || config.target <= 0) {
    throw new Error('目标采集数目必须是正整数')
  }
  return {
    target: config.target,
    ...assertOzonListCrawlProcessConfig(config),
  }
}

export function createDefaultOzonListCrawlStartConfig(): OzonListCrawlStartConfig {
  return {
    target: DEFAULT_OZON_LIST_TARGET,
    collectVariants: DEFAULT_OZON_LIST_COLLECT_VARIANTS,
    selectionRuleIds: [],
  }
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
  /** 命中本次启动所选规则并成功同步的目标商品数。 */
  target: number
  collected: number
  saved: number
  skipped: number
  pending: number
  failed: number
  message: string
}

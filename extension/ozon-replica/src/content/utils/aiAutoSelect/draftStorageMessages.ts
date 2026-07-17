/** content ↔ background 草稿 IndexedDB 消息类型（扩展域共享，跨 1688 子域） */
export const AI_AUTO_SELECT_DRAFT_READ = 'AI_AUTO_SELECT_DRAFT_READ'
export const AI_AUTO_SELECT_DRAFT_SAVE_FULL = 'AI_AUTO_SELECT_DRAFT_SAVE_FULL'
export const AI_AUTO_SELECT_DRAFT_PUT_ITEM = 'AI_AUTO_SELECT_DRAFT_PUT_ITEM'
export const AI_AUTO_SELECT_DRAFT_SAVE_META = 'AI_AUTO_SELECT_DRAFT_SAVE_META'
export const AI_AUTO_SELECT_DRAFT_DELETE_ITEMS = 'AI_AUTO_SELECT_DRAFT_DELETE_ITEMS'
export const AI_AUTO_SELECT_DRAFT_CLEAR_SESSION = 'AI_AUTO_SELECT_DRAFT_CLEAR_SESSION'
export const AI_AUTO_SELECT_DRAFT_LIST = 'AI_AUTO_SELECT_DRAFT_LIST'
export const AI_AUTO_SELECT_DRAFT_CLEAR_FINISHED = 'AI_AUTO_SELECT_DRAFT_CLEAR_FINISHED'
export const AI_AUTO_SELECT_DRAFT_HEARTBEAT = 'AI_AUTO_SELECT_DRAFT_HEARTBEAT'
export const AI_AUTO_SELECT_DRAFT_RECONCILE_STALE = 'AI_AUTO_SELECT_DRAFT_RECONCILE_STALE'
export const AI_AUTO_SELECT_DRAFT_CLEAR_EXPIRED = 'AI_AUTO_SELECT_DRAFT_CLEAR_EXPIRED'

export type DraftMetaRecord = {
  id: string
  version: 2
  pageUrl: string
  config: unknown
  status: string
  collectedCount: number
  seenOfferIds?: string[]
  scannedOfferIds?: string[]
  updatedAt: number
  /** 采集 runner 存活心跳，用于判定意外中断 */
  lastHeartbeatAt?: number
}

export type DraftStorageResponse = {
  ok: boolean
  draft?: unknown
  sessions?: DraftMetaRecord[]
  clearedCount?: number
  reconciledCount?: number
  error?: string
}

/**
 * 自动选品草稿：扩展域 IndexedDB（跨 1688 子域共享，按 sessionId 多会话隔离）
 */
import {
  AI_AUTO_SELECT_DRAFT_CLEAR_EXPIRED,
  AI_AUTO_SELECT_DRAFT_CLEAR_FINISHED,
  AI_AUTO_SELECT_DRAFT_CLEAR_SESSION,
  AI_AUTO_SELECT_DRAFT_DELETE_ITEMS,
  AI_AUTO_SELECT_DRAFT_HEARTBEAT,
  AI_AUTO_SELECT_DRAFT_LIST,
  AI_AUTO_SELECT_DRAFT_PUT_ITEM,
  AI_AUTO_SELECT_DRAFT_READ,
  AI_AUTO_SELECT_DRAFT_RECONCILE_STALE,
  AI_AUTO_SELECT_DRAFT_SAVE_FULL,
  AI_AUTO_SELECT_DRAFT_SAVE_META,
  type DraftMetaRecord,
  type DraftStorageResponse,
} from '../content/utils/aiAutoSelect/draftStorageMessages'

const DB_NAME = 'mjgd_ai_auto_select'
const DB_VERSION = 2
const META_STORE = 'draft_meta'
const ITEMS_STORE = 'draft_items'
const SESSION_INDEX = 'by_session'
const LEGACY_META_KEY = 'current'
export const LEGACY_MIGRATED_SESSION_ID = 'legacy_migrated'

type StoredDraftItem = Record<string, unknown> & { id: string; sessionId?: string }

let dbOpenPromise: Promise<IDBDatabase> | null = null

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function resolveSessionId(draft: Record<string, unknown>): string {
  const fromDraft = draft.sessionId
  if (typeof fromDraft === 'string' && fromDraft) return fromDraft
  const fromMeta = (draft as { id?: string }).id
  if (typeof fromMeta === 'string' && fromMeta && fromMeta !== LEGACY_META_KEY) return fromMeta
  return `legacy_${Date.now()}`
}

function openDraftDb(): Promise<IDBDatabase> {
  if (dbOpenPromise) return dbOpenPromise
  dbOpenPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction!
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
      let itemsStore: IDBObjectStore
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        itemsStore = db.createObjectStore(ITEMS_STORE, { keyPath: 'id' })
      } else {
        itemsStore = tx.objectStore(ITEMS_STORE)
      }
      if (!itemsStore.indexNames.contains(SESSION_INDEX)) {
        itemsStore.createIndex(SESSION_INDEX, 'sessionId', { unique: false })
      }
      if (event.oldVersion < 2) {
        migrateLegacyCurrentSession(tx)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbOpenPromise = null
      reject(request.error ?? new Error('IndexedDB open failed'))
    }
  })
  return dbOpenPromise
}

/** v1 单会话 current 迁移为 legacy sessionId，避免升级后丢数据 */
function migrateLegacyCurrentSession(tx: IDBTransaction): void {
  const metaStore = tx.objectStore(META_STORE)
  const itemsStore = tx.objectStore(ITEMS_STORE)
  const legacyReq = metaStore.get(LEGACY_META_KEY)
  legacyReq.onsuccess = () => {
    const legacy = legacyReq.result as DraftMetaRecord | undefined
    if (!legacy) return
    const sessionId = LEGACY_MIGRATED_SESSION_ID
    metaStore.put({ ...legacy, id: sessionId })
    metaStore.delete(LEGACY_META_KEY)
    const allReq = itemsStore.getAll()
    allReq.onsuccess = () => {
      const items = allReq.result as StoredDraftItem[]
      items.forEach((item) => {
        if (!item?.id) return
        itemsStore.put({ ...item, sessionId })
      })
    }
  }
}

function buildMetaFromDraft(draft: Record<string, unknown>): DraftMetaRecord {
  const now = Date.now()
  const itemsLen = Array.isArray(draft.items) ? draft.items.length : 0
  const sessionId = resolveSessionId(draft)
  return {
    id: sessionId,
    version: 2,
    pageUrl: String(draft.pageUrl ?? ''),
    config: draft.config ?? {},
    status: String(draft.status ?? 'idle'),
    collectedCount: Math.max(Number(draft.collectedCount ?? itemsLen), itemsLen),
    seenOfferIds: Array.isArray(draft.seenOfferIds) ? [...draft.seenOfferIds] : undefined,
    updatedAt: Number(draft.updatedAt ?? now),
  }
}

async function readDraftMeta(db: IDBDatabase, sessionId: string): Promise<DraftMetaRecord | null> {
  const tx = db.transaction(META_STORE, 'readonly')
  const meta = await idbRequest(tx.objectStore(META_STORE).get(sessionId))
  await idbTxDone(tx)
  return (meta as DraftMetaRecord | undefined) ?? null
}

async function readDraftItemsBySession(db: IDBDatabase, sessionId: string): Promise<StoredDraftItem[]> {
  const tx = db.transaction(ITEMS_STORE, 'readonly')
  const store = tx.objectStore(ITEMS_STORE)
  let items: StoredDraftItem[]
  if (store.indexNames.contains(SESSION_INDEX)) {
    items = await idbRequest(store.index(SESSION_INDEX).getAll(sessionId))
  } else {
    const all = await idbRequest(store.getAll())
    items = (all as StoredDraftItem[]).filter((item) => item.sessionId === sessionId)
  }
  await idbTxDone(tx)
  return Array.isArray(items) ? items : []
}

async function readFullDraft(sessionId: string): Promise<Record<string, unknown> | null> {
  const db = await openDraftDb()
  const meta = await readDraftMeta(db, sessionId)
  if (!meta) return null
  const items = await readDraftItemsBySession(db, sessionId)
  return {
    version: 2,
    sessionId: meta.id,
    pageUrl: meta.pageUrl || '',
    config: meta.config ?? {},
    status: meta.status ?? 'idle',
    collectedCount: meta.collectedCount ?? items.length,
    seenOfferIds: meta.seenOfferIds,
    updatedAt: meta.updatedAt ?? Date.now(),
    lastHeartbeatAt: meta.lastHeartbeatAt,
    items,
  }
}

async function clearSessionItems(db: IDBDatabase, sessionId: string, tx?: IDBTransaction): Promise<void> {
  const ownsTx = !tx
  const transaction = tx ?? db.transaction(ITEMS_STORE, 'readwrite')
  const store = transaction.objectStore(ITEMS_STORE)
  if (store.indexNames.contains(SESSION_INDEX)) {
    const items = await idbRequest(store.index(SESSION_INDEX).getAllKeys(sessionId))
    for (const key of items as IDBValidKey[]) {
      store.delete(key)
    }
  } else {
    const all = await idbRequest(store.getAll())
    ;(all as StoredDraftItem[]).forEach((item) => {
      if (item.sessionId === sessionId && item.id) store.delete(item.id)
    })
  }
  if (ownsTx) await idbTxDone(transaction)
}

async function saveFullDraft(draft: Record<string, unknown>): Promise<void> {
  const db = await openDraftDb()
  const meta = buildMetaFromDraft(draft)
  const sessionId = meta.id
  const existingMeta = await readDraftMeta(db, sessionId)
  if (existingMeta?.lastHeartbeatAt) {
    meta.lastHeartbeatAt = existingMeta.lastHeartbeatAt
  }
  const items = (Array.isArray(draft.items) ? draft.items : []) as StoredDraftItem[]
  meta.updatedAt = Date.now()

  const tx = db.transaction([META_STORE, ITEMS_STORE], 'readwrite')
  const metaStore = tx.objectStore(META_STORE)
  const itemsStore = tx.objectStore(ITEMS_STORE)
  await clearSessionItems(db, sessionId, tx)
  items.forEach((item) => {
    if (item?.id) itemsStore.put({ ...item, sessionId })
  })
  metaStore.put(meta)
  await idbTxDone(tx)
}

async function putDraftItem(item: StoredDraftItem, meta: DraftMetaRecord): Promise<void> {
  const db = await openDraftDb()
  const sessionId = meta.id
  const tx = db.transaction([META_STORE, ITEMS_STORE], 'readwrite')
  tx.objectStore(ITEMS_STORE).put({ ...item, sessionId })
  tx.objectStore(META_STORE).put({ ...meta, id: sessionId, updatedAt: Date.now() })
  await idbTxDone(tx)
}

async function saveDraftMeta(meta: DraftMetaRecord): Promise<void> {
  const db = await openDraftDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put({ ...meta, updatedAt: Date.now() })
  await idbTxDone(tx)
}

async function deleteDraftItems(sessionId: string, itemIds: string[], meta?: DraftMetaRecord): Promise<void> {
  const db = await openDraftDb()
  const tx = db.transaction([META_STORE, ITEMS_STORE], 'readwrite')
  const itemsStore = tx.objectStore(ITEMS_STORE)
  itemIds.forEach((id) => itemsStore.delete(id))
  if (meta) {
    tx.objectStore(META_STORE).put({ ...meta, id: sessionId, updatedAt: Date.now() })
  }
  await idbTxDone(tx)
}

async function clearDraftSession(sessionId: string): Promise<void> {
  const db = await openDraftDb()
  const tx = db.transaction([META_STORE, ITEMS_STORE], 'readwrite')
  tx.objectStore(META_STORE).delete(sessionId)
  await clearSessionItems(db, sessionId, tx)
  await idbTxDone(tx)
}

async function listAllDraftMeta(): Promise<DraftMetaRecord[]> {
  const db = await openDraftDb()
  const tx = db.transaction(META_STORE, 'readonly')
  const all = await idbRequest(tx.objectStore(META_STORE).getAll())
  await idbTxDone(tx)
  return Array.isArray(all) ? (all as DraftMetaRecord[]) : []
}

async function clearSessionsByStatus(statuses: string[]): Promise<number> {
  const statusSet = new Set(statuses)
  const metas = await listAllDraftMeta()
  const toClear = metas.filter((meta) => statusSet.has(meta.status))
  for (const meta of toClear) {
    await clearDraftSession(meta.id)
  }
  return toClear.length
}

/** 清除 updatedAt 早于 cutoff 的会话，活跃采集任务因心跳会持续刷新 updatedAt 不会被误删 */
async function clearExpiredSessions(olderThanMs: number): Promise<number> {
  const cutoff = Date.now() - olderThanMs
  const metas = await listAllDraftMeta()
  const toClear = metas.filter((meta) => (meta.updatedAt ?? 0) < cutoff)
  for (const meta of toClear) {
    await clearDraftSession(meta.id)
  }
  return toClear.length
}

const ACTIVE_RUNNER_STATUS_SET = new Set(['collecting', 'paused'])

/** 无心跳超时的进行中任务标记为 stopped，表示意外中断 */
async function reconcileStaleInterruptedSessions(staleMs: number): Promise<number> {
  const now = Date.now()
  const metas = await listAllDraftMeta()
  let reconciledCount = 0
  for (const meta of metas) {
    if (!ACTIVE_RUNNER_STATUS_SET.has(meta.status)) continue
    const lastBeat = meta.lastHeartbeatAt ?? 0
    // 升级前无 heartbeat 字段时，用 updatedAt 兜底判定陈旧会话
    const reference = lastBeat > 0 ? lastBeat : (meta.updatedAt ?? 0)
    if (now - reference <= staleMs) continue
    await saveDraftMeta({ ...meta, status: 'stopped', updatedAt: now })
    reconciledCount += 1
  }
  return reconciledCount
}

async function touchSessionHeartbeat(sessionId: string): Promise<boolean> {
  const db = await openDraftDb()
  const meta = await readDraftMeta(db, sessionId)
  if (!meta) return false
  const now = Date.now()
  await saveDraftMeta({ ...meta, lastHeartbeatAt: now, updatedAt: now })
  return true
}

function isDraftMessage(type: unknown): type is string {
  return typeof type === 'string' && type.startsWith('AI_AUTO_SELECT_DRAFT_')
}

/** background onMessage 入口：处理草稿 IndexedDB 读写 */
export function handleAiAutoSelectDraftMessage(
  msg: Record<string, unknown>,
  sendResponse: (response: DraftStorageResponse) => void,
): boolean {
  if (!isDraftMessage(msg.type)) return false

  void (async () => {
    try {
      switch (msg.type) {
        case AI_AUTO_SELECT_DRAFT_READ: {
          const sessionId = msg.sessionId as string | undefined
          if (!sessionId) {
            sendResponse({ ok: false, error: 'missing sessionId' })
            break
          }
          const draft = await readFullDraft(sessionId)
          sendResponse({ ok: true, draft: draft ?? undefined })
          break
        }
        case AI_AUTO_SELECT_DRAFT_SAVE_FULL: {
          const draft = msg.draft as Record<string, unknown> | undefined
          if (!draft || typeof draft !== 'object') {
            sendResponse({ ok: false, error: 'invalid draft' })
            break
          }
          await saveFullDraft(draft)
          sendResponse({ ok: true })
          break
        }
        case AI_AUTO_SELECT_DRAFT_PUT_ITEM: {
          const item = msg.item as StoredDraftItem | undefined
          const meta = msg.meta as DraftMetaRecord | undefined
          if (!item?.id || !meta?.id) {
            sendResponse({ ok: false, error: 'invalid item or meta' })
            break
          }
          await putDraftItem(item, meta)
          sendResponse({ ok: true })
          break
        }
        case AI_AUTO_SELECT_DRAFT_SAVE_META: {
          const meta = msg.meta as DraftMetaRecord | undefined
          if (!meta?.id) {
            sendResponse({ ok: false, error: 'invalid meta' })
            break
          }
          await saveDraftMeta(meta)
          sendResponse({ ok: true })
          break
        }
        case AI_AUTO_SELECT_DRAFT_DELETE_ITEMS: {
          const sessionId = msg.sessionId as string | undefined
          const itemIds = msg.itemIds as string[] | undefined
          if (!sessionId || !Array.isArray(itemIds)) {
            sendResponse({ ok: false, error: 'invalid sessionId or itemIds' })
            break
          }
          await deleteDraftItems(sessionId, itemIds, msg.meta as DraftMetaRecord | undefined)
          sendResponse({ ok: true })
          break
        }
        case AI_AUTO_SELECT_DRAFT_CLEAR_SESSION: {
          const sessionId = msg.sessionId as string | undefined
          if (!sessionId) {
            sendResponse({ ok: false, error: 'missing sessionId' })
            break
          }
          await clearDraftSession(sessionId)
          sendResponse({ ok: true })
          break
        }
        case AI_AUTO_SELECT_DRAFT_LIST: {
          const sessions = await listAllDraftMeta()
          sendResponse({ ok: true, sessions })
          break
        }
        case AI_AUTO_SELECT_DRAFT_CLEAR_FINISHED: {
          const statuses = msg.statuses as string[] | undefined
          if (!Array.isArray(statuses)) {
            sendResponse({ ok: false, error: 'invalid statuses' })
            break
          }
          const clearedCount = await clearSessionsByStatus(statuses)
          sendResponse({ ok: true, clearedCount })
          break
        }
        case AI_AUTO_SELECT_DRAFT_HEARTBEAT: {
          const sessionId = msg.sessionId as string | undefined
          if (!sessionId) {
            sendResponse({ ok: false, error: 'missing sessionId' })
            break
          }
          const ok = await touchSessionHeartbeat(sessionId)
          sendResponse({ ok })
          break
        }
        case AI_AUTO_SELECT_DRAFT_RECONCILE_STALE: {
          const staleMs = Number(msg.staleMs)
          if (!Number.isFinite(staleMs) || staleMs <= 0) {
            sendResponse({ ok: false, error: 'invalid staleMs' })
            break
          }
          const reconciledCount = await reconcileStaleInterruptedSessions(staleMs)
          sendResponse({ ok: true, reconciledCount })
          break
        }
        case AI_AUTO_SELECT_DRAFT_CLEAR_EXPIRED: {
          const olderThanMs = Number(msg.olderThanMs)
          if (!Number.isFinite(olderThanMs) || olderThanMs <= 0) {
            sendResponse({ ok: false, error: 'invalid olderThanMs' })
            break
          }
          const clearedCount = await clearExpiredSessions(olderThanMs)
          sendResponse({ ok: true, clearedCount })
          break
        }
        default:
          sendResponse({ ok: false, error: 'unknown draft message' })
      }
    } catch (error) {
      console.error('[aiAutoSelect] draft IDB handler error:', error)
      sendResponse({ ok: false, error: (error as Error)?.message || 'draft storage error' })
    }
  })()

  return true
}

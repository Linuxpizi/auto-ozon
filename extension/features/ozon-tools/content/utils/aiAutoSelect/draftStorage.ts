import { getExtensionRuntime } from '../../../utils/runtime'
import type {
  AiAutoSelectConfig,
  AiAutoSelectDraft,
  AiAutoSelectDraftItem,
  AutoSelectCardStatus,
  RunnerStatus,
} from './types'
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
  type DraftMetaRecord,
  type DraftStorageResponse,
} from './draftStorageMessages'
import { assignTabSessionId, createSessionId } from './tabSession'
import { CARD_STATUS_LABELS, createDraftItemId, DRAFT_STORAGE_KEY, normalizeAiAutoSelectConfig, UNLIMITED_CATEGORY } from './types'

export type AiAutoSelectTaskSummary = {
  sessionId: string
  status: RunnerStatus
  collectedCount: number
  targetCount: number
  displayName: string
  /** 已结束任务：可查看历史记录 */
  selectable: boolean
  /** 采集中/已暂停：可跳转落地页续采 */
  resumable: boolean
  updatedAt: number
}

export const ENDED_RUNNER_STATUSES: RunnerStatus[] = ['finished', 'stopped', 'error']

/** 采集 runner 心跳间隔（毫秒） */
export const RUNNER_HEARTBEAT_INTERVAL_MS = 5000

/** 超过该时长无心跳则视为意外中断（毫秒） */
export const RUNNER_HEARTBEAT_STALE_MS = 10000

/** 本地选品任务记录保留时长（毫秒），超过后自动清除 */
export const DRAFT_TASK_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

export const ACTIVE_RUNNER_STATUSES: RunnerStatus[] = ['collecting', 'paused']

export const RUNNER_STATUS_LABELS: Record<RunnerStatus, string> = {
  idle: '待开始',
  collecting: '采集中',
  paused: '已暂停',
  stopped: '已停止',
  finished: '已完成',
  error: '异常',
}

/** 不限类目任务名追加 sessionId 末 8 位，便于区分并行任务 */
export function formatTaskDisplayName(category: string, sessionId: string): string {
  if (category && category !== UNLIMITED_CATEGORY) return category
  const compact = sessionId.replace(/-/g, '')
  const suffix = compact.slice(-8) || sessionId.slice(-8)
  return `${UNLIMITED_CATEGORY}-${suffix}`
}

/** 未完成采集且可续采的状态（含心跳超时后被标记为 stopped 的任务；0 件也可续采） */
export function canResumeCollection(status: RunnerStatus, collectedCount: number, targetCount: number): boolean {
  if (collectedCount >= targetCount) return false
  return status === 'collecting' || status === 'paused' || status === 'stopped'
}

/** 续采/意外恢复判定用状态 */
export function isDraftResumableStatus(status: RunnerStatus | undefined): boolean {
  return status === 'collecting' || status === 'paused' || status === 'stopped'
}

function metaToTaskSummary(meta: DraftMetaRecord): AiAutoSelectTaskSummary | null {
  const config = normalizeAiAutoSelectConfig((meta.config ?? {}) as Partial<AiAutoSelectConfig>)
  const status = (meta.status ?? 'idle') as RunnerStatus
  const collectedCount = meta.collectedCount ?? 0
  if (collectedCount <= 0 && status === 'idle') return null
  const resumable = canResumeCollection(status, collectedCount, config.targetCount)
  const selectable = ENDED_RUNNER_STATUSES.includes(status) || resumable
  return {
    sessionId: meta.id,
    status,
    collectedCount,
    targetCount: config.targetCount,
    displayName: formatTaskDisplayName(config.category, meta.id),
    selectable,
    resumable,
    updatedAt: meta.updatedAt ?? 0,
  }
}

type LegacyDraftItemV1 = Omit<AiAutoSelectDraftItem, 'id' | 'cardStatus' | 'needsManualEdit' | 'mainImageUrl' | 'listMetrics' | 'editState'>

type LegacyDraftV1 = {
  version: 1
  pageUrl: string
  config: AiAutoSelectConfig
  status: RunnerStatus
  collectedCount: number
  items: LegacyDraftItemV1[]
  updatedAt: number
}

const migratedLocalStorageSessions = new Set<string>()

function pickMainImageFromTransformed(item: LegacyDraftItemV1 | AiAutoSelectDraftItem): string {
  const imgs = item.transformed?.global_data?.media_gallery?.main_images
  if (Array.isArray(imgs) && imgs[0]) return imgs[0]
  return ''
}

function migrateItem(raw: LegacyDraftItemV1): AiAutoSelectDraftItem {
  return {
    id: createDraftItemId(),
    offerId: raw.offerId,
    title: raw.title,
    listPrice: raw.listPrice,
    detailUrl: raw.detailUrl,
    mainImageUrl: pickMainImageFromTransformed(raw),
    cardStatus: 'waiting_ai',
    needsManualEdit: false,
    transformed: raw.transformed,
    collectedAt: raw.collectedAt,
  }
}

function normalizeDraftItem(item: AiAutoSelectDraftItem): AiAutoSelectDraftItem {
  let cardStatus = item.cardStatus
  let inCollectBox = item.inCollectBox ?? false
  let isListed = item.isListed ?? false
  const legacyStatus = cardStatus as string
  if (legacyStatus === 'in_collect_box') {
    inCollectBox = true
    cardStatus = 'ai_success'
  } else if (legacyStatus === 'listed') {
    isListed = true
    cardStatus = 'ai_success'
  }
  return { ...item, cardStatus, inCollectBox, isListed }
}

function resolveSeenOfferIds(items: AiAutoSelectDraftItem[], seenOfferIds?: string[]): string[] {
  if (Array.isArray(seenOfferIds) && seenOfferIds.length > 0) {
    return [...seenOfferIds]
  }
  return items.map((item) => item.offerId)
}

function resolveDraftSessionId(parsed: Record<string, unknown>, fallbackSessionId: string): string {
  const fromDraft = parsed.sessionId
  if (typeof fromDraft === 'string' && fromDraft) return fromDraft
  const fromId = parsed.id
  if (typeof fromId === 'string' && fromId && fromId !== 'current') return fromId
  return fallbackSessionId
}

export function normalizeDraft(
  parsed: LegacyDraftV1 | AiAutoSelectDraft | Record<string, unknown>,
  fallbackSessionId?: string,
): AiAutoSelectDraft | null {
  const itemsRaw = (parsed as AiAutoSelectDraft).items
  if (!Array.isArray(itemsRaw)) return null
  const sessionId = resolveDraftSessionId(parsed as Record<string, unknown>, fallbackSessionId ?? createSessionId())
  const pageUrl = typeof (parsed as AiAutoSelectDraft).pageUrl === 'string' ? (parsed as AiAutoSelectDraft).pageUrl : ''
  const parsedVersion = (parsed as { version?: number }).version
  if (parsedVersion === 2 || parsedVersion === undefined) {
    const draft = parsed as AiAutoSelectDraft
    const items = itemsRaw.map((item) => normalizeDraftItem(item))
    return {
      ...draft,
      version: 2,
      sessionId,
      pageUrl,
      config: normalizeAiAutoSelectConfig(draft.config),
      items,
      seenOfferIds: resolveSeenOfferIds(items, draft.seenOfferIds),
    }
  }
  if ((parsed as LegacyDraftV1).version === 1) {
    const legacy = parsed as LegacyDraftV1
    const items = legacy.items.map((item) => {
      const migrated = migrateItem(item)
      const merged = (item as AiAutoSelectDraftItem).id
        ? { ...migrated, ...(item as AiAutoSelectDraftItem) }
        : migrated
      return normalizeDraftItem(merged)
    })
    return {
      sessionId,
      version: 2,
      pageUrl: legacy.pageUrl,
      config: normalizeAiAutoSelectConfig(legacy.config),
      status: legacy.status,
      collectedCount: legacy.collectedCount ?? items.length,
      items,
      seenOfferIds: resolveSeenOfferIds(items),
      updatedAt: legacy.updatedAt ?? Date.now(),
    }
  }
  return null
}

function normalizeCollectedCount(draft: AiAutoSelectDraft): number {
  return Math.max(draft.collectedCount ?? 0, draft.items.length)
}

export function extractDraftMeta(draft: AiAutoSelectDraft): DraftMetaRecord {
  return {
    id: draft.sessionId,
    version: 2,
    pageUrl: draft.pageUrl,
    config: draft.config,
    status: draft.status,
    collectedCount: normalizeCollectedCount(draft),
    seenOfferIds: draft.seenOfferIds ? [...draft.seenOfferIds] : undefined,
    scannedOfferIds: draft.scannedOfferIds ? [...draft.scannedOfferIds] : undefined,
    updatedAt: draft.updatedAt ?? Date.now(),
  }
}

async function sendDraftMessage(payload: Record<string, unknown>): Promise<DraftStorageResponse> {
  const runtime = getExtensionRuntime()
  if (!runtime?.sendMessage) {
    return { ok: false, error: 'extension runtime unavailable' }
  }
  return new Promise((resolve) => {
    runtime.sendMessage!(payload, (response: DraftStorageResponse | undefined) => {
      if (runtime.lastError?.message) {
        resolve({ ok: false, error: runtime.lastError.message })
        return
      }
      resolve(response ?? { ok: false, error: 'empty response' })
    })
  })
}

async function migrateFromLocalStorageIfNeeded(sessionId: string): Promise<void> {
  if (migratedLocalStorageSessions.has(sessionId)) return
  migratedLocalStorageSessions.add(sessionId)
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as LegacyDraftV1 | AiAutoSelectDraft
    const draft = normalizeDraft(parsed, sessionId)
    if (!draft) return
    const saved = await saveDraft(draft)
    if (saved) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('[aiAutoSelect] migrateFromLocalStorage failed:', error)
  }
}

export function rememberSeenOfferIds(draft: AiAutoSelectDraft, offerIds: string[]): AiAutoSelectDraft {
  if (!offerIds.length) return draft
  const seen = new Set(draft.seenOfferIds ?? draft.items.map((i) => i.offerId))
  offerIds.forEach((id) => seen.add(id))
  return { ...draft, seenOfferIds: [...seen] }
}

export async function readDraft(sessionId: string): Promise<AiAutoSelectDraft | null> {
  if (!sessionId) return null
  await migrateFromLocalStorageIfNeeded(sessionId)
  try {
    const res = await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_READ, sessionId })
    if (!res.ok || !res.draft) return null
    return normalizeDraft(res.draft as Record<string, unknown>, sessionId)
  } catch (error) {
    console.warn('[aiAutoSelect] readDraft failed:', error)
    return null
  }
}

/** 当前 Tab 无草稿时尝试认领 v1 迁移遗留会话 */
export async function resolveTabDraft(sessionId: string, pageUrl: string): Promise<AiAutoSelectDraft | null> {
  const current = await readDraft(sessionId)
  if (current) return current
  const legacy = await readDraft(LEGACY_MIGRATED_SESSION_ID)
  if (!legacy) return null
  const allowCrossStore = legacy.config.storeCollectEnabled
  if (!allowCrossStore && legacy.pageUrl !== pageUrl) return null
  await assignTabSessionId(LEGACY_MIGRATED_SESSION_ID)
  return legacy
}

export const LEGACY_MIGRATED_SESSION_ID = 'legacy_migrated'

export async function saveDraft(draft: AiAutoSelectDraft): Promise<boolean> {
  try {
    draft.updatedAt = Date.now()
    draft.version = 2
    draft.collectedCount = normalizeCollectedCount(draft)
    const res = await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_SAVE_FULL, draft })
    if (!res.ok) {
      console.error('[aiAutoSelect] saveDraft failed:', res.error)
    }
    return res.ok
  } catch (error) {
    console.error('[aiAutoSelect] saveDraft failed:', error)
    return false
  }
}

export async function appendAndSaveDraftItem(draft: AiAutoSelectDraft, item: AiAutoSelectDraftItem): Promise<boolean> {
  try {
    const meta = extractDraftMeta(draft)
    const res = await sendDraftMessage({
      type: AI_AUTO_SELECT_DRAFT_PUT_ITEM,
      item: { ...item, sessionId: draft.sessionId },
      meta,
    })
    if (!res.ok) {
      console.error('[aiAutoSelect] appendAndSaveDraftItem failed:', res.error)
    }
    return res.ok
  } catch (error) {
    console.error('[aiAutoSelect] appendAndSaveDraftItem failed:', error)
    return false
  }
}

export async function deleteDraftItemsFromStorage(draft: AiAutoSelectDraft, itemIds: string[]): Promise<boolean> {
  if (!itemIds.length) return true
  try {
    const meta = extractDraftMeta(draft)
    const res = await sendDraftMessage({
      type: AI_AUTO_SELECT_DRAFT_DELETE_ITEMS,
      sessionId: draft.sessionId,
      itemIds,
      meta,
    })
    return res.ok
  } catch (error) {
    console.error('[aiAutoSelect] deleteDraftItemsFromStorage failed:', error)
    return false
  }
}

export async function clearDraft(sessionId: string): Promise<void> {
  if (!sessionId) return
  try {
    await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_CLEAR_SESSION, sessionId })
  } catch (error) {
    console.warn('[aiAutoSelect] clearDraft failed:', error)
  }
}

export function createEmptyDraft(pageUrl: string, config: AiAutoSelectConfig, sessionId: string): AiAutoSelectDraft {
  return {
    sessionId,
    version: 2,
    pageUrl,
    config,
    status: 'idle',
    collectedCount: 0,
    items: [],
    updatedAt: Date.now(),
  }
}

export function appendDraftItem(draft: AiAutoSelectDraft, item: AiAutoSelectDraftItem, status: RunnerStatus): AiAutoSelectDraft {
  return {
    ...draft,
    items: [...draft.items, item],
    collectedCount: normalizeCollectedCount(draft) + 1,
    status,
    updatedAt: Date.now(),
  }
}

export function updateDraftStatus(draft: AiAutoSelectDraft, status: RunnerStatus): AiAutoSelectDraft {
  return { ...draft, status, updatedAt: Date.now() }
}

export function updateDraftItem(draft: AiAutoSelectDraft, itemId: string, patch: Partial<AiAutoSelectDraftItem>): AiAutoSelectDraft {
  const items = draft.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
  return { ...draft, items, updatedAt: Date.now() }
}

export function updateDraftItems(draft: AiAutoSelectDraft, itemIds: string[], patch: Partial<AiAutoSelectDraftItem>): AiAutoSelectDraft {
  const idSet = new Set(itemIds)
  const items = draft.items.map((item) => (idSet.has(item.id) ? { ...item, ...patch } : item))
  return { ...draft, items, updatedAt: Date.now() }
}

export function removeDraftItems(draft: AiAutoSelectDraft, itemIds: string[]): AiAutoSelectDraft {
  const idSet = new Set(itemIds)
  const items = draft.items.filter((item) => !idSet.has(item.id))
  return { ...draft, items, updatedAt: Date.now() }
}

export function isResumableDraft(draft: AiAutoSelectDraft | null, pageUrl: string, sessionId: string): boolean {
  if (!draft || draft.sessionId !== sessionId) return false
  if (!isDraftResumableStatus(draft.status)) return false
  const isStoreCrossPage = draft.config.storeCollectEnabled && ACTIVE_RUNNER_STATUSES.includes(draft.status)
  if (!isStoreCrossPage && draft.pageUrl !== pageUrl && draft.status !== 'stopped') return false
  return true
}

export function hasDraftRecords(draft: AiAutoSelectDraft | null, pageUrl: string, sessionId: string): boolean {
  if (!draft || draft.sessionId !== sessionId) return false
  const allowCrossStore = draft.config.storeCollectEnabled
  if (!allowCrossStore && draft.pageUrl !== pageUrl) return false
  return (draft.items?.length ?? 0) > 0
}

export function getCardStatusLabel(status: AutoSelectCardStatus): string {
  return CARD_STATUS_LABELS[status] ?? status
}

/** 列出所有可展示的选品任务（meta 级，不含 items 详情） */
export async function listDraftTasks(): Promise<AiAutoSelectTaskSummary[]> {
  try {
    const res = await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_LIST })
    if (!res.ok || !Array.isArray(res.sessions)) return []
    return res.sessions
      .map((meta) => metaToTaskSummary(meta))
      .filter((task): task is AiAutoSelectTaskSummary => task != null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (error) {
    console.warn('[aiAutoSelect] listDraftTasks failed:', error)
    return []
  }
}

/** 采集 runner 存活心跳：写入扩展域 meta.lastHeartbeatAt */
export async function touchSessionHeartbeat(sessionId: string): Promise<void> {
  if (!sessionId) return
  try {
    await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_HEARTBEAT, sessionId })
  } catch (error) {
    console.warn('[aiAutoSelect] touchSessionHeartbeat failed:', error)
  }
}

/**
 * 将无心跳的进行中任务标记为 stopped（意外中断）。
 * 打开任务恢复弹窗前调用，避免 collecting/paused 永久残留。
 */
export async function reconcileStaleInterruptedSessions(staleMs = RUNNER_HEARTBEAT_STALE_MS): Promise<number> {
  try {
    const res = await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_RECONCILE_STALE, staleMs })
    if (!res.ok) return 0
    return res.reconciledCount ?? 0
  } catch (error) {
    console.warn('[aiAutoSelect] reconcileStaleInterruptedSessions failed:', error)
    return 0
  }
}

/** 清除 updatedAt 超过保留时长的任务记录，返回清除数量 */
export async function clearExpiredDraftSessions(olderThanMs = DRAFT_TASK_RETENTION_MS): Promise<number> {
  try {
    const res = await sendDraftMessage({ type: AI_AUTO_SELECT_DRAFT_CLEAR_EXPIRED, olderThanMs })
    if (!res.ok) return 0
    return res.clearedCount ?? 0
  } catch (error) {
    console.warn('[aiAutoSelect] clearExpiredDraftSessions failed:', error)
    return 0
  }
}

/** 批量清除已结束任务，返回清除数量 */
export async function clearFinishedDraftSessions(): Promise<number> {
  try {
    const res = await sendDraftMessage({
      type: AI_AUTO_SELECT_DRAFT_CLEAR_FINISHED,
      statuses: ENDED_RUNNER_STATUSES,
    })
    if (!res.ok) return 0
    return res.clearedCount ?? 0
  } catch (error) {
    console.warn('[aiAutoSelect] clearFinishedDraftSessions failed:', error)
    return 0
  }
}

import {
  enrichTransformedDataWithImageLists,
  extractTitleFromRawData,
  transformCollectedRawData,
  type TransformedGoodsData,
} from '../collectedGoodsTransform'
import {
  appendAndSaveDraftItem,
  appendDraftItem,
  clearDraft,
  createEmptyDraft,
  readDraft,
  rememberSeenOfferIds,
  RUNNER_HEARTBEAT_INTERVAL_MS,
  saveDraft,
  touchSessionHeartbeat,
  updateDraftStatus,
  isDraftResumableStatus,
} from './draftStorage'
import {
  ensureSearchListFullyLoaded,
  goNextPage,
  hasNextPage,
  isScrollLoadMode,
  passesFilter,
  scanCurrentPageItems,
  scrollListToTop,
  scrollLoadMore,
} from './listPageScanner'
import {
  fetch1688DetailHtml,
  fetch1688OfferDetailImages,
  parse1688ContextFromHtml,
} from './fetch1688Detail'
import { savePendingAutoSelectConfig } from './pendingConfigStorage'
import { is1688WwwHost, isCurrentCategorySearchPage } from './categorySearchUrl'
import {
  goShopNextPage,
  hasShopNextPage,
  scanShopPageItems,
} from './shopListPageScanner'
import { getRemainingStoreLinks } from './storeCollectUrl'
import type { AiAutoSelectConfig, AiAutoSelectDraft, AiAutoSelectDraftItem, RunnerStatus } from './types'
import { UNLIMITED_CATEGORY, createDraftItemId, mergeDraftItemOutcome } from './types'

export type RunnerCallbacks = {
  onDraftUpdate: (draft: AiAutoSelectDraft) => void
  onStatusChange?: (status: RunnerStatus) => void
  onError?: (message: string) => void
  /** 1688 详情解析失败（通常为人机验证页），需暂停采集并引导用户验证 */
  onCaptchaRequired?: (detailUrl: string) => void
}

let draft: AiAutoSelectDraft | null = null
let activeSessionId: string | null = null
let stopped = false
let paused = false
let running = false
let pauseResolvers: Array<() => void> = []
let persistErrorNotified = false
let captchaNotified = false
const processedOfferIds = new Set<string>()
const scannedOfferIds = new Set<string>()
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function stopSessionHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/** runner 存活期间定期写入 meta.lastHeartbeatAt，供意外中断检测 */
function startSessionHeartbeat(sessionId: string): void {
  stopSessionHeartbeat()
  const tick = () => { void touchSessionHeartbeat(sessionId) }
  void tick()
  heartbeatTimer = setInterval(tick, RUNNER_HEARTBEAT_INTERVAL_MS)
}

type FetchOfferResult =
  | { ok: true; transformed: TransformedGoodsData; detailUrl: string }
  | { ok: false; reason: 'captcha'; detailUrl: string }
  | { ok: false; reason: 'failed' }

type DelayTier = { upTo: number; minMs: number; maxMs: number }

// 按已采集数升序匹配，upTo 为该档上限（含）；采集越久间隔越长，兼顾体感与风控
const ITEM_DELAY_TIERS: DelayTier[] = [
  { upTo: 3, minMs: 3 * 1000, maxMs: 6 * 1000 },
  { upTo: 10, minMs: 5 * 1000, maxMs: 10 * 1000 },
  { upTo: 30, minMs: 10 * 1000, maxMs: 15 * 1000 },
  { upTo: 50, minMs: 15 * 1000, maxMs: 20 * 1000 },
  { upTo: Infinity, minMs: 20 * 1000, maxMs: 30 * 1000 },
]

// 每次详情请求（成功/失败）后按已采集数匹配阶梯等待；列表过滤与已处理跳过不触发等待
function resolveItemDelayMs(collectedCount: number): number {
  const tier = ITEM_DELAY_TIERS.find((t) => collectedCount <= t.upTo) ?? ITEM_DELAY_TIERS[ITEM_DELAY_TIERS.length - 1]
  return tier.minMs + Math.floor(Math.random() * (tier.maxMs - tier.minMs))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitIfPaused(): Promise<void> {
  while (paused && !stopped) {
    await new Promise<void>((resolve) => {
      pauseResolvers.push(resolve)
    })
  }
}

/** 通知状态
 * @param status 状态
 * @param callbacks 回调
 * 通知状态，返回通知状态
 * 使用 updateDraftStatus 更新草稿状态
 * 使用 callbacks.onDraftUpdate 通知草稿更新
 * 使用 callbacks.onStatusChange 通知状态更新
 */
function notifyStatus(status: RunnerStatus, callbacks: RunnerCallbacks) {
  if (draft) {
    draft = updateDraftStatus(draft, status)
    callbacks.onDraftUpdate(draft)
  }
  callbacks.onStatusChange?.(status)
}

/** 恢复暂停等待者
 * @returns 恢复暂停等待者
 * 恢复暂停等待者，返回恢复暂停等待者
 * 使用 pauseResolvers.splice(0) 获取暂停等待者列表
 * 遍历暂停等待者列表，调用每个等待者的 resolve 方法
 */
function resumePauseWaiters() {
  const list = pauseResolvers.splice(0)
  list.forEach((r) => r())
}

/** 合并草稿项补丁
 * @param existing 现有草稿项
 * @param patch 补丁
 * @returns 合并草稿项补丁
 * 合并草稿项补丁，返回合并草稿项补丁
 * 使用 existing 合并 patch
 * 使用 existing.transformed 合并 patch.transformed
 */
function mergeDraftItemPatch(
  existing: AiAutoSelectDraftItem,
  patch: Partial<AiAutoSelectDraftItem>,
): AiAutoSelectDraftItem {
  return {
    ...existing,
    ...patch,
    transformed: patch.transformed ?? existing.transformed,
    editState: patch.editState
      ? { ...existing.editState, ...patch.editState }
      : existing.editState,
  }
}

export function bindRunnerSession(sessionId: string): void {
  activeSessionId = sessionId
}

export function getRunnerSessionId(): string | null {
  return activeSessionId
}

/** 外部编辑（结果页 AI 帮填等）回写时同步 Runner 内存草稿 */
export function patchRunnerDraftItem(
  itemId: string,
  patch: Partial<AiAutoSelectDraftItem>,
): void {
  if (!draft) return
  const idx = draft.items.findIndex((i) => i.id === itemId)
  if (idx < 0) return
  draft.items[idx] = mergeDraftItemPatch(draft.items[idx], patch)
}

function seedProcessedOfferIdsFromDraft(target: AiAutoSelectDraft | null): void {
  processedOfferIds.clear()
  if (!target) return
  const seen = target.seenOfferIds?.length
    ? target.seenOfferIds
    : target.items.map((i) => i.offerId)
  seen.forEach((id) => processedOfferIds.add(id))
}

function seedScannedOfferIdsFromDraft(target: AiAutoSelectDraft | null): void {
  scannedOfferIds.clear()
  if (!target?.scannedOfferIds?.length) return
  target.scannedOfferIds.forEach((id) => scannedOfferIds.add(id))
}

/** 记录列表页已扫描商品（含未通过筛选的），供空结果提示扫描量 */
function rememberScannedOfferId(offerId: string): void {
  if (scannedOfferIds.has(offerId)) return
  scannedOfferIds.add(offerId)
  if (!draft) return
  draft = {
    ...draft,
    scannedOfferIds: [...(draft.scannedOfferIds ?? []), offerId],
  }
}

function rememberProcessedOfferId(offerId: string): void {
  processedOfferIds.add(offerId)
  if (!draft) return
  draft = rememberSeenOfferIds(draft, [offerId])
}

function unrememberProcessedOfferId(offerId: string): void {
  processedOfferIds.delete(offerId)
  if (!draft?.seenOfferIds?.length) return
  draft = {
    ...draft,
    seenOfferIds: draft.seenOfferIds.filter((id) => id !== offerId),
  }
}

function mergeSeenOfferIds(
  storedIds: string[] | undefined,
  memoryIds: string[] | undefined,
): string[] {
  return [...new Set([...(storedIds ?? []), ...(memoryIds ?? [])])]
}

async function syncDraftFromStorageIfNewer(): Promise<void> {
  if (!draft || !activeSessionId) return
  const stored = await readDraft(activeSessionId)
  if (!stored || stored.sessionId !== draft.sessionId) return
  const storedById = new Map(stored.items.map((item) => [item.id, item]))
  const runnerById = new Map(draft.items.map((item) => [item.id, item]))
  if (stored.updatedAt > (draft.updatedAt ?? 0)) {
    const storedIds = new Set(stored.items.map((i) => i.id))
    const runnerOnlyItems = draft.items.filter((i) => !storedIds.has(i.id))
    // 存储较新时以存储条目为主，并与 Runner 同 id 条目合并 outcome
    draft.items = [
      ...stored.items.map((storedItem) => mergeDraftItemOutcome(storedItem, runnerById.get(storedItem.id) ?? storedItem)),
      ...runnerOnlyItems,
    ]
    draft.collectedCount = Math.max(stored.collectedCount ?? 0, draft.collectedCount ?? 0, draft.items.length)
    draft.seenOfferIds = mergeSeenOfferIds(stored.seenOfferIds, draft.seenOfferIds)
    draft.scannedOfferIds = mergeSeenOfferIds(stored.scannedOfferIds, draft.scannedOfferIds)
    draft.updatedAt = Math.max(stored.updatedAt, draft.updatedAt ?? 0)
    return
  }
  // Runner 较新：从存储合并 outcome，避免 persistRunnerDraft 覆盖 IndexedDB 中的已上架/已入采集箱
  draft.items = draft.items.map((runnerItem) => mergeDraftItemOutcome(storedById.get(runnerItem.id), runnerItem))
}

async function persistRunnerDraft(): Promise<boolean> {
  if (!draft) return false
  await syncDraftFromStorageIfNewer()
  return saveDraft(draft)
}

async function persistNewDraftItem(item: AiAutoSelectDraftItem): Promise<boolean> {
  if (!draft) return false
  await syncDraftFromStorageIfNewer()
  return appendAndSaveDraftItem(draft, item)
}

function handlePersistFailure(callbacks: RunnerCallbacks): void {
  if (persistErrorNotified) return
  persistErrorNotified = true
  if (running && !paused) {
    paused = true
    notifyStatus('paused', callbacks)
  }
  callbacks.onError?.('草稿保存失败，请减少选品数量或清理浏览器存储')
}

function handleCaptchaRequired(callbacks: RunnerCallbacks, detailUrl: string): void {
  if (running && !paused) {
    paused = true
    notifyStatus('paused', callbacks)
    if (draft) void persistRunnerDraft()
  }
  if (captchaNotified) return
  captchaNotified = true
  callbacks.onCaptchaRequired?.(detailUrl)
}

export function getRunnerDraft(): AiAutoSelectDraft | null {
  return draft
}

export function setRunnerDraft(existing: AiAutoSelectDraft | null): void {
  draft = existing
  if (existing?.sessionId) {
    activeSessionId = existing.sessionId
  }
  seedProcessedOfferIdsFromDraft(existing)
  seedScannedOfferIdsFromDraft(existing)
}

export function removeRunnerDraftItems(itemIds: string[]): void {
  if (!draft || !itemIds.length) return
  const idSet = new Set(itemIds)
  draft.items = draft.items.filter((item) => !idSet.has(item.id))
}

export function isRunnerActive(): boolean {
  return running && !stopped
}

export function pauseRunner(callbacks: RunnerCallbacks): void {
  if (!running || paused) return
  paused = true
  notifyStatus('paused', callbacks)
  if (draft) void persistRunnerDraft()
}

export function resumeRunner(callbacks: RunnerCallbacks): void {
  if (!running || !paused) return
  paused = false
  captchaNotified = false
  notifyStatus('collecting', callbacks)
  resumePauseWaiters()
}

export function stopRunner(callbacks: RunnerCallbacks): void {
  stopped = true
  paused = false
  resumePauseWaiters()
  if (draft) {
    draft = updateDraftStatus(draft, 'stopped')
    void persistRunnerDraft().then(() => {
      callbacks.onDraftUpdate(draft!)
      callbacks.onStatusChange?.('stopped')
    })
  }
}

async function fetchAndTransformOffer(
  offerId: string,
  titleFallback: string,
): Promise<FetchOfferResult> {
  const detailUrl = `https://detail.1688.com/offer/${offerId}.html?offerId=${offerId}`
  const html = await fetch1688DetailHtml(offerId)
  if (!html) {
    return { ok: false, reason: 'failed' }
  }
  const context = parse1688ContextFromHtml(html)
  if (!context) {
    console.warn('[aiAutoSelect] context parse failed', offerId)
    return { ok: false, reason: 'captcha', detailUrl }
  }

  const raw = { source: 'context' as const, data: context }
  const title = extractTitleFromRawData(raw) || titleFallback
  const detailImageUrls = await fetch1688OfferDetailImages(html)
  const transformed = transformCollectedRawData(raw, title, {
    sourceUrl: detailUrl,
    collectDetailImages: () => detailImageUrls,
  })

  if (!transformed) return { ok: false, reason: 'failed' }
  enrichTransformedDataWithImageLists(transformed)
  return { ok: true, transformed, detailUrl }
}

/** 本店无更多商品时跳转下一店铺，同标签续采 */
async function tryNavigateToNextStore(
  config: AiAutoSelectConfig,
  callbacks: RunnerCallbacks,
): Promise<boolean> {
  if (!config.storeCollectEnabled || !draft || !activeSessionId) return false
  if (draft.collectedCount >= config.targetCount) return false
  const remaining = getRemainingStoreLinks(config, window.location.href)
  if (!remaining.length) return false

  const nextConfig = { ...config, storeLinks: remaining }
  await savePendingAutoSelectConfig(nextConfig, { sessionId: activeSessionId, autoStart: true })
  draft = updateDraftStatus(draft, 'collecting')
  draft.pageUrl = window.location.href
  await persistRunnerDraft()
  callbacks.onDraftUpdate(draft)
  window.location.href = remaining[0]
  return true
}

export async function startRunner(
  config: AiAutoSelectConfig,
  callbacks: RunnerCallbacks,
  resumeFrom?: AiAutoSelectDraft | null,
): Promise<void> {
  if (running) return
  const sessionId = resumeFrom?.sessionId ?? activeSessionId
  if (!sessionId) return
  bindRunnerSession(sessionId)
  startSessionHeartbeat(sessionId)

  running = true
  stopped = false
  paused = false
  persistErrorNotified = false
  captchaNotified = false
  const pageUrl = window.location.href
  const isShopMode = config.storeCollectEnabled
  const isInterrupted = isDraftResumableStatus(resumeFrom?.status)
  // 续采：同页、店铺跨域、类目搜索页或不限类目主站均可恢复已采数据
  const canResume = Boolean(resumeFrom && isInterrupted && (
    resumeFrom.pageUrl === pageUrl
    || (isShopMode && resumeFrom.config.storeCollectEnabled)
    || (resumeFrom.config.category === UNLIMITED_CATEGORY && is1688WwwHost())
    || isCurrentCategorySearchPage(resumeFrom.config.category)
  ))

  if (canResume && resumeFrom) {
    draft = { ...resumeFrom, config, status: 'collecting', pageUrl, sessionId }
    seedProcessedOfferIdsFromDraft(draft)
    seedScannedOfferIdsFromDraft(draft)
  } else {
    draft = createEmptyDraft(pageUrl, config, sessionId)
    processedOfferIds.clear()
    scannedOfferIds.clear()
  }
  await persistRunnerDraft()
  callbacks.onDraftUpdate(draft)
  notifyStatus('collecting', callbacks)

  if (!resumeFrom && !isShopMode && isScrollLoadMode()) {
    await scrollListToTop()
    if (stopped) return
  }

  let scrollLoadFailCount = 0

  try {
    while (
      draft &&
      draft.collectedCount < config.targetCount &&
      !stopped
    ) {
      await waitIfPaused()
      if (stopped) break

      if (!isShopMode) {
        await ensureSearchListFullyLoaded()
        if (stopped) break
      }

      const items = isShopMode ? await scanShopPageItems() : scanCurrentPageItems()

      for (const item of items) {
        if (stopped) break
        await waitIfPaused()
        if (stopped) break

        if (draft.collectedCount >= config.targetCount) break
        if (processedOfferIds.has(item.offerId)) continue
        rememberScannedOfferId(item.offerId)
        if (!passesFilter(item, config)) continue

        rememberProcessedOfferId(item.offerId)

        try {
          let result = await fetchAndTransformOffer(item.offerId, item.title)
          while (!result.ok && result.reason === 'captcha') {
            unrememberProcessedOfferId(item.offerId)
            handleCaptchaRequired(callbacks, result.detailUrl)
            await waitIfPaused()
            if (stopped) break
            rememberProcessedOfferId(item.offerId)
            result = await fetchAndTransformOffer(item.offerId, item.title)
          }
          if (result.ok && draft) {
            const mainImageUrl =
              item.mainImageUrl ||
              result.transformed.global_data?.media_gallery?.main_images?.[0] ||
              ''
            const draftItem: AiAutoSelectDraftItem = {
              id: createDraftItemId(),
              offerId: item.offerId,
              title: item.title,
              listPrice: item.listPrice,
              detailUrl: result.detailUrl,
              mainImageUrl,
              listMetrics: item.listMetrics,
              cardStatus: 'waiting_ai',
              needsManualEdit: false,
              transformed: result.transformed,
              collectedAt: Date.now(),
            }
            draft = appendDraftItem(draft, draftItem, paused ? 'paused' : 'collecting')
            const saved = await persistNewDraftItem(draftItem)
            if (!saved) {
              handlePersistFailure(callbacks)
            }
            callbacks.onDraftUpdate(draft)
          }
        } catch (err) {
          console.error('[aiAutoSelect] item error', item.offerId, err)
        }

        if (draft.collectedCount >= config.targetCount) break
        if (stopped) break

        await sleep(resolveItemDelayMs(draft.collectedCount))
      }

      if (stopped) break
      if (draft.collectedCount >= config.targetCount) break

      if (isShopMode) {
        if (hasShopNextPage()) {
          const ok = await goShopNextPage()
          if (!ok) {
            if (await tryNavigateToNextStore(config, callbacks)) return
            break
          }
        } else if (await tryNavigateToNextStore(config, callbacks)) {
          return
        } else {
          break
        }
      } else if (hasNextPage()) {
        const ok = await goNextPage()
        if (!ok) break
      } else if (isScrollLoadMode()) {
        const ok = await scrollLoadMore()
        if (!ok) {
          scrollLoadFailCount++
          if (scrollLoadFailCount >= 2) break
        } else {
          scrollLoadFailCount = 0
        }
      } else {
        break
      }
    }

    if (draft && !stopped) {
      draft = updateDraftStatus(draft, 'finished')
      await persistRunnerDraft()
      callbacks.onDraftUpdate(draft)
      callbacks.onStatusChange?.('finished')
    }
  } catch (err) {
    console.error('[aiAutoSelect] runner error', err)
    if (draft) {
      draft = updateDraftStatus(draft, 'error')
      await persistRunnerDraft()
      callbacks.onDraftUpdate(draft)
      callbacks.onStatusChange?.('error')
    }
    callbacks.onError?.((err as Error)?.message || '采集异常')
  } finally {
    stopSessionHeartbeat()
    running = false
    paused = false
  }
}

export function resetRunnerState(): void {
  stopped = true
  paused = false
  running = false
  stopSessionHeartbeat()
  persistErrorNotified = false
  captchaNotified = false
  resumePauseWaiters()
  draft = null
  processedOfferIds.clear()
  scannedOfferIds.clear()
}

/** 开始新采集前清空指定会话草稿与 Runner 内存，不影响其他 Tab 会话 */
export async function resetAutoSelectSession(sessionId: string): Promise<void> {
  await clearDraft(sessionId)
  resetRunnerState()
}

import { isAutoSelectAiFillDone, type AiAutoSelectAiStepConfig, type AiAutoSelectDraftItem } from './types'

// ── 批量 AI 帮填队列 ──────────────────────────────────────────

export type BatchAiFillProcessor = (
  item: AiAutoSelectDraftItem,
  aiStepOverride?: AiAutoSelectAiStepConfig,
) => Promise<Partial<AiAutoSelectDraftItem> | null>

/** 单条帮填处理：成功合并 patch，失败回退 waiting_ai */
async function runOneAiFillItem(
  item: AiAutoSelectDraftItem,
  processor: BatchAiFillProcessor,
  onItemStart: (item: AiAutoSelectDraftItem) => void,
  onItemDone: (item: AiAutoSelectDraftItem) => void,
): Promise<void> {
  onItemStart(item)
  try {
    const patch = await processor(item)
    if (patch) {
      onItemDone({ ...item, ...patch, cardStatus: patch.cardStatus ?? 'ai_success' })
    } else {
      onItemDone({ ...item, cardStatus: 'waiting_ai' })
    }
  } catch (error) {
    console.error('[aiAutoSelect] batchAiFill item failed', item.id, error)
    onItemDone({ ...item, cardStatus: 'waiting_ai' })
  }
}

/** 单线程批量 AI 帮填队列（一次性数组） */
export async function runBatchAiFillQueue(
  items: AiAutoSelectDraftItem[],
  processor: BatchAiFillProcessor,
  onItemStart: (item: AiAutoSelectDraftItem) => void,
  onItemDone: (item: AiAutoSelectDraftItem) => void,
): Promise<void> {
  for (const item of items) {
    if (item.cardStatus === 'ai_processing' || isAutoSelectAiFillDone(item)) continue
    await runOneAiFillItem(item, processor, onItemStart, onItemDone)
  }
}

export type AiFillQueueCallbacks = {
  processor: BatchAiFillProcessor
  onItemStart: (item: AiAutoSelectDraftItem) => void
  onItemDone: (item: AiAutoSelectDraftItem) => void
  onIdle?: () => void
}

export type AiFillQueue = {
  enqueue: (item: AiAutoSelectDraftItem) => void
  enqueueMany: (items: AiAutoSelectDraftItem[]) => void
  isActive: () => boolean
  waitUntilIdle: () => Promise<void>
  dispose: () => void
}

/** 持久化单线程帮填队列：采集即入队，处理完毕出队 */
export function createAiFillQueue(callbacks: AiFillQueueCallbacks): AiFillQueue {
  const pending: AiAutoSelectDraftItem[] = []
  const enqueuedIds = new Set<string>()
  let running = false
  let disposed = false
  const idleResolvers: Array<() => void> = []

  function shouldSkip(item: AiAutoSelectDraftItem): boolean {
    return item.cardStatus === 'ai_processing' || isAutoSelectAiFillDone(item)
  }

  function notifyIdleIfNeeded() {
    if (running || pending.length > 0 || disposed) return
    callbacks.onIdle?.()
    while (idleResolvers.length) {
      idleResolvers.shift()?.()
    }
  }

  async function drain() {
    if (running || disposed) return
    running = true
    try {
      while (pending.length > 0 && !disposed) {
        const item = pending.shift()!
        await runOneAiFillItem(item, callbacks.processor, callbacks.onItemStart, callbacks.onItemDone)
        enqueuedIds.delete(item.id)
        // 单条结束后立即尝试已到期的恢复，不必等整队结束
        await flushDueRecoverAttempts()
      }
    } finally {
      running = false
      notifyIdleIfNeeded()
      // 处理期间可能有新入队，继续 drain
      if (pending.length > 0 && !disposed) {
        void drain()
      }
    }
  }

  function enqueue(item: AiAutoSelectDraftItem) {
    if (disposed) return
    if (enqueuedIds.has(item.id)) return
    if (shouldSkip(item)) return
    enqueuedIds.add(item.id)
    pending.push(item)
    void drain()
  }

  function enqueueMany(items: AiAutoSelectDraftItem[]) {
    for (const item of items) {
      enqueue(item)
    }
  }

  function isActive(): boolean {
    return !disposed && (running || pending.length > 0)
  }

  function waitUntilIdle(): Promise<void> {
    if (!isActive()) return Promise.resolve()
    return new Promise((resolve) => {
      idleResolvers.push(resolve)
    })
  }

  function dispose() {
    disposed = true
    pending.length = 0
    enqueuedIds.clear()
    running = false
    notifyIdleIfNeeded()
  }

  return { enqueue, enqueueMany, isActive, waitUntilIdle, dispose }
}

// ── AI 恢复调度（SSE 失败后按 sessionId 延时重试）────────────────

export type AiRecoverProcessor = (
  item: AiAutoSelectDraftItem,
) => Promise<Partial<AiAutoSelectDraftItem> | null | 'pending'>

export type AiRecoverOnDone = (item: AiAutoSelectDraftItem) => void

/** SSE 末次 getSseResult 失败后首查延时 */
const RECOVER_INITIAL_DELAY_MS = 5_000
/** 后续重试间隔 */
const RECOVER_RETRY_INTERVAL_MS = 10_000
/** 含首查，单条最多尝试次数 */
const MAX_RECOVER_ATTEMPTS = 6
/** 全局 tick：检查到期条目 */
const RECOVER_POLL_TICK_MS = 1_000

type RecoverSchedule = {
  attempt: number
  nextRetryAt: number
}

const recoverSchedules = new Map<string, RecoverSchedule>()
let recoverTimerId: ReturnType<typeof setInterval> | null = null
let processor: AiRecoverProcessor | null = null
let onDone: AiRecoverOnDone | null = null
let onRecoverExhausted: ((item: AiAutoSelectDraftItem) => void) | null = null
let getProcessingItems: (() => AiAutoSelectDraftItem[]) | null = null
let isModalBusyForRecover: (() => boolean) | null = null
let recoverTicking = false

/** 注册恢复依赖（App 启动时调用一次） */
export function configureAiRecoverPoller(options: {
  processor: AiRecoverProcessor
  onDone: AiRecoverOnDone
  getProcessingItems: () => AiAutoSelectDraftItem[]
  onRecoverExhausted?: (item: AiAutoSelectDraftItem) => void
  isModalBusyForRecover?: () => boolean
}) {
  processor = options.processor
  onDone = options.onDone
  onRecoverExhausted = options.onRecoverExhausted ?? null
  getProcessingItems = options.getProcessingItems
  isModalBusyForRecover = options.isModalBusyForRecover ?? null
}

/** SSE 失败后调度单条恢复：首查 5s，之后每 10s 重试 */
export function scheduleAiFillRecover(itemId: string, options?: { resetAttempts?: boolean }) {
  const existing = recoverSchedules.get(itemId)
  if (options?.resetAttempts || !existing) {
    recoverSchedules.set(itemId, {
      attempt: 0,
      nextRetryAt: Date.now() + RECOVER_INITIAL_DELAY_MS,
    })
  }
  ensureRecoverPollerRunning()
}

/** 恢复成功或放弃后取消调度 */
export function cancelAiFillRecover(itemId: string) {
  recoverSchedules.delete(itemId)
  if (recoverSchedules.size === 0) {
    stopRecoverPoller()
  }
}

/** @deprecated 使用 scheduleAiFillRecover */
export function registerAiRecoverPoll(itemId: string) {
  scheduleAiFillRecover(itemId)
}

/** @deprecated 使用 cancelAiFillRecover */
export function unregisterAiRecoverPoll(itemId: string) {
  cancelAiFillRecover(itemId)
}

/** 续采或会话内与草稿 ai_processing 条目对齐 */
export function syncAiRecoverPollWithDraft(
  items: AiAutoSelectDraftItem[],
  options?: { resetAttempts?: boolean },
) {
  const processingItems = items.filter(
    (i) => i.cardStatus === 'ai_processing' && i.aiSessionId,
  )
  const processingIds = new Set(processingItems.map((i) => i.id))
  for (const id of [...recoverSchedules.keys()]) {
    if (!processingIds.has(id)) {
      cancelAiFillRecover(id)
    }
  }
  for (const item of processingItems) {
    scheduleAiFillRecover(item.id, {
      resetAttempts: options?.resetAttempts ?? !recoverSchedules.has(item.id),
    })
  }
  if (recoverSchedules.size === 0) {
    stopRecoverPoller()
  }
}

export function stopAiRecoverPoller() {
  recoverSchedules.clear()
  stopRecoverPoller()
}

function ensureRecoverPollerRunning() {
  if (recoverTimerId != null) return
  void runRecoverPollTick()
  recoverTimerId = setInterval(() => void runRecoverPollTick(), RECOVER_POLL_TICK_MS)
}

function stopRecoverPoller() {
  if (recoverTimerId != null) {
    clearInterval(recoverTimerId)
    recoverTimerId = null
  }
}

function deferRecoverSchedule(schedule: RecoverSchedule) {
  schedule.nextRetryAt = Date.now() + RECOVER_RETRY_INTERVAL_MS
}

/** 处理恢复条目
 * @param item 商品信息
 * @returns 处理恢复条目
 */
async function processRecoverItem(item: AiAutoSelectDraftItem): Promise<void> {
  const schedule = recoverSchedules.get(item.id)
  if (!schedule || !processor) return
  if (Date.now() < schedule.nextRetryAt) return
  // Modal 被其他帮填占用：顺延，不计失败次数
  if (isModalBusyForRecover?.()) {
    deferRecoverSchedule(schedule)
    return
  }
  try {
    const result = await processor(item)
    if (result === 'pending') {
      deferRecoverSchedule(schedule)
      return
    }
    if (result) {
      const merged = {
        ...item,
        ...result,
        cardStatus: (result.cardStatus ?? 'ai_success') as AiAutoSelectDraftItem['cardStatus'],
      }
      onDone?.(merged)
      cancelAiFillRecover(item.id)
      return
    }
    schedule.attempt += 1
    if (schedule.attempt >= MAX_RECOVER_ATTEMPTS) {
      onRecoverExhausted?.(item)
      cancelAiFillRecover(item.id)
      return
    }
    deferRecoverSchedule(schedule)
  } catch (error) {
    console.error('[aiAutoSelect] recover item failed', item.id, error)
    deferRecoverSchedule(schedule)
  }
}

/** 处理所有已到期的恢复条目（队列单条结束间隙调用） */
export async function flushDueRecoverAttempts(): Promise<void> {
  if (!processor || !getProcessingItems || recoverTicking) return
  recoverTicking = true
  try {
    const now = Date.now()
    const dueItems = getProcessingItems().filter((i) => {
      const schedule = recoverSchedules.get(i.id)
      return (
        schedule &&
        i.cardStatus === 'ai_processing' &&
        schedule.nextRetryAt <= now
      )
    })
    for (const item of dueItems) {
      await processRecoverItem(item)
    }
  } finally {
    recoverTicking = false
  }
}

/** 运行恢复轮询 tick
 * @returns 运行恢复轮询 tick
 */
async function runRecoverPollTick() {
  if (recoverTicking || !processor || !getProcessingItems) return
  recoverTicking = true
  try {
    const items = getProcessingItems().filter(
      (i) => recoverSchedules.has(i.id) && i.cardStatus === 'ai_processing',
    )
    for (const item of items) {
      await processRecoverItem(item)
    }
  } finally {
    recoverTicking = false
  }
}

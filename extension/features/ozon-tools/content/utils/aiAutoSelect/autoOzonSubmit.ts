import { runOzonSubmitWithValidation, type ChineseFieldMark, type OzonShopListingResult, type VariantImageCountExceededPayload, type VariantAspectValidationPayload } from '../ozonAiFillAndSubmit'
import { applyListingPriceAdjustToDraftItem, isListingPriceAdjustActive } from './listingPriceAdjust'
import { buildSubmitContextsFromDraftItem } from './productValidation'
import type { AiAutoSelectDraftItem, ListingPriceAdjustConfig, ShopWarehouseInventoryMap } from './types'

export type OzonSubmitHandlers = {
  onValidationFailed?: (msg: string) => void
  onVariantImageCountExceeded?: (item: AiAutoSelectDraftItem, payload: VariantImageCountExceededPayload) => void
  onVariantAspectValidationFailed?: (item: AiAutoSelectDraftItem, payload: VariantAspectValidationPayload) => void
  onChineseBlocked?: (item: AiAutoSelectDraftItem, marks: ChineseFieldMark[]) => void
  onError?: (msg: string) => void
  onItemListed?: (itemId: string) => void | Promise<void>
  /** 单条商品上架失败时回写，供卡片展示失败摘要 */
  onItemListingFailed?: (item: AiAutoSelectDraftItem, failures: Array<{ shopId: number; message: string }>) => void | Promise<void>
  isOzonSubmitReady?: (item: AiAutoSelectDraftItem) => boolean
}

export type OzonSubmitBatchResult = {
  successCount: number
  processedCount: number
  failures: OzonShopListingResult[]
  chineseBlocked: boolean
}

/** 批量将草稿商品上架至 Ozon，供手动选店与全自动流程共用 */
export async function submitDraftItemsToOzon(
  items: AiAutoSelectDraftItem[],
  payload: { selectedShopIds: number[]; shopWarehouseInventory: ShopWarehouseInventoryMap; listingPriceAdjust?: ListingPriceAdjustConfig },
  handlers: OzonSubmitHandlers,
): Promise<OzonSubmitBatchResult> {
  let successCount = 0
  let processedCount = 0
  const failures: OzonShopListingResult[] = []
  let chineseBlocked = false
  const isReady = handlers.isOzonSubmitReady ?? (() => true)
  const shouldAdjustPrice = isListingPriceAdjustActive(payload.listingPriceAdjust)

  for (const item of items) {
    if (!isReady(item)) continue
    if (item.needsManualEdit) continue
    processedCount += 1
    const submitItem = shouldAdjustPrice
      ? applyListingPriceAdjustToDraftItem(item, payload.listingPriceAdjust!)
      : item
    const { validateCtx, submitCtx } = buildSubmitContextsFromDraftItem(submitItem, {
      selectedShopIds: payload.selectedShopIds,
      shopWarehouseInventory: payload.shopWarehouseInventory,
    })
    const result = await runOzonSubmitWithValidation(validateCtx, submitCtx, {
      onValidationFailed: handlers.onValidationFailed,
      onVariantImageCountExceeded: (payload) => {
        handlers.onVariantImageCountExceeded?.(item, payload)
      },
      onVariantAspectValidationFailed: (payload) => {
        handlers.onVariantAspectValidationFailed?.(item, payload)
      },
      onChineseBlocked: (marks) => {
        chineseBlocked = true
        handlers.onChineseBlocked?.(item, marks)
      },
      onError: handlers.onError,
    })
    if (result.status === 'success') {
      successCount += 1
      await handlers.onItemListed?.(item.id)
    } else if (result.status === 'submit_failed') {
      const itemFailures = result.parsed.failures.map((f) => ({ shopId: f.shopId, message: f.message }))
      failures.push(...result.parsed.failures)
      await handlers.onItemListingFailed?.(item, itemFailures)
    } else if (result.status === 'validation_failed' && result.message) {
      const itemFailures = [{ shopId: 0, message: result.message }]
      failures.push({ shopId: 0, message: result.message, success: false })
      await handlers.onItemListingFailed?.(item, itemFailures)
    } else if (result.status === 'error' && result.message) {
      const itemFailures = [{ shopId: 0, message: result.message }]
      failures.push({ shopId: 0, message: result.message, success: false })
      await handlers.onItemListingFailed?.(item, itemFailures)
    } else if (result.status === 'chinese_blocked') {
      break
    }
  }

  return { successCount, processedCount, failures, chineseBlocked }
}

export type OzonAutoQueueCallbacks = {
  processor: (item: AiAutoSelectDraftItem) => Promise<void>
  onIdle?: () => void
}

export type OzonAutoQueue = {
  enqueue: (item: AiAutoSelectDraftItem) => void
  isActive: () => boolean
  dispose: () => void
}

/** 单线程 Ozon 自动上架队列，避免与批量手动上架并发冲突 */
export function createOzonAutoQueue(callbacks: OzonAutoQueueCallbacks): OzonAutoQueue {
  const pending: AiAutoSelectDraftItem[] = []
  const enqueuedIds = new Set<string>()
  let running = false
  let disposed = false

  async function drain() {
    if (running || disposed) return
    running = true
    try {
      while (pending.length > 0 && !disposed) {
        const item = pending.shift()!
        await callbacks.processor(item)
        enqueuedIds.delete(item.id)
      }
    } finally {
      running = false
      if (!disposed && pending.length === 0 && !running) {
        callbacks.onIdle?.()
      }
      if (pending.length > 0 && !disposed) {
        void drain()
      }
    }
  }

  function enqueue(item: AiAutoSelectDraftItem) {
    if (disposed || enqueuedIds.has(item.id) || item.isListed) return
    enqueuedIds.add(item.id)
    pending.push(item)
    void drain()
  }

  function isActive() {
    return !disposed && (running || pending.length > 0)
  }

  function dispose() {
    disposed = true
    pending.length = 0
    enqueuedIds.clear()
    running = false
  }

  return { enqueue, isActive, dispose }
}

/** 是否满足全自动预选店铺自动上架条件 */
export function shouldAutoOzonFromConfig(config: {
  automationMode?: string
  listingShopEnabled?: boolean
  listingShops?: number[]
}): boolean {
  return config.automationMode === 'full'
    && Boolean(config.listingShopEnabled)
    && Array.isArray(config.listingShops)
    && config.listingShops.length > 0
}

import {
  formatVariantLimitExceededMessage,
  getMaxVariantExecutionCount,
  getSkuVariantCount,
  isVariantCountOverLimit,
} from '../maxVariantExecution'
import { showToast } from '../../../utils/toast'
import type { AiAutoSelectAiStepConfig, AiAutoSelectDraftItem } from '../aiAutoSelect/types'
import { createSessionFromDraftItem } from './sessionFactory'
import { runHeadlessPipelineOnSession } from './headlessPipeline'

let headlessPipelineActive = false

export function isHeadlessPipelineActive(): boolean {
  return headlessPipelineActive
}

export type BatchFillOptions = {
  onAiTaskStarted?: (sessionId: string) => void
  onMidSave?: (patch: Partial<AiAutoSelectDraftItem>) => void
  aiStepOverride?: AiAutoSelectAiStepConfig
  maxVariantExecutionCountOverride?: number
}

/** 无 UI 批量 AI 帮填：独立 session，写回草稿 patch */
export async function runAutoSelectItemAiFill(
  item: AiAutoSelectDraftItem,
  options: BatchFillOptions = {},
): Promise<Partial<AiAutoSelectDraftItem> | null> {
  if (!item.transformed) return null

  const skuCount = getSkuVariantCount(item.transformed)
  const maxVariantExecutionCount = options.maxVariantExecutionCountOverride ?? await getMaxVariantExecutionCount()
  if (isVariantCountOverLimit(skuCount, maxVariantExecutionCount)) {
    showToast(formatVariantLimitExceededMessage(skuCount, maxVariantExecutionCount), 3500)
    return null
  }

  const session = createSessionFromDraftItem(item)
  headlessPipelineActive = true
  try {
    return await runHeadlessPipelineOnSession(session, item, {
      aiStepOverride: options.aiStepOverride,
      onAiTaskStarted: options.onAiTaskStarted,
      onMidSave: options.onMidSave,
    })
  } finally {
    headlessPipelineActive = false
  }
}

/** SSE 失败后按 sessionId 恢复并补跑 step6-8 */
export async function recoverAutoSelectItemAiFill(
  item: AiAutoSelectDraftItem,
  options: BatchFillOptions = {},
): Promise<Partial<AiAutoSelectDraftItem> | null> {
  if (!item.offerId || !item.aiSessionId) return null

  const session = createSessionFromDraftItem(item)
  headlessPipelineActive = true
  try {
    return await runHeadlessPipelineOnSession(session, item, {
      recoverSessionId: item.aiSessionId,
      aiStepOverride: options.aiStepOverride,
      onMidSave: options.onMidSave,
    })
  } finally {
    headlessPipelineActive = false
  }
}

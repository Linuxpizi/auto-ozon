import { apiService } from '../../../utils/api'
import {
  applyAiResultJsonToFeatureValues as applyAiResultJsonToFeatureValuesUtil,
  buildAiFillPayload,
  consumeAiAgentSse as consumeAiAgentSseUtil,
  createAiAgentStoppedError,
  fetchAndApplyAiFillResultBySession,
  isAiAgentStoppedError,
  type AiSseContext,
} from '../ozonAiFillAndSubmit'
import type { AiAutoSelectAiStepConfig, AiAutoSelectDraftItem } from '../aiAutoSelect/types'
import { hasPostAiStepEnabled, resolveAiStepRuntime, type ResolvedAiStepRuntime } from './aiStepConfig'
import { executePostAiStepsOnSession } from './imagePipeline'
import { ensureSessionCategoryAndFeatureAttrs } from './sessionCategoryFeature'
import {
  createSessionAiApplyContext,
  hasSessionAppliedAiFillResult,
  recordSessionStepFailure,
  sessionToAutoSelectPatch,
} from './sessionSerialize'
import type { ProductSession } from './types'

export type HeadlessPipelineOptions = {
  aiStepOverride?: AiAutoSelectAiStepConfig
  onAiTaskStarted?: (sessionId: string) => void
  onMidSave?: (patch: Partial<AiAutoSelectDraftItem>) => void
  /** 恢复模式：跳过 step5，按 sessionId 拉结果 */
  recoverSessionId?: string
  skipStep5?: boolean
}

function createSessionSseContext(
  session: ProductSession,
  options: HeadlessPipelineOptions,
): AiSseContext {
  let rejectFn: ((reason?: unknown) => void) | null = null
  return {
    getStopRequested: () => false,
    setSessionId: (id) => { session.aiSessionId = id ?? undefined },
    setRejectPromise: (fn) => { rejectFn = fn },
    getRejectPromise: () => rejectFn,
    setEventSource: () => {},
    getEventSource: () => null,
    closeEventSource: () => {},
    getLogText: () => '',
    setLogText: () => {},
    appendLogDelta: () => {},
    appendLog: () => {},
    applyAiResult: (resultJson) => {
      applyAiResultJsonToFeatureValuesUtil(resultJson, createSessionAiApplyContext(session, { silent: true }))
    },
    onShowRecoverButton: () => {
      options.onMidSave?.(sessionToAutoSelectPatch(session, {
        cardStatus: 'ai_processing',
        aiSessionId: session.aiSessionId,
        aiStepFailures: [...session.pipelineStepFailures],
      }))
    },
    createStoppedError: createAiAgentStoppedError,
  }
}

async function runStep5OnSession(session: ProductSession, options: HeadlessPipelineOptions): Promise<boolean> {
  if (!session.featureAttrs?.length || !session.transformed) return false

  if (hasSessionAppliedAiFillResult(session)) {
    return true
  }

  const data1688 = JSON.parse(JSON.stringify(session.transformed))
  if (data1688?.sku_matrix) {
    data1688.sku_matrix.forEach((sku: Record<string, unknown>) => {
      if (sku.sale_price !== undefined && sku.sale_price !== null) {
        sku.price_amount = sku.sale_price
      }
    })
  }

  const payload = buildAiFillPayload(
    data1688,
    session.featureAttrs,
    'ALI_1688',
    session.offerId,
  )

  const startRes = await apiService.advancedAiStart(payload)
  const sessionId = startRes?.data?.sessionId
  if (startRes?.code !== 200 || !sessionId) {
    throw new Error(startRes?.msg || '启动 AI 智能体任务失败')
  }

  session.aiFillTaskSubmitted = true
  session.aiSessionId = String(sessionId)
  options.onAiTaskStarted?.(String(sessionId))
  options.onMidSave?.(sessionToAutoSelectPatch(session, {
    cardStatus: 'ai_processing',
    aiSessionId: String(sessionId),
  }))

  try {
    await consumeAiAgentSseUtil(String(sessionId), createSessionSseContext(session, options))
  } catch (error) {
    if (isAiAgentStoppedError(error)) return false
    throw error
  }

  if (hasSessionAppliedAiFillResult(session)) {
    options.onMidSave?.(sessionToAutoSelectPatch(session, {
      cardStatus: 'ai_processing',
      aiStepFailures: [...session.pipelineStepFailures],
      aiSessionId: session.aiSessionId,
    }))
  }

  if (!hasSessionAppliedAiFillResult(session)) {
    if (!session.aiFillTaskSubmitted) recordSessionStepFailure(session, 'fill')
    return false
  }

  return true
}

async function runRecoverStep5OnSession(session: ProductSession, sessionId: string): Promise<boolean> {
  const ctx = createSessionAiApplyContext(session, { silent: true })
  const result = await fetchAndApplyAiFillResultBySession(sessionId, ctx, 'recover')
  return result.ok && hasSessionAppliedAiFillResult(session)
}

/** 在独立 session 上跑 AI 帮填 + step6-8，不触碰 Modal UI */
export async function runHeadlessPipelineOnSession(
  session: ProductSession,
  item: AiAutoSelectDraftItem,
  options: HeadlessPipelineOptions = {},
): Promise<Partial<AiAutoSelectDraftItem> | null> {
  if (!session.transformed) return null

  const aiStep = await resolveAiStepRuntime(options.aiStepOverride ?? null)
  const ready = await ensureSessionCategoryAndFeatureAttrs(session, item)
  if (!ready) return null

  session.pipelineStepFailures = [...(item.aiStepFailures ?? [])]

  let step5Ok = false
  if (options.recoverSessionId) {
    step5Ok = await runRecoverStep5OnSession(session, options.recoverSessionId)
  } else if (!options.skipStep5) {
    try {
      step5Ok = await runStep5OnSession(session, options)
    } catch (error) {
      console.error('[productSession] step5 failed', error)
      recordSessionStepFailure(session, 'fill')
      step5Ok = false
    }
  } else {
    step5Ok = hasSessionAppliedAiFillResult(session)
  }

  if (!step5Ok) {
    if (session.aiFillTaskSubmitted) {
      return sessionToAutoSelectPatch(session, {
        cardStatus: 'ai_processing',
        aiStepFailures: [...session.pipelineStepFailures],
        aiSessionId: session.aiSessionId,
      })
    }
    return null
  }

  options.onMidSave?.(sessionToAutoSelectPatch(session, {
    cardStatus: 'ai_processing',
    aiStepFailures: [...session.pipelineStepFailures],
    aiSessionId: undefined,
  }))

  if (hasPostAiStepEnabled(aiStep)) {
    await executePostAiStepsOnSession(session, aiStep)
  }

  return sessionToAutoSelectPatch(session, {
    cardStatus: 'ai_success',
    aiStepFailures: [...session.pipelineStepFailures],
    aiSessionId: undefined,
  })
}

export async function runHeadlessPostAiOnly(
  session: ProductSession,
  aiStep: ResolvedAiStepRuntime,
  options: Pick<HeadlessPipelineOptions, 'onMidSave'>,
): Promise<void> {
  options.onMidSave?.(sessionToAutoSelectPatch(session, {
    cardStatus: 'ai_processing',
    aiStepFailures: [...session.pipelineStepFailures],
    aiSessionId: undefined,
  }))
  await executePostAiStepsOnSession(session, aiStep)
}

import {
  buildEditStateSnapshotFromCollectModal,
  evaluateNeedsManualEdit,
  resolveDraftItemTitle,
  syncSkuVideoUrlsToTransformed,
  type AiAutoSelectDraftItem,
  type AiFillStepFailureKey,
} from '../aiAutoSelect'
import { syncSkuImagesFromImgListToTransformed } from '../collectedGoodsTransform'
import type { AiApplyContext } from '../ozonAiFillAndSubmit'
import {
  ensureDefaultFeatureAttrSelectionsOnSession,
  ensureRandomModelNameFeatureAttrsOnSession,
} from './featureAttrSessionHelpers'
import type { ProductSession } from './types'

/** 会话是否已有 AI 帮填回填结果 */
export function hasSessionAppliedAiFillResult(session: ProductSession): boolean {
  const publicData = session.aiResultPublicFeatureData
  const hasPublicAi =
    publicData != null &&
    typeof publicData === 'object' &&
    Object.keys(publicData).length > 0
  const hasVariantAi =
    Array.isArray(session.aiResultJsonList) && session.aiResultJsonList.length > 0
  return hasPublicAi || hasVariantAi
}

export function recordSessionStepFailure(session: ProductSession, key: AiFillStepFailureKey): void {
  if (!session.pipelineStepFailures.includes(key)) {
    session.pipelineStepFailures.push(key)
  }
}

export function createSessionAiApplyContext(
  session: ProductSession,
  options?: { silent?: boolean },
): AiApplyContext {
  return {
    getTransformedData: () => session.transformed,
    setTransformedData: (data) => {
      session.transformed = data
    },
    getFeatureAttrs: () => session.featureAttrs,
    setPrefilledFeatureAttrValues: (values) => {
      session.prefilledFeatureAttrValues = values
    },
    setAiResultJsonList: (rows) => {
      session.aiResultJsonList = rows
    },
    setAiResultPublicFeatureData: (data) => {
      session.aiResultPublicFeatureData = data
    },
    appendLog: options?.silent ? () => {} : (msg) => {
      console.log('[productSession]', msg)
    },
    ensureDefaultFeatureAttrSelections: () => {
      ensureDefaultFeatureAttrSelectionsOnSession(session)
    },
    ensureRandomModelNameFeatureAttrs: () => {
      ensureRandomModelNameFeatureAttrsOnSession(session)
    },
  }
}

/** 将会话序列化为自动选品草稿 patch */
export function sessionToAutoSelectPatch(
  session: ProductSession,
  extra?: Partial<AiAutoSelectDraftItem>,
): Partial<AiAutoSelectDraftItem> {
  const aiStepFailures = extra?.aiStepFailures ?? [...session.pipelineStepFailures]

  if (!session.transformed) {
    return {
      ...extra,
      ...(aiStepFailures.length ? { aiStepFailures } : {}),
    }
  }

  const videoSnapshot = JSON.parse(JSON.stringify(session.skuVideoUrlList)) as Record<number, string>
  const transformed = JSON.parse(JSON.stringify(session.transformed))
  syncSkuImagesFromImgListToTransformed(transformed)
  syncSkuVideoUrlsToTransformed(transformed, videoSnapshot)

  const editState = buildEditStateSnapshotFromCollectModal({
    categoryTemplateId: session.categoryTemplateId,
    categoryTemplates: session.categoryTemplates,
    featureAttrs: session.featureAttrs,
    prefilledFeatureAttrValues: session.prefilledFeatureAttrValues,
    aiResultJsonList: session.aiResultJsonList,
    aiResultPublicFeatureData: session.aiResultPublicFeatureData,
    selectedShops: session.selectedShops,
    shopWarehouseInventory: session.shopWarehouseInventory,
    workbenchFeatureAttrValues: session.workbenchFeatureAttrValues,
    skuVideoUrlList: videoSnapshot,
  })

  const title = resolveDraftItemTitle({ title: session.title, transformed })
  const baseItem: AiAutoSelectDraftItem = {
    id: session.itemId,
    offerId: session.offerId,
    title,
    listPrice: null,
    detailUrl: '',
    collectedAt: 0,
    transformed,
    editState,
    cardStatus: 'waiting_ai',
    needsManualEdit: false,
  }
  const merged: AiAutoSelectDraftItem = { ...baseItem, ...extra, transformed, editState, title }
  const evalResult = evaluateNeedsManualEdit(merged)
  const resolvedTitle = resolveDraftItemTitle({
    title: extra?.title ?? session.title,
    transformed,
  })

  return {
    ...extra,
    transformed,
    editState,
    title: resolvedTitle,
    needsManualEdit: evalResult.needsManualEdit,
    manualEditFocus: evalResult.manualEditFocus,
    aiStepFailures,
  }
}

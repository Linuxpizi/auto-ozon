import { enrichTransformedDataWithImageLists } from '../collectedGoodsTransform'
import { resolveDraftItemTitle, resolveSkuVideoUrlListForItem, type AiAutoSelectDraftItem } from '../aiAutoSelect'
import { applyEditStateToSession, type ProductSession } from './types'

/** 从自动选品草稿条目创建独立会话（批量帮填 / 恢复 / 用户编辑绑定） */
export function createSessionFromDraftItem(item: AiAutoSelectDraftItem): ProductSession {
  const transformed = item.transformed
    ? JSON.parse(JSON.stringify(item.transformed)) as Record<string, unknown>
    : null
  if (transformed) {
    enrichTransformedDataWithImageLists(transformed as Parameters<typeof enrichTransformedDataWithImageLists>[0])
  }

  const session: ProductSession = {
    source: 'auto_select_draft',
    itemId: item.id,
    offerId: item.offerId || '',
    title: resolveDraftItemTitle(item),
    rawDataObj: { source: 'auto_select', data: { result: { data: { subject: item.title } } } },
    transformed,
    categoryTemplates: [],
    categoryTemplateId: null,
    featureAttrs: [],
    prefilledFeatureAttrValues: {},
    workbenchFeatureAttrValues: {},
    aiResultJsonList: [],
    aiResultPublicFeatureData: {},
    selectedShops: [],
    shopWarehouseInventory: {},
    skuVideoUrlList: resolveSkuVideoUrlListForItem(item),
    aiSessionId: item.aiSessionId,
    pipelineStepFailures: [...(item.aiStepFailures ?? [])],
    aiFillTaskSubmitted: false,
  }

  applyEditStateToSession(session, item.editState)
  if (item.editState?.categoryTemplateId != null) {
    session.categoryTemplateId = item.editState.categoryTemplateId
  }

  return session
}

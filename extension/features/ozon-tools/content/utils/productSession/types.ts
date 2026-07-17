import type { AiFillStepFailureKey, ProductEditState } from '../aiAutoSelect/types'

/** 商品工作台会话：Pipeline 与 UI 共用数据源（UI 通过 adapter 绑定） */
export type ProductSession = {
  source: 'page_collect' | 'auto_select_draft'
  itemId: string
  offerId: string
  title: string
  pageUrl?: string

  rawDataObj: unknown | null
  transformed: Record<string, unknown> | null

  categoryTemplates: Array<{ id: number; name: string; data?: unknown }>
  categoryTemplateId: number | null
  featureAttrs: unknown[]
  prefilledFeatureAttrValues: Record<string, string | number | string[]>
  workbenchFeatureAttrValues: Record<string, string | number | string[]>
  aiResultJsonList: unknown[]
  aiResultPublicFeatureData: Record<string, unknown>
  selectedShops: number[]
  shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
  skuVideoUrlList: Record<number, string>

  aiSessionId?: string
  pipelineStepFailures: AiFillStepFailureKey[]
  aiFillTaskSubmitted: boolean
}

export type ProductSessionEditSnapshot = {
  categoryTemplateId: number | null
  categoryTemplates: ProductSession['categoryTemplates']
  featureAttrs: unknown[]
  prefilledFeatureAttrValues: Record<string, string | number | string[]>
  workbenchFeatureAttrValues: Record<string, string | number | string[]>
  aiResultJsonList: unknown[]
  aiResultPublicFeatureData: Record<string, unknown>
  selectedShops: number[]
  shopWarehouseInventory: ProductSession['shopWarehouseInventory']
  skuVideoUrlList: Record<number, string>
}

export function getSessionEditSnapshot(session: ProductSession): ProductSessionEditSnapshot {
  return {
    categoryTemplateId: session.categoryTemplateId,
    categoryTemplates: session.categoryTemplates,
    featureAttrs: session.featureAttrs,
    prefilledFeatureAttrValues: session.prefilledFeatureAttrValues,
    workbenchFeatureAttrValues: session.workbenchFeatureAttrValues,
    aiResultJsonList: session.aiResultJsonList,
    aiResultPublicFeatureData: session.aiResultPublicFeatureData,
    selectedShops: session.selectedShops,
    shopWarehouseInventory: session.shopWarehouseInventory,
    skuVideoUrlList: session.skuVideoUrlList,
  }
}

export function applyEditStateToSession(session: ProductSession, editState?: ProductEditState): void {
  if (!editState) return
  if (editState.categoryTemplates) {
    session.categoryTemplates = JSON.parse(JSON.stringify(editState.categoryTemplates))
  }
  session.categoryTemplateId = editState.categoryTemplateId ?? session.categoryTemplateId
  if (Array.isArray(editState.featureAttrs)) {
    session.featureAttrs = JSON.parse(JSON.stringify(editState.featureAttrs))
  }
  if (editState.prefilledFeatureAttrValues) {
    session.prefilledFeatureAttrValues = { ...editState.prefilledFeatureAttrValues } as Record<string, string | number | string[]>
  }
  if (editState.workbenchFeatureAttrValues) {
    session.workbenchFeatureAttrValues = { ...editState.workbenchFeatureAttrValues } as Record<string, string | number | string[]>
  }
  if (Array.isArray(editState.aiResultJsonList)) {
    session.aiResultJsonList = [...editState.aiResultJsonList]
  }
  if (editState.aiResultPublicFeatureData) {
    session.aiResultPublicFeatureData = { ...editState.aiResultPublicFeatureData }
  }
  if (Array.isArray(editState.selectedShops)) {
    session.selectedShops = [...editState.selectedShops]
  }
  if (editState.shopWarehouseInventory) {
    session.shopWarehouseInventory = JSON.parse(JSON.stringify(editState.shopWarehouseInventory))
  }
  if (editState.skuVideoUrlList) {
    session.skuVideoUrlList = JSON.parse(JSON.stringify(editState.skuVideoUrlList))
  }
}

import type { Ref } from 'vue'
import { enrichTransformedDataWithImageLists } from '../collectedGoodsTransform'
import { resolveDraftItemTitle, type AiAutoSelectDraftItem } from '../aiAutoSelect/types'
import { createSessionFromDraftItem } from './sessionFactory'
import type { ProductSession } from './types'

/** Modal 中与 ProductSession 同步的响应式字段 */
export type ModalSessionBindings = {
  rawDataObj: Ref<unknown | null>
  transformedData: Ref<Record<string, unknown> | null>
  categoryTemplates: Ref<ProductSession['categoryTemplates']>
  categoryTemplate: Ref<number | null>
  featureAttrs: Ref<unknown[]>
  prefilledFeatureAttrValues: Ref<Record<string, string | number | string[]>>
  workbenchFeatureAttrValues: Ref<Record<string, string | number | string[]>>
  aiResultJsonList: Ref<unknown[]>
  aiResultPublicFeatureData: Ref<Record<string, unknown>>
  selectedShops: Ref<number[]>
  shopWarehouseInventory: Ref<ProductSession['shopWarehouseInventory']>
  skuVideoUrlList: Ref<Record<number, string>>
  isDataLoaded: Ref<boolean>
}

/** 从自动选品草稿创建独立会话（用户点击编辑 / 切换商品） */
export function bindAutoSelectDraftItem(item: AiAutoSelectDraftItem): ProductSession {
  return createSessionFromDraftItem(item)
}

/** session → Modal refs：用户点击草稿条目时灌入工作台 */
export function hydrateModalFromSession(session: ProductSession, modal: ModalSessionBindings): void {
  modal.categoryTemplates.value = session.categoryTemplates.length
    ? JSON.parse(JSON.stringify(session.categoryTemplates))
    : []
  // 先清空类目，避免 watch 在灌入 transformed 后误清 SKU 数据
  modal.categoryTemplate.value = null

  modal.transformedData.value = session.transformed
    ? JSON.parse(JSON.stringify(session.transformed))
    : null
  if (modal.transformedData.value) {
    enrichTransformedDataWithImageLists(modal.transformedData.value as Parameters<typeof enrichTransformedDataWithImageLists>[0])
  }
  modal.skuVideoUrlList.value = JSON.parse(JSON.stringify(session.skuVideoUrlList))
  modal.rawDataObj.value = session.rawDataObj
  modal.isDataLoaded.value = Boolean(session.transformed)

  modal.categoryTemplate.value = session.categoryTemplateId
  modal.featureAttrs.value = Array.isArray(session.featureAttrs) ? [...session.featureAttrs] : []
  modal.prefilledFeatureAttrValues.value = { ...session.prefilledFeatureAttrValues }
  modal.workbenchFeatureAttrValues.value = { ...session.workbenchFeatureAttrValues }
  modal.aiResultJsonList.value = Array.isArray(session.aiResultJsonList) ? [...session.aiResultJsonList] : []
  modal.aiResultPublicFeatureData.value = { ...session.aiResultPublicFeatureData }
  modal.selectedShops.value = [...session.selectedShops]
  modal.shopWarehouseInventory.value = JSON.parse(JSON.stringify(session.shopWarehouseInventory))
}

/** Modal refs → session：保存草稿 / 切换商品前回写 */
export function syncSessionFromModal(session: ProductSession, modal: ModalSessionBindings): void {
  session.transformed = modal.transformedData.value
    ? JSON.parse(JSON.stringify(modal.transformedData.value))
    : null
  session.categoryTemplates = JSON.parse(JSON.stringify(modal.categoryTemplates.value))
  session.categoryTemplateId = modal.categoryTemplate.value
  session.featureAttrs = JSON.parse(JSON.stringify(modal.featureAttrs.value))
  session.prefilledFeatureAttrValues = JSON.parse(JSON.stringify(modal.prefilledFeatureAttrValues.value))
  session.workbenchFeatureAttrValues = JSON.parse(JSON.stringify(modal.workbenchFeatureAttrValues.value))
  session.aiResultJsonList = JSON.parse(JSON.stringify(modal.aiResultJsonList.value))
  session.aiResultPublicFeatureData = JSON.parse(JSON.stringify(modal.aiResultPublicFeatureData.value))
  session.selectedShops = [...modal.selectedShops.value]
  session.shopWarehouseInventory = JSON.parse(JSON.stringify(modal.shopWarehouseInventory.value))
  session.skuVideoUrlList = JSON.parse(JSON.stringify(modal.skuVideoUrlList.value))
  session.rawDataObj = modal.rawDataObj.value
  session.title = resolveDraftItemTitle({ title: session.title, transformed: session.transformed })
}

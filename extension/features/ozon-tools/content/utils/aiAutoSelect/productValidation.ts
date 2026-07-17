import {
  FEATURE_ATTR_ID_VIDEO_URL,
  SKU_VARIANT_FEATURE_STORAGE_KEY,
  scanChineseFieldsBeforeSubmit,
  validateFeatureAttrsBeforeSubmit,
  validateSkuAspectBeforeSubmit,
  validateVariantImageCountBeforeSubmit,
  type VariantImageCountExceededItem,
  type VariantAspectValidationItem,
  type ChineseFieldMark,
  type SubmitValidateContext,
  type OzonSubmitContext,
} from '../ozonAiFillAndSubmit'
import type { AiAutoSelectDraftItem, ManualEditFocus, ProductEditState } from './types'

const VIDEO_ATTR_KEY = String(FEATURE_ATTR_ID_VIDEO_URL)

/** 从 transformed 或当前视频 ref 收集各变体视频 URL */
export function collectSkuVideoMapFromTransformed(
  data: unknown,
  currentVideoMap?: Record<number, string>,
): Record<number, string> {
  const videoMap: Record<number, string> = {}
  const skuList = (data as { sku_matrix?: unknown[] })?.sku_matrix
  if (!Array.isArray(skuList)) return videoMap

  skuList.forEach((sku: unknown, index: number) => {
    const row = sku as {
      aspect_feature_values?: Record<string, unknown>
      [SKU_VARIANT_FEATURE_STORAGE_KEY]?: Record<string, unknown>
    }
    const fromRef = String(currentVideoMap?.[index] ?? '').trim()
    const fromVariant = String(row?.[SKU_VARIANT_FEATURE_STORAGE_KEY]?.[VIDEO_ATTR_KEY] ?? '').trim()
    const fromAspect = String(row?.aspect_feature_values?.[VIDEO_ATTR_KEY] ?? '').trim()
    const videoValue = fromRef || fromVariant || fromAspect
    if (videoValue) videoMap[index] = videoValue
  })

  return videoMap
}

/** 保存前将视频 URL 写入 transformed 各变体特征，供上架/采集箱读取 */
export function syncSkuVideoUrlsToTransformed(
  transformed: unknown,
  videoMap: Record<number, string>,
): void {
  const skuList = (transformed as { sku_matrix?: unknown[] })?.sku_matrix
  if (!Array.isArray(skuList)) return

  skuList.forEach((sku: unknown, index: number) => {
    const row = sku as Record<string, unknown>
    if (!row || typeof row !== 'object') return
    const url = String(videoMap[index] ?? '').trim()
    const scopedKey = SKU_VARIANT_FEATURE_STORAGE_KEY
    if (!row[scopedKey] || typeof row[scopedKey] !== 'object') {
      row[scopedKey] = {}
    }
    const scopedMap = row[scopedKey] as Record<string, string>
    if (url) {
      scopedMap[VIDEO_ATTR_KEY] = url
    } else {
      delete scopedMap[VIDEO_ATTR_KEY]
    }
  })
}

/** 从草稿 editState 或 transformed 恢复商品视频映射 */
export function resolveSkuVideoUrlListForItem(item: AiAutoSelectDraftItem): Record<number, string> {
  const fromEditState = item.editState?.skuVideoUrlList
  if (fromEditState && Object.keys(fromEditState).length > 0) {
    return JSON.parse(JSON.stringify(fromEditState)) as Record<number, string>
  }
  return collectSkuVideoMapFromTransformed(item.transformed)
}

/** 将中文合规扫描结果映射为工作台聚焦目标 */
export function manualEditFocusFromChineseMark(mark: ChineseFieldMark): ManualEditFocus | undefined {
  if (mark.attrId != null) {
    return { kind: 'feature', attrId: mark.attrId }
  }
  if (mark.skuFieldKey) {
    const aspectMatch = mark.skuFieldKey.match(/^(\d+)-(\d+)$/)
    if (aspectMatch) {
      return { kind: 'sku', rowIndex: Number(aspectMatch[1]) }
    }
    const variantMatch = mark.skuFieldKey.match(/^variant-(\d+)-/)
    if (variantMatch) {
      return { kind: 'sku', rowIndex: Number(variantMatch[1]) }
    }
    const descMatch = mark.skuFieldKey.match(/^description-(\d+)$/)
    if (descMatch) {
      return { kind: 'sku', rowIndex: Number(descMatch[1]) }
    }
    const prefixMatch = mark.skuFieldKey.match(/^offerid-prefix-(\d+)$/)
    if (prefixMatch) {
      return { kind: 'sku', rowIndex: Number(prefixMatch[1]) }
    }
    return { kind: 'sku', rowIndex: 0 }
  }
  return undefined
}

/** 将变体特征校验项映射为工作台聚焦目标，供「去修改」滚动到报错字段 */
export function manualEditFocusFromVariantAspectItem(
  item: VariantAspectValidationItem,
  featureAttrs?: unknown[],
): ManualEditFocus {
  const rowIndex = Math.max(0, item.variantIndex - 1)
  switch (item.issueType) {
    case 'missing_required_aspect':
      return { kind: 'sku', rowIndex, attrId: item.attrId, skuField: 'aspect' }
    case 'missing_any_aspect': {
      const aspectAttr = (featureAttrs || []).find((a: unknown) => (a as { is_aspect?: boolean })?.is_aspect === true) as { id?: number } | undefined
      return { kind: 'sku', rowIndex, attrId: aspectAttr?.id, skuField: 'aspect' }
    }
    case 'missing_description':
      return { kind: 'sku', rowIndex, skuField: 'variant_description' }
    case 'missing_variant_attr':
      return { kind: 'sku', rowIndex, attrId: item.attrId, skuField: 'variant_feature' }
    default:
      return { kind: 'sku', rowIndex }
  }
}

export type ManualEditEvaluation = {
  needsManualEdit: boolean
  manualEditFocus?: AiAutoSelectDraftItem['manualEditFocus']
  message?: string
}

/** 获取特征属性现有值工厂函数
 * @param editState 编辑状态
 * @returns 特征属性现有值工厂函数
 * 获取特征属性现有值工厂函数，返回特征属性现有值工厂函数
 * 使用 editState.prefilledFeatureAttrValues 获取预填充的特征属性值
 * 使用 editState.workbenchFeatureAttrValues 获取工作台的特征属性值
 */
function getFeatureAttrExistingValueFactory(
  editState: ProductEditState | undefined,
): (attr: unknown) => string | number | string[] | undefined {
  const prefilled = (editState?.prefilledFeatureAttrValues || {}) as Record<
    string,
    string | number | string[]
  >
  const workbench = (editState?.workbenchFeatureAttrValues || {}) as Record<
    string,
    string | number | string[]
  >
  return (attr: unknown) => {
    const a = attr as { id?: number; value?: unknown }
    const key = String(a?.id ?? '')
    if (workbench[key] !== undefined) return workbench[key]
    if (prefilled[key] !== undefined) return prefilled[key]
    return a?.value as string | number | string[] | undefined
  }
}

/** 构建提交上下文
 * @param item 草稿商品
 * @param shopConfig 店铺配置
 * @returns 提交上下文
 * 构建提交上下文，返回提交上下文
 * 使用 editState.featureAttrs 获取特征属性
 * 使用 getFeatureAttrExistingValueFactory 获取特征属性现有值工厂函数
 */
export function buildSubmitContextsFromDraftItem(
  item: AiAutoSelectDraftItem,
  shopConfig: {
    selectedShopIds: number[]
    shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
  },
): { validateCtx: SubmitValidateContext; submitCtx: OzonSubmitContext } {
  const editState = item.editState || {}
  const featureAttrs = (editState.featureAttrs || []) as unknown[]
  const getFeatureAttrExistingValue = getFeatureAttrExistingValueFactory(editState)

  const validateCtx: SubmitValidateContext = {
    featureAttrs,
    transformedData: item.transformed,
    workbenchReader: null,
    getFeatureAttrExistingValue,
  }

  const submitCtx: OzonSubmitContext = {
    categoryTemplates: (editState.categoryTemplates || []) as OzonSubmitContext['categoryTemplates'],
    categoryTemplateId: editState.categoryTemplateId ?? null,
    transformedData: item.transformed,
    featureAttrs,
    aiResultJsonList: (editState.aiResultJsonList || []) as unknown[],
    aiResultPublicFeatureData: (editState.aiResultPublicFeatureData || {}) as Record<string, unknown>,
    selectedShopIds: shopConfig.selectedShopIds,
    shopWarehouseInventory: shopConfig.shopWarehouseInventory,
    skuVideoUrlList: {},
    getFeatureAttrExistingValue,
  }

  return { validateCtx, submitCtx }
}

export type OzonPreSubmitValidationResult =
  | { status: 'ok' }
  | { status: 'chinese_blocked'; marks: ChineseFieldMark[] }
  | { status: 'validation_failed'; message: string }
  | { status: 'aspect_validation_failed'; message: string; items: VariantAspectValidationItem[] }
  | { status: 'image_count_exceeded'; message: string; items: VariantImageCountExceededItem[] }

/** 上架前预校验：属性 → 变体 → 中文扫描（不依赖店铺配置） */
export function validateOzonDraftItemBeforeSubmit(
  item: AiAutoSelectDraftItem,
): OzonPreSubmitValidationResult {
  const { validateCtx } = buildSubmitContextsFromDraftItem(item, {
    selectedShopIds: [],
    shopWarehouseInventory: {},
  })

  const attrValidation = validateFeatureAttrsBeforeSubmit(validateCtx)
  if (!attrValidation.valid) {
    return {
      status: 'validation_failed',
      message: attrValidation.message || '属性校验未通过',
    }
  }

  const aspectValidation = validateSkuAspectBeforeSubmit(validateCtx)
  if (!aspectValidation.valid) {
    return {
      status: 'aspect_validation_failed',
      message: aspectValidation.message || '变体特征校验未通过',
      items: aspectValidation.items || [],
    }
  }

  const imageCountValidation = validateVariantImageCountBeforeSubmit(validateCtx)
  if (!imageCountValidation.valid) {
    return {
      status: 'image_count_exceeded',
      message: imageCountValidation.message || '变体图片数量超出限制',
      items: imageCountValidation.items || [],
    }
  }

  const chineseMarks = scanChineseFieldsBeforeSubmit(validateCtx)
  if (chineseMarks.length > 0) {
    return { status: 'chinese_blocked', marks: chineseMarks }
  }

  return { status: 'ok' }
}

/** 评估商品是否需显示「需手动编辑」标签 */
export function evaluateNeedsManualEdit(item: AiAutoSelectDraftItem): ManualEditEvaluation {
  const transformed = item.transformed
  const title = transformed?.global_data?.product_name || item.title
  const mainImages = transformed?.global_data?.media_gallery?.main_images || []
  const skuMatrix = transformed?.sku_matrix || []

  if (!title?.trim()) {
    return { needsManualEdit: true, message: '缺少商品标题' }
  }
  if (!mainImages.length) {
    return { needsManualEdit: true, message: '缺少主图' }
  }
  if (!skuMatrix.length) {
    return { needsManualEdit: true, message: '缺少 SKU 信息' }
  }

  const featureAttrs = (item.editState?.featureAttrs || []) as unknown[]
  if (featureAttrs.length > 0) {
    const getFeatureAttrExistingValue = getFeatureAttrExistingValueFactory(item.editState)
    const attrResult = validateFeatureAttrsBeforeSubmit({
      featureAttrs,
      transformedData: transformed,
      getFeatureAttrExistingValue,
    })
    if (!attrResult.valid) {
      const firstKey = Object.keys(attrResult.errors)[0]
      return {
        needsManualEdit: true,
        manualEditFocus: firstKey ? { kind: 'feature', attrId: Number(firstKey) } : undefined,
        message: attrResult.message,
      }
    }

    const skuResult = validateSkuAspectBeforeSubmit({
      featureAttrs,
      transformedData: transformed,
    })
    if (!skuResult.valid) {
      return {
        needsManualEdit: true,
        manualEditFocus: { kind: 'sku', rowIndex: 0 },
        message: skuResult.message,
      }
    }
  }

  return { needsManualEdit: false }
}

/** 构建编辑状态快照
 * @param state 状态
 * @returns 构建编辑状态快照
 */
export function buildEditStateSnapshotFromCollectModal(state: {
  categoryTemplateId?: number | null
  categoryTemplates?: ProductEditState['categoryTemplates']
  featureAttrs?: unknown[]
  prefilledFeatureAttrValues?: Record<string, unknown>
  aiResultJsonList?: unknown[]
  aiResultPublicFeatureData?: Record<string, unknown>
  selectedShops?: number[]
  shopWarehouseInventory?: ProductEditState['shopWarehouseInventory']
  workbenchFeatureAttrValues?: Record<string, unknown>
  skuVideoUrlList?: Record<number, string>
}): ProductEditState {
  return {
    categoryTemplateId: state.categoryTemplateId ?? null,
    categoryTemplates: state.categoryTemplates,
    featureAttrs: state.featureAttrs,
    prefilledFeatureAttrValues: state.prefilledFeatureAttrValues,
    aiResultJsonList: state.aiResultJsonList,
    aiResultPublicFeatureData: state.aiResultPublicFeatureData,
    selectedShops: state.selectedShops,
    shopWarehouseInventory: state.shopWarehouseInventory,
    workbenchFeatureAttrValues: state.workbenchFeatureAttrValues,
    skuVideoUrlList: state.skuVideoUrlList
      ? (JSON.parse(JSON.stringify(state.skuVideoUrlList)) as Record<number, string>)
      : undefined,
  }
}

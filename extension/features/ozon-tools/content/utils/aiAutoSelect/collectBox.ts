import { apiService } from '../../../utils/api'
import { getAiCategory } from '../../../utils/aiApi'
import { showToast } from '../../../utils/toast'
import { proxyFetchJson } from '../../../utils/proxyFetch'
import { generateDefaultOfferidPrefix } from '../collectedGoodsTransform'
import { mapAttrValueByDictionary } from '../ozonGoodsFeature'
import {
  buildV2Attributes,
  normalizeFeatureName,
  normalizeSubmitImagesToOss,
  toIntOrNull,
  toLongOrNull,
  toPriceString,
} from '../ozonAiFillAndSubmit'
import { buildSubmitContextsFromDraftItem } from './productValidation'
import type { AiAutoSelectDraftItem, ProductEditState } from './types'

// ── Payload 构建 ──────────────────────────────────────────────

/** 采集箱单条商品（与 Ozon import items[] 一致） */
export type CollectionBoxProductItem = {
  attributes: Array<Record<string, unknown>>
  description_category_id: number | null
  new_description_category_id: null
  type_id: number | null
  currency_code: string
  dimension_unit: string
  weight_unit: string
  depth: number | null
  height: number | null
  width: number | null
  weight: number | null
  price: string
  old_price: string
  name: string
  offer_id: string
  primary_image: string
  images: string[]
}

const FEATURE_ATTR_ID_BRAND = 85
const FEATURE_ATTR_ID_FASHION_BRAND = 31
const FEATURE_ATTR_ID_TYPE = 8229
const FEATURE_ATTR_ID_ORIGIN = 4389
const FEATURE_ATTR_ID_MANUFACTURER = 23487
const FEATURE_ATTR_ID_SHELF_LIFE_DAYS = 8205
const FEATURE_ATTR_ID_DESCRIPTION = 4191
const FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL = new Set([9048, 8292])

const NO_BRAND_OPTION = { id: 126745801, value: '无品牌' }
const CHINA_ORIGIN_OPTION = { id: 90296, value: 'Китай' } // 中国 -> 俄语翻译

const isAttrValueFilled = (attr: any, raw: unknown): boolean => {
  if (attr?.is_collection) {
    const list = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw]
    return list.some((item) => String(item ?? '').trim() !== '')
  }
  if (Array.isArray(raw)) {
    return raw.some((item) => String(item ?? '').trim() !== '')
  }
  return String(raw ?? '').trim() !== ''
}

/** 前置字典选项如果缺失
 * @param attr 属性
 * @param option 选项
 * @returns 前置字典选项如果缺失
 */
const prependDictionaryOptionIfMissing = (
  attr: any,
  option: { id: number; value: string },
) => {
  const currentDict = Array.isArray(attr?.dictionary_values) ? attr.dictionary_values : []
  const exists = currentDict.some(
    (item: any) =>
      Number(item?.id) === option.id ||
      normalizeFeatureName(item?.value) === normalizeFeatureName(option.value),
  )
  if (exists) return attr
  return {
    ...attr,
    dictionary_values: [option, ...currentDict],
  }
}

/** 型号名称 / 合并至一张卡片：无值时生成 9 位大写字母+数字(1-9，不含0) */
const generateRandomModelCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'
  const parts: string[] = []
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(9)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < 9; i++) {
      parts.push(chars[bytes[i]! % chars.length]!)
    }
  } else {
    for (let i = 0; i < 9; i++) {
      parts.push(chars[Math.floor(Math.random() * chars.length)]!)
    }
  }
  return parts.join('')
}

/** 拉取类目 OSS 属性定义（与 AiCollectModal.loadFeatureAttrsFromCategory 对齐） */
async function loadFeatureAttrsFromCategoryApi(
  typeId: string,
  level2Id: string,
): Promise<any[]> {
  const tid = String(typeId ?? '').trim()
  const lid = String(level2Id ?? '').trim()
  if (!tid && !lid) return []

  const res = await apiService.getCategoryAndOptionList(tid, lid)
  const data = res?.data
  const resolvedTypeId = String(data?.typeId ?? '').trim()
  const zhOssPath = typeof data?.zhOssPath === 'string' ? data.zhOssPath : ''
  if (!zhOssPath) {
    throw new Error('未返回属性配置地址')
  }

  const json = await proxyFetchJson<any[]>(zhOssPath)
  const list = Array.isArray(json) ? json : null
  if (!list) {
    throw new Error('属性数据格式错误')
  }

  return list.map((attr: any) => {
    if (!attr || typeof attr !== 'object') return attr
    const attrId = Number(attr?.id)
    if (attrId === FEATURE_ATTR_ID_TYPE && resolvedTypeId) {
      if (isAttrValueFilled(attr, attr?.value)) return attr
      return { ...attr, value: resolvedTypeId }
    }
    if (attrId === FEATURE_ATTR_ID_BRAND || attrId === FEATURE_ATTR_ID_FASHION_BRAND) {
      return prependDictionaryOptionIfMissing(attr, NO_BRAND_OPTION)
    }
    if (attrId === FEATURE_ATTR_ID_ORIGIN) {
      return prependDictionaryOptionIfMissing(attr, CHINA_ORIGIN_OPTION)
    }
    return attr
  })
}

/** 解析类目模板
 * @param title 商品标题
 * @returns 解析类目模板
 */
async function resolveCategoryTemplates(title: string): Promise<{
  templates: NonNullable<ProductEditState['categoryTemplates']>
  templateId: number
} | null> {
  const categoryResponse = await getAiCategory(title)
  if (categoryResponse.code !== 200 || !categoryResponse.data?.length) {
    return null
  }
  const templates = categoryResponse.data.map((item, index) => ({
    id: index + 1,
    name: `${item.metadata.level1NameZh}/${item.metadata.level2NameZh}/${item.metadata.typeNameZh}`,
    data: item,
  }))
  return { templates, templateId: templates[0]!.id }
}

/** 设置预填值
 * @param target 目标
 * @param attr 属性
 * @param value 值
 * @returns 设置预填值
 */
function setPrefillValue(
  target: Record<string, string | number | string[]>,
  attr: any,
  value: string | number | string[],
) {
  const key = String(attr?.id ?? '')
  if (!key) return
  target[key] = value
}

/** 设置默认字典预填
 * @param prefilled 预填
 * @param workbench 工作台
 * @param attr 属性
 * @param option 选项
 * @returns 设置默认字典预填
 */
function setDefaultDictionaryPrefill(
  prefilled: Record<string, string | number | string[]>,
  workbench: Record<string, string | number | string[]>,
  attr: any,
  option: { id: number; value: string },
) {
  const key = String(attr?.id ?? '')
  if (!key) return
  if (workbench[key] !== undefined || prefilled[key] !== undefined) return
  if (isAttrValueFilled(attr, attr?.value)) {
    prefilled[key] = String(attr.value)
    return
  }

  const options = Array.isArray(attr.dictionary_values) ? attr.dictionary_values : []
  const matched = options.find(
    (item: any) =>
      Number(item?.id) === option.id ||
      normalizeFeatureName(item?.value) === normalizeFeatureName(option.value),
  )
  if ((attr?.dictionary_id ?? 0) !== 0) {
    if (!matched) return
    if (attr?.is_collection) {
      prefilled[key] = [String(matched.id)]
    } else {
      prefilled[key] = String(matched.id)
    }
    return
  }
  prefilled[key] = option.value
}

/** 无 AI 帮填时补品牌/产地/类型/描述等公共特征默认值 */
function buildDefaultPrefilledValues(
  featureAttrs: any[],
  transformed: AiAutoSelectDraftItem['transformed'],
  existingPrefilled: Record<string, string | number | string[]>,
  existingWorkbench: Record<string, string | number | string[]>,
  resolvedTypeId: string,
  aiPublicData?: Record<string, unknown>,
): {
  prefilled: Record<string, string | number | string[]>
  workbench: Record<string, string | number | string[]>
} {
  const prefilled = { ...existingPrefilled }
  const workbench = { ...existingWorkbench }
  const basicDesc = String(transformed?.global_data?.description_clean_text || '').trim()

  for (const attr of featureAttrs) {
    if (!attr || attr.is_aspect) continue
    const attrId = Number(attr.id)

    if (FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL.has(attrId)) {
      const raw = workbench[String(attrId)] ?? prefilled[String(attrId)] ?? attr?.value
      if (!isAttrValueFilled(attr, raw)) {
        setPrefillValue(prefilled, attr, generateRandomModelCode())
      }
      continue
    }

    if (attrId === FEATURE_ATTR_ID_BRAND || attrId === FEATURE_ATTR_ID_FASHION_BRAND) {
      setDefaultDictionaryPrefill(prefilled, workbench, attr, NO_BRAND_OPTION)
      continue
    }
    if (attrId === FEATURE_ATTR_ID_ORIGIN) {
      setDefaultDictionaryPrefill(prefilled, workbench, attr, CHINA_ORIGIN_OPTION)
      continue
    }
    if (attrId === FEATURE_ATTR_ID_MANUFACTURER) {
      const key = String(attrId)
      if (workbench[key] === undefined && prefilled[key] === undefined) {
        prefilled[key] = CHINA_ORIGIN_OPTION.value
      }
      continue
    }
    if (attrId === FEATURE_ATTR_ID_SHELF_LIFE_DAYS) {
      const key = String(attrId)
      if (workbench[key] === undefined && prefilled[key] === undefined) {
        prefilled[key] = '1095'
      }
      continue
    }
    if (attrId === FEATURE_ATTR_ID_TYPE && resolvedTypeId) {
      const key = String(attrId)
      if (workbench[key] === undefined && prefilled[key] === undefined) {
        prefilled[key] = resolvedTypeId
      }
      continue
    }
    if (attrId === FEATURE_ATTR_ID_DESCRIPTION && basicDesc) {
      const key = String(attrId)
      if (workbench[key] === undefined && prefilled[key] === undefined) {
        const fromAi = aiPublicData?.['简介'] ?? aiPublicData?.['[简介]']
        prefilled[key] = String(fromAi || basicDesc)
      }
    }
  }

  return { prefilled, workbench }
}

/** 从 1688 specs 回填变体 aspect 特征，供 buildV2Attributes 读取 */
function applyAspectValuesFromSpecs(transformed: AiAutoSelectDraftItem['transformed'], featureAttrs: any[]) {
  const root = JSON.parse(JSON.stringify(transformed || {}))
  const aspectAttrs = (featureAttrs || []).filter((attr) => attr?.is_aspect)
  if (!aspectAttrs.length) return root

  for (const sku of root?.sku_matrix || []) {
    const specs = (sku?.specs || {}) as Record<string, string>
    for (const attr of aspectAttrs) {
      const attrKey = String(attr.id)
      const existing = sku?.aspect_feature_values?.[attrKey]
      if (isAttrValueFilled(attr, existing)) continue

      const attrName = normalizeFeatureName(attr?.name || '')
      let matchedValue: string | null = null
      for (const [specKey, specVal] of Object.entries(specs)) {
        if (normalizeFeatureName(specKey) === attrName) {
          matchedValue = String(specVal || '').trim()
          break
        }
      }
      if (!matchedValue) continue

      const mapped = mapAttrValueByDictionary(attr, matchedValue)
      sku.aspect_feature_values = {
        ...(sku.aspect_feature_values || {}),
        [attrKey]: mapped != null ? mapped : matchedValue,
      }
    }
  }
  return root
}

/** 解析 SKU 图片 URL
 * @param sku SKU
 * @param mainImages 主图片
 * @returns 解析 SKU 图片 URL
 */
function resolveSkuImageUrls(sku: any, mainImages: string[]): string[] {
  const fromList: string[] = (sku?.skuImgList || [])
    .map((item: any) => String(item?.transformUrl || item?.url || '').trim())
    .filter((url: string) => url.length > 0)
  if (fromList.length) return [...new Set(fromList)]

  const urls: string[] = []
  const primary = String(sku?.sku_image_url || '').trim()
  if (primary) urls.push(primary)
  if (Array.isArray(sku?.carousel_images)) {
    for (const url of sku.carousel_images) {
      const next = String(url || '').trim()
      if (next) urls.push(next)
    }
  }
  if (!urls.length && mainImages.length) {
    urls.push(mainImages[0]!)
  }
  return [...new Set(urls)]
}

/** 解析 SKU 价格
 * @param sku SKU
 * @param item 商品
 * @returns 解析 SKU 价格
 */
function resolveSkuPrice(sku: any, item: AiAutoSelectDraftItem): number {
  const fromSku = Number(sku?.sale_price ?? sku?.price_amount ?? 0)
  if (fromSku > 0) return fromSku
  if (item.listPrice != null && item.listPrice > 0) return item.listPrice
  return fromSku
}

/** 采集箱提交前补全 editState：类目、特征定义与默认回填 */
export async function resolveEditStateForCollectBox(
  item: AiAutoSelectDraftItem,
): Promise<ProductEditState> {
  const existing = item.editState || {}
  let categoryTemplates = existing.categoryTemplates
  let categoryTemplateId = existing.categoryTemplateId ?? null
  let featureAttrs = (existing.featureAttrs || []) as any[]

  if (!categoryTemplates?.length) {
    const title = item.title || item.transformed?.global_data?.product_name || ''
    if (!title.trim()) {
      throw new Error('商品标题缺失，无法获取类目')
    }
    const resolved = await resolveCategoryTemplates(title.trim())
    if (!resolved) {
      throw new Error('获取 AI 智选类目失败')
    }
    categoryTemplates = resolved.templates
    categoryTemplateId = resolved.templateId
  }

  const selectedTemplate =
    categoryTemplates.find((tpl) => tpl.id === categoryTemplateId) || categoryTemplates[0]
  const meta = (selectedTemplate?.data as { metadata?: Record<string, unknown> })?.metadata || {}
  const typeId = String(meta.typeId ?? '')
  const level2Id = String(meta.level2Id ?? '')

  if (!featureAttrs.length) {
    featureAttrs = await loadFeatureAttrsFromCategoryApi(typeId, level2Id)
    if (!featureAttrs.length) {
      throw new Error('类目特征加载失败')
    }
  }

  const { prefilled, workbench } = buildDefaultPrefilledValues(
    featureAttrs,
    item.transformed,
    (existing.prefilledFeatureAttrValues || {}) as Record<string, string | number | string[]>,
    (existing.workbenchFeatureAttrValues || {}) as Record<string, string | number | string[]>,
    typeId,
    existing.aiResultPublicFeatureData as Record<string, unknown> | undefined,
  )

  return {
    ...existing,
    categoryTemplates,
    categoryTemplateId,
    featureAttrs,
    prefilledFeatureAttrValues: prefilled,
    workbenchFeatureAttrValues: workbench,
  }
}

/**
 * 构建采集箱 ProductItem[]（独立于 aiCreateV2 上架 payload，不修改 buildOzonSubmitPayload）
 */
export async function buildCollectionBoxProductItems(
  item: AiAutoSelectDraftItem,
): Promise<CollectionBoxProductItem[]> {
  const editState = await resolveEditStateForCollectBox(item)
  const draftWithEdit: AiAutoSelectDraftItem = {
    ...item,
    editState,
  }

  const { submitCtx } = buildSubmitContextsFromDraftItem(draftWithEdit, {
    selectedShopIds: [],
    shopWarehouseInventory: {},
  })

  const selectedCategoryTemplate = submitCtx.categoryTemplates.find(
    (tpl) => tpl.id === submitCtx.categoryTemplateId,
  )
  const categoryMeta: Record<string, unknown> =
    (selectedCategoryTemplate?.data?.metadata as Record<string, unknown>) || {}
  const descriptionCategoryId = toLongOrNull(
    categoryMeta.descriptionCategoryId ?? categoryMeta.level2Id,
  )
  const typeId = toLongOrNull(categoryMeta.typeId)

  if (!descriptionCategoryId || !typeId) {
    throw new Error('类目信息不完整，无法构建采集箱商品')
  }

  const transformedData = applyAspectValuesFromSpecs(item.transformed, submitCtx.featureAttrs)
  const root = JSON.parse(JSON.stringify(transformedData || {}))
  const firstFeatureData = submitCtx.aiResultPublicFeatureData || {}
  const basicName = String(root?.global_data?.product_name || '').trim()
  const basicDesc = String(root?.global_data?.description_clean_text || '').trim()
  const mainImages = (root?.global_data?.media_gallery?.main_images || []) as string[]
  const submitImageUploadCache = new Map<string, string>()

  let aiRowsFallback: any[] = []
  if (!Array.isArray(submitCtx.aiResultJsonList) || submitCtx.aiResultJsonList.length === 0) {
    try {
      const parsed = submitCtx.parseAiOutputFallback?.()
      if (Array.isArray(parsed)) {
        aiRowsFallback = parsed
      }
    } catch {
      aiRowsFallback = []
    }
  }

  const submitCtxWithData = {
    ...submitCtx,
    transformedData: root,
  }

  return Promise.all(
    (root?.sku_matrix || []).map(async (sku: any, index: number) => {
      const priceValue = resolveSkuPrice(sku, item)
      const imagesRaw = resolveSkuImageUrls(sku, mainImages)
      const images = await normalizeSubmitImagesToOss(
        imagesRaw,
        submitImageUploadCache,
        index,
      )
      const prefix = String(sku?.offerid_prefix || generateDefaultOfferidPrefix())
      const aiResultRow = submitCtx.aiResultJsonList?.[index] || aiRowsFallback[index] || {}
      const nameFromAi = String(aiResultRow?.['[商品名称]'] || '').trim()
      const rowTitle = String(sku?.sku_name || '')
        .replace(/\s+/g, ' ')
        .trim()
      const itemName = rowTitle || basicName || nameFromAi || `SKU-${index + 1}`

      const attributes = buildV2Attributes(
        sku,
        firstFeatureData,
        basicDesc,
        index,
        submitCtxWithData,
      )

      return {
        attributes,
        description_category_id: descriptionCategoryId,
        new_description_category_id: null,
        type_id: typeId,
        currency_code: 'CNY',
        dimension_unit: 'mm',
        weight_unit: 'g',
        depth: toIntOrNull(sku?.length),
        height: toIntOrNull(sku?.height),
        width: toIntOrNull(sku?.width),
        weight: toIntOrNull(sku?.weight),
        price: toPriceString(priceValue),
        old_price: '0',
        name: itemName,
        offer_id: prefix,
        primary_image: images[0] || '',
        images,
      }
    }),
  )
}

/** 采集箱完整请求体（仅 items 使用专用构建逻辑） */
export async function buildCollectionBoxPayload(item: AiAutoSelectDraftItem) {
  const items = await buildCollectionBoxProductItems(item)
  const originalLink =
    item.transformed?.meta_info?.source_url ||
    item.detailUrl ||
    ''
  return {
    shopWarehouseConfigs: [],
    items,
    originalLink,
  }
}

// ── API 调用 ──────────────────────────────────────────────────

export type CollectBoxResult = {
  succeededIds: string[]
  failed: Array<{ id: string; message: string }>
}

/** 将自动选品商品加入采集箱 */
export async function addToCollectBox(items: AiAutoSelectDraftItem[]): Promise<CollectBoxResult> {
  const list = items.filter((i) => i?.transformed)
  const succeededIds: string[] = []
  const failed: Array<{ id: string; message: string }> = []

  if (!list.length) {
    showToast('没有可加入采集箱的商品数据', 3000)
    items.forEach((i) => {
      failed.push({ id: i.id, message: '商品数据缺失' })
    })
    return { succeededIds, failed }
  }

  for (const item of list) {
    const label = item.title || item.offerId || item.id
    try {
      const payload = await buildCollectionBoxPayload(item)
      const res = await apiService.aiCreateV2CollectionBox(payload)
      if (res.code === 200) {
        succeededIds.push(item.id)
      } else {
        failed.push({ id: item.id, message: res.msg || `${label} 加入采集箱失败` })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} 加入采集箱失败`
      failed.push({ id: item.id, message })
    }
  }

  const skipped = items.filter((i) => !i.transformed)
  skipped.forEach((i) => {
    failed.push({ id: i.id, message: '商品数据缺失' })
  })

  if (succeededIds.length > 0 && failed.length === 0) {
    // 成功提示由调用方展示
  } else if (succeededIds.length === 0) {
    showToast(failed[0]?.message || '加入采集箱失败', 4000)
  } else {
    showToast(`成功 ${succeededIds.length} 个，失败 ${failed.length} 个`, 4000)
  }

  return { succeededIds, failed }
}

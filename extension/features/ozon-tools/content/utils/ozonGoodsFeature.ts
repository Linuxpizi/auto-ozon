/**
 * Ozon 采集页俄文特征 ↔ ruOssPath / zhOssPath 属性定义匹配回填
 */

/** 类型（由类目 metadata.typeId 单独回填，不走俄文采集匹配） */
export const OZON_FEATURE_ATTR_ID_TYPE = 8229

/** variantAttr 对应的中文/俄文类目特征 id */
export const OZON_VARIANT_FEATURE_ATTR_IDS = {
  /** 商品颜色 / Цвет товара */
  PRODUCT_COLOR: 10096,
  /** 颜色名称 / Название цвета */
  COLOR_NAME: 10097,
  /** 俄罗斯尺码 / Российский размер */
  RUSSIAN_SIZE: 4295,
  /** 由制造商规定尺码 / Размер производителя */
  MANUFACTURER_SIZE: 9533,
} as const

/** 采集俄文匹配时跳过的特征 id（与 AiCollectModal 中列表一致） */
export const OZON_ATTRIBUTE_IDS_SKIP_COLLECTED_MATCH = [
  22232,
  22273,
  22390,
  13164,
  21837,
]

export type OzonCollectedFeatureItem = {
  name?: string
  value?: unknown
}

import type { OzonGoodsRow as BaseOzonGoodsRow, OzonVariantAttrItem } from './collectedGoodsTransform'
import {
  extractOzonRowsFromRaw as extractOzonRowsFromRawBase,
  buildSpecsFromOzonVariantAttr,
  parseOzonSkuNameSpecParts,
  extractFirstVariantValue,
} from './collectedGoodsTransform'

export type { OzonVariantAttrItem }
export { buildSpecsFromOzonVariantAttr, parseOzonSkuNameSpecParts, extractFirstVariantValue }

/** 从采集 raw 读取 ozon-main 返回的 rows（含 shopFeatureAttrs 扩展字段） */
export function extractOzonRowsFromRaw(rawDataObj: unknown): OzonGoodsRow[] | null {
  return extractOzonRowsFromRawBase(rawDataObj as Parameters<typeof extractOzonRowsFromRawBase>[0]) as OzonGoodsRow[] | null
}

export type OzonShopFeatureAttr = {
  key?: string | number
  value?: unknown
  complex?: unknown[]
  complex_collection?: unknown[]
  collection?: unknown[]
}

export type OzonGoodsRow = BaseOzonGoodsRow & {
  /** /sku/shops 中非包装类 attributes（key 对应 ruOssPath/zhOssPath 的 attr.id） */
  shopFeatureAttrs?: OzonShopFeatureAttr[]
}

export type ApplyCollectedOzonFeaturesInput = {
  ruAttrs: any[]
  zhFeatureAttrs: any[]
  features: OzonCollectedFeatureItem[]
  skuMatrix: any[]
  /** ozon-main buildEditUploadDataBySku 返回的 rows，含每 SKU 的 variantAttr */
  ozonRows?: OzonGoodsRow[] | null
  prefilledFeatureAttrValues: Record<string, string | number | string[]>
  workbenchFeatureAttrValues: Record<string, string | number | string[]>
}

export type ApplyCollectedOzonFeaturesResult = {
  prefilledFeatureAttrValues: Record<string, string | number | string[]>
  publicMatched: number
  aspectMatched: number
  variantAttrMatched: number
  shopFeatureMatched: number
}

/** 页面英文/缩写颜色 → 俄文字典值（用于 10096 字典匹配） */
const OZON_PAGE_COLOR_TO_RU: Record<string, string> = {
  white: 'белый',
  black: 'чёрный',
  grey: 'серый',
  gray: 'серый',
  bule: 'синий',
  blue: 'синий',
  red: 'красный',
  green: 'зелёный',
  yellow: 'жёлтый',
  pink: 'розовый',
  orange: 'оранжевый',
  purple: 'фиолетовый',
  brown: 'коричневый',
  beige: 'бежевый',
}

const normalizeFeatureName = (name: string): string => {
  return String(name || '')
    .trim()
    .replace(/^\[+|\]+$/g, '')
    .trim()
}

const asArrayValue = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean)
  }
  if (raw == null) {
    return []
  }
  return String(raw)
    .split(/[;；,，|/]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

const isAttrValueFilled = (attr: any, raw: unknown): boolean => {
  if (attr?.is_collection) {
    return asArrayValue(raw).length > 0
  }
  if (Array.isArray(raw)) {
    return raw.some((item) => String(item ?? '').trim() !== '')
  }
  return String(raw ?? '').trim() !== ''
}

/** 用属性定义中的 dictionary_values 将采集文本解析为字典 id 或纯文本 */
export const mapAttrValueByDictionary = (
  attr: any,
  rawValue: unknown
): string | string[] | null => {
  if (attr.dictionary_id === 0) {
    if (rawValue == null) return ''
    if (Array.isArray(rawValue)) {
      return rawValue.map((v) => String(v ?? '').trim()).filter(Boolean).join('; ')
    }
    return String(rawValue)
  }
  const options = Array.isArray(attr.dictionary_values) ? attr.dictionary_values : []
  const findOptionId = (input: unknown): string | null => {
    const text = String(input ?? '').trim()
    if (!text) return null
    const matched = options.find((opt: any) => {
      return (
        String(opt?.id) === text ||
        normalizeFeatureName(opt?.value) === normalizeFeatureName(text)
      )
    })
    return matched ? String(matched.id) : null
  }
  if (attr.is_collection) {
    const ids = asArrayValue(rawValue)
      .map(findOptionId)
      .filter((id): id is string => Boolean(id))
    return ids.length > 0 ? ids : null
  }
  return findOptionId(rawValue)
}

const getRawValueByFeatureName = (
  featureData: Record<string, unknown>,
  attrName: string
): unknown => {
  const normalizedTarget = normalizeFeatureName(attrName)
  const entry = Object.entries(featureData || {}).find(([key]) => {
    return normalizeFeatureName(key) === normalizedTarget
  })
  return entry ? entry[1] : undefined
}

/** 将 global_data.features（Ozon 页俄文 name/value）转为按名称索引的 map */
export function buildCollectedFeatureMapFromFeatures(
  features: OzonCollectedFeatureItem[] | null | undefined
): Record<string, unknown> {
  if (!Array.isArray(features)) {
    return {}
  }
  const map: Record<string, unknown> = {}
  features.forEach((item) => {
    const name = String(item?.name ?? '').trim()
    if (!name) return
    let value = item?.value
    if (Array.isArray(value)) {
      value = value.length <= 1 ? (value[0] ?? '') : value
    }
    if (value === undefined || value === null || value === '') return
    map[name] = value
  })
  return map
}

export function shouldSkipCollectedOzonFeatureAttr(attrId: number): boolean {
  if (OZON_ATTRIBUTE_IDS_SKIP_COLLECTED_MATCH.includes(attrId)) {
    return true
  }
  if (attrId === OZON_FEATURE_ATTR_ID_TYPE) {
    return true
  }
  return false
}

/** 俄文 aspect 属性名 → attr id（用于 variantAttr.name 通用匹配） */
const buildRuNameToAspectIdMap = (
  zhFeatureAttrs: any[],
  ruById: Map<number, any>
): Map<string, number> => {
  const map = new Map<string, number>()
  zhFeatureAttrs.forEach((zhAttr: any) => {
    if (!zhAttr?.is_aspect) return
    const id = Number(zhAttr?.id)
    if (!Number.isFinite(id) || shouldSkipCollectedOzonFeatureAttr(id)) {
      return
    }
    const ruAttr = ruById.get(id)
    const ruName = normalizeFeatureName(ruAttr?.name || '')
    if (ruName) {
      map.set(ruName, id)
    }
  })
  return map
}

/** variantAttr.name 是否为颜色（如 Цвет） */
const isVariantColorAttrName = (name: string): boolean => {
  const norm = normalizeFeatureName(name).toLowerCase()
  return norm === 'цвет' || norm.includes('цвет')
}

/** variantAttr.name 是否为尺码（如 Выберите размер） */
const isVariantSizeAttrName = (name: string): boolean => {
  const norm = normalizeFeatureName(name).toLowerCase()
  return norm.includes('размер')
}

/** 从 "46 RU / 50-58KG" 提取俄罗斯尺码数字 46 */
export const parseRussianSizeFromVariantValue = (text: string): string | null => {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  const ruMatch = trimmed.match(/(\d+)\s*RU\b/i)
  if (ruMatch) return ruMatch[1]
  const leading = trimmed.match(/^(\d{2,3})\b/)
  return leading ? leading[1] : null
}

/** 页面颜色文案匹配 10096 俄文字典项 */
const mapPageColorToProductColorDict = (
  ruAttr: any,
  pageColor: string
): string | string[] | null => {
  const key = normalizeFeatureName(pageColor).toLowerCase()
  const ruColor = OZON_PAGE_COLOR_TO_RU[key] ?? pageColor
  let mapped = mapAttrValueByDictionary(ruAttr, ruColor)
  if (mapped != null) return mapped

  const options = Array.isArray(ruAttr?.dictionary_values) ? ruAttr.dictionary_values : []
  const fuzzy = options.find((opt: any) => {
    const ov = normalizeFeatureName(opt?.value).toLowerCase()
    return (
      ov === key ||
      ov.includes(key) ||
      key.includes(ov) ||
      ov.includes(ruColor.toLowerCase())
    )
  })
  if (!fuzzy) return null
  const id = String(fuzzy.id)
  return ruAttr?.is_collection ? [id] : id
}

export type MapVariantAttrItemOptions = {
  /** 俄文 aspect 属性名 → id，用于宽/高等非颜色尺码维度按 name 匹配 */
  ruNameToAspectId?: Map<string, number>
}

/**
 * 单条 variantAttr（Цвет / Выберите размер / Ширина, см 等）→ 特征属性 id 映射值
 */
export const mapVariantAttrItemToFeatureValues = (
  variantAttr: OzonVariantAttrItem,
  ruById: Map<number, any>,
  options?: MapVariantAttrItemOptions
): Map<number, string | string[]> => {
  const out = new Map<number, string | string[]>()
  const name = String(variantAttr?.name ?? '').trim()
  const rawVal = extractFirstVariantValue(variantAttr)
  if (!name || !rawVal) return out

  if (isVariantColorAttrName(name)) {
    const ruColorName = ruById.get(OZON_VARIANT_FEATURE_ATTR_IDS.COLOR_NAME)
    if (ruColorName) {
      const v = mapAttrValueByDictionary(ruColorName, rawVal)
      if (v != null && v !== '') {
        out.set(OZON_VARIANT_FEATURE_ATTR_IDS.COLOR_NAME, v as string | string[])
      }
    }
    const ruProductColor = ruById.get(OZON_VARIANT_FEATURE_ATTR_IDS.PRODUCT_COLOR)
    if (ruProductColor) {
      const v = mapPageColorToProductColorDict(ruProductColor, rawVal)
      if (v != null) {
        out.set(OZON_VARIANT_FEATURE_ATTR_IDS.PRODUCT_COLOR, v)
      }
    }
  }

  if (isVariantSizeAttrName(name)) {
    const ruManufacturer = ruById.get(OZON_VARIANT_FEATURE_ATTR_IDS.MANUFACTURER_SIZE)
    if (ruManufacturer) {
      const v = mapAttrValueByDictionary(ruManufacturer, rawVal)
      if (v != null && v !== '') {
        out.set(OZON_VARIANT_FEATURE_ATTR_IDS.MANUFACTURER_SIZE, v as string | string[])
      }
    }
    const ruRussianSize = ruById.get(OZON_VARIANT_FEATURE_ATTR_IDS.RUSSIAN_SIZE)
    if (ruRussianSize) {
      const ruSizeNum = parseRussianSizeFromVariantValue(rawVal)
      if (ruSizeNum) {
        const v = mapAttrValueByDictionary(ruRussianSize, ruSizeNum)
        if (v != null) {
          out.set(OZON_VARIANT_FEATURE_ATTR_IDS.RUSSIAN_SIZE, v)
        }
      }
    }
  }

  // 宽/高等其它变体维度：variantAttr.name 与俄文 aspect 属性名精确匹配
  const ruNameToAspectId = options?.ruNameToAspectId
  if (ruNameToAspectId) {
    const aspectId = ruNameToAspectId.get(normalizeFeatureName(name))
    if (aspectId != null && !out.has(aspectId)) {
      const ruAttr = ruById.get(aspectId)
      if (ruAttr) {
        const v = mapAttrValueByDictionary(ruAttr, rawVal)
        if (v != null && v !== '') {
          out.set(aspectId, v as string | string[])
        }
      }
    }
  }

  return out
}

const findSkuRowByOzonRow = (matrix: any[], ozonRow: OzonGoodsRow): any | null => {
  const skuId = String(ozonRow?.sku ?? '').trim()
  if (!skuId) return null
  return (
    matrix.find((sku) => String(sku?.sku_unique_id ?? '').trim() === skuId) ?? null
  )
}

/** /sku/shops attribute.key → 特征属性 id（与 ruOssPath/zhOssPath 的 attr.id 一致） */
export const parseShopFeatureAttrId = (
  key: string | number | null | undefined
): number | null => {
  const id = Number(String(key ?? '').trim())
  return Number.isFinite(id) ? id : null
}

/** 从 complex / complex_collection 等未知嵌套结构中收集叶子值 */
const collectShopFeatureLeafValues = (node: unknown, out: unknown[]): void => {
  if (node == null) return
  if (Array.isArray(node)) {
    node.forEach((item) => collectShopFeatureLeafValues(item, out))
    return
  }
  if (typeof node !== 'object') {
    const text = String(node).trim()
    if (text) out.push(node)
    return
  }
  const obj = node as Record<string, unknown>
  if (obj.dictionary_value_id != null && String(obj.dictionary_value_id).trim() !== '') {
    out.push(obj.dictionary_value_id)
    return
  }
  if (obj.value != null && String(obj.value).trim() !== '') {
    out.push(obj.value)
    return
  }
  if (Array.isArray(obj.attributes)) {
    obj.attributes.forEach((attr) => collectShopFeatureLeafValues(attr, out))
    return
  }
  if (Array.isArray(obj.collection)) {
    obj.collection.forEach((item) => collectShopFeatureLeafValues(item, out))
    return
  }
  if (obj.key != null && obj.value != null && String(obj.value).trim() !== '') {
    out.push(obj.value)
  }
}

const flattenShopFeatureComplexNodes = (
  nodes: unknown[] | null | undefined
): unknown[] => {
  const leaves: unknown[] = []
  if (!Array.isArray(nodes)) {
    return leaves
  }
  nodes.forEach((node) => collectShopFeatureLeafValues(node, leaves))
  return leaves
}

/**
 * 从 /sku/shops 单条 attribute（shopFeatureAttrs 项）提取原始值，供字典映射
 * 优先 value → collection → complex → complex_collection，结构未知时递归取叶子
 */
export const extractRawValueFromShopFeatureAttr = (
  item: OzonShopFeatureAttr | null | undefined
): unknown => {
  if (!item || typeof item !== 'object') {
    return undefined
  }

  if (item.value != null && String(item.value).trim() !== '') {
    return item.value
  }

  const collection = item.collection
  if (Array.isArray(collection) && collection.length > 0) {
    return collection
  }

  const complexLeaves = flattenShopFeatureComplexNodes(item.complex)
  if (complexLeaves.length > 0) {
    return complexLeaves.length === 1 ? complexLeaves[0] : complexLeaves
  }

  const complexCollectionLeaves = flattenShopFeatureComplexNodes(item.complex_collection)
  if (complexCollectionLeaves.length > 0) {
    return complexCollectionLeaves.length === 1
      ? complexCollectionLeaves[0]
      : complexCollectionLeaves
  }

  return undefined
}

/**
 * 用 rows[].shopFeatureAttrs（key=attr.id）按 SKU 回填特征属性
 * 公共属性写入 prefilled，变体属性写入对应 sku.aspect_feature_values
 */
export const applyOzonShopFeatureAttrsFromRows = (input: {
  ozonRows: OzonGoodsRow[]
  skuMatrix: any[]
  ruById: Map<number, any>
  zhFeatureAttrs: any[]
  prefilledFeatureAttrValues: Record<string, string | number | string[]>
  workbenchFeatureAttrValues: Record<string, string | number | string[]>
}): { publicMatched: number; aspectMatched: number; prefilledFeatureAttrValues: Record<string, string | number | string[]> } => {
  const {
    ozonRows,
    skuMatrix,
    ruById,
    zhFeatureAttrs,
    workbenchFeatureAttrValues,
  } = input
  let prefilledFeatureAttrValues = { ...input.prefilledFeatureAttrValues }
  if (!ozonRows.length || !skuMatrix.length) {
    return { publicMatched: 0, aspectMatched: 0, prefilledFeatureAttrValues }
  }

  const zhAttrById = new Map<number, any>()
  zhFeatureAttrs.forEach((attr: any) => {
    const id = Number(attr?.id)
    if (Number.isFinite(id)) {
      zhAttrById.set(id, attr)
    }
  })

  let publicMatched = 0
  let aspectMatched = 0

  ozonRows.forEach((ozonRow) => {
    const shopAttrs = ozonRow.shopFeatureAttrs
    if (!Array.isArray(shopAttrs) || !shopAttrs.length) {
      return
    }

    const sku = findSkuRowByOzonRow(skuMatrix, ozonRow)

    shopAttrs.forEach((shopItem) => {
      const attrId = parseShopFeatureAttrId(shopItem?.key)
      if (attrId == null || shouldSkipCollectedOzonFeatureAttr(attrId)) {
        return
      }

      const zhAttr = zhAttrById.get(attrId)
      const ruAttr = ruById.get(attrId)
      if (!zhAttr || !ruAttr) {
        return
      }

      const raw = extractRawValueFromShopFeatureAttr(shopItem)
      if (raw === undefined) {
        return
      }

      const mappedValue = mapAttrValueByDictionary(ruAttr, raw)
      if (mappedValue == null) {
        return
      }

      const attrKey = String(attrId)

      if (zhAttr.is_aspect) {
        if (!sku) {
          return
        }
        const workbenchAspect = workbenchFeatureAttrValues[attrKey]
        if (workbenchAspect !== undefined && isAttrValueFilled(zhAttr, workbenchAspect)) {
          return
        }
        const existingAspect = sku?.aspect_feature_values?.[attrKey]
        if (existingAspect !== undefined && isAttrValueFilled(zhAttr, existingAspect)) {
          return
        }
        sku.aspect_feature_values = {
          ...(sku.aspect_feature_values || {}),
          [attrKey]: mappedValue,
        }
        aspectMatched += 1
        return
      }

      const workbenchOnly = workbenchFeatureAttrValues[attrKey]
      if (workbenchOnly !== undefined && isAttrValueFilled(zhAttr, workbenchOnly)) {
        return
      }
      const existingPrefill = prefilledFeatureAttrValues[attrKey]
      if (existingPrefill !== undefined && isAttrValueFilled(zhAttr, existingPrefill)) {
        return
      }

      prefilledFeatureAttrValues[attrKey] = mappedValue
      publicMatched += 1
    })
  })

  return { publicMatched, aspectMatched, prefilledFeatureAttrValues }
}

/** 用 rows[].variantAttr 按 SKU 回填变体特征（颜色/尺码及按 name 匹配的其它 aspect） */
export const applyOzonVariantAttrFromRows = (input: {
  ozonRows: OzonGoodsRow[]
  skuMatrix: any[]
  ruById: Map<number, any>
  zhFeatureAttrs: any[]
  workbenchFeatureAttrValues: Record<string, string | number | string[]>
}): number => {
  const { ozonRows, skuMatrix, ruById, zhFeatureAttrs, workbenchFeatureAttrValues } = input
  if (!ozonRows.length || !skuMatrix.length) return 0

  const zhAspectById = new Map<number, any>()
  zhFeatureAttrs.forEach((attr: any) => {
    const id = Number(attr?.id)
    if (Number.isFinite(id) && attr?.is_aspect) {
      zhAspectById.set(id, attr)
    }
  })
  const ruNameToAspectId = buildRuNameToAspectIdMap(zhFeatureAttrs, ruById)

  let matched = 0
  ozonRows.forEach((ozonRow) => {
    const sku = findSkuRowByOzonRow(skuMatrix, ozonRow)
    if (!sku) return
    const variantList = ozonRow.variantAttr
    if (!Array.isArray(variantList)) return

    variantList.forEach((variantAttr) => {
      const mapped = mapVariantAttrItemToFeatureValues(variantAttr, ruById, {
        ruNameToAspectId,
      })
      mapped.forEach((value, attrId) => {
        const zhAttr = zhAspectById.get(attrId)
        if (!zhAttr) return
        const aspectKey = String(attrId)
        const workbenchAspect = workbenchFeatureAttrValues[aspectKey]
        if (workbenchAspect !== undefined && isAttrValueFilled(zhAttr, workbenchAspect)) {
          return
        }
        sku.aspect_feature_values = {
          ...(sku.aspect_feature_values || {}),
          [aspectKey]: value,
        }
        matched += 1
      })
    })
  })

  return matched
}

/**
 * 用 ruOssPath 属性定义（俄文 name + dictionary_values）匹配页面采集值，
 * 再按相同 attr id 写入中文 featureAttrs 对应字段（字典项 id 与语种无关）
 */
export function applyCollectedOzonFeaturesFromRuAttrs(
  input: ApplyCollectedOzonFeaturesInput
): ApplyCollectedOzonFeaturesResult {
  const collectedMap = buildCollectedFeatureMapFromFeatures(input.features)
  const emptyResult: ApplyCollectedOzonFeaturesResult = {
    prefilledFeatureAttrValues: { ...input.prefilledFeatureAttrValues },
    publicMatched: 0,
    aspectMatched: 0,
    variantAttrMatched: 0,
    shopFeatureMatched: 0,
  }

  if (!Array.isArray(input.zhFeatureAttrs) || !input.zhFeatureAttrs.length) {
    return emptyResult
  }

  const ruById = new Map<number, any>()
  input.ruAttrs.forEach((attr: any) => {
    const id = Number(attr?.id)
    if (Number.isFinite(id)) {
      ruById.set(id, attr)
    }
  })

  let nextPrefilled: Record<string, string | number | string[]> = {
    ...input.prefilledFeatureAttrValues,
  }
  let publicMatched = 0

  if (Object.keys(collectedMap).length > 0) {
    input.zhFeatureAttrs.forEach((zhAttr: any) => {
      if (zhAttr?.is_aspect) return
      const attrId = Number(zhAttr?.id)
      if (!Number.isFinite(attrId) || shouldSkipCollectedOzonFeatureAttr(attrId)) {
        return
      }
      const ruAttr = ruById.get(attrId)
      if (!ruAttr) return

      const workbenchOnly = input.workbenchFeatureAttrValues[String(attrId)]
      if (workbenchOnly !== undefined && isAttrValueFilled(zhAttr, workbenchOnly)) {
        return
      }

      const raw = getRawValueByFeatureName(collectedMap, ruAttr?.name || '')
      if (raw === undefined) return

      const mappedValue = mapAttrValueByDictionary(ruAttr, raw)
      if (mappedValue == null) return

      nextPrefilled[String(attrId)] = mappedValue
      publicMatched += 1
    })
  }

  const matrix = input.skuMatrix
  const variantTargetIds = new Set<number>(Object.values(OZON_VARIANT_FEATURE_ATTR_IDS))
  const ruNameToAspectId = buildRuNameToAspectIdMap(input.zhFeatureAttrs, ruById)

  // 优先用 ozonRows.variantAttr 按 SKU 回填，避免 specs 解析错误污染 aspect
  let variantAttrMatched = 0
  const ozonRows = input.ozonRows
  if (Array.isArray(ozonRows) && ozonRows.length > 0 && Array.isArray(matrix) && matrix.length > 0) {
    variantAttrMatched = applyOzonVariantAttrFromRows({
      ozonRows,
      skuMatrix: matrix,
      ruById,
      zhFeatureAttrs: input.zhFeatureAttrs,
      workbenchFeatureAttrValues: input.workbenchFeatureAttrValues,
    })
  } else if (Array.isArray(matrix) && matrix.length > 0) {
    // 无 rows 时回退：用 specs 键名匹配 variant 规则（含宽/高等 name 精确匹配）
    matrix.forEach((sku: any) => {
      if (!sku?.specs || typeof sku.specs !== 'object') return
      Object.entries(sku.specs as Record<string, string>).forEach(([specName, specValue]) => {
        const mapped = mapVariantAttrItemToFeatureValues(
          { name: specName, value: [String(specValue)] },
          ruById,
          { ruNameToAspectId }
        )
        mapped.forEach((value, attrId) => {
          const zhAttr = input.zhFeatureAttrs.find(
            (a: any) => Number(a?.id) === attrId && a?.is_aspect
          )
          if (!zhAttr) return
          const aspectKey = String(attrId)
          const workbenchAspect = input.workbenchFeatureAttrValues[aspectKey]
          if (workbenchAspect !== undefined && isAttrValueFilled(zhAttr, workbenchAspect)) {
            return
          }
          sku.aspect_feature_values = {
            ...(sku.aspect_feature_values || {}),
            [aspectKey]: value,
          }
          variantAttrMatched += 1
        })
      })
    })
  }

  let aspectMatched = 0
  if (Array.isArray(matrix) && matrix.length > 0) {
    input.zhFeatureAttrs.forEach((zhAttr: any) => {
      if (!zhAttr?.is_aspect) return
      const attrId = Number(zhAttr?.id)
      if (!Number.isFinite(attrId) || shouldSkipCollectedOzonFeatureAttr(attrId)) {
        return
      }
      // 颜色/尺码及 variantAttr 已回填的 aspect 不再走 specs 兜底
      if (variantTargetIds.has(attrId)) {
        return
      }
      const ruAttr = ruById.get(attrId)
      if (!ruAttr) return
      const ruName = ruAttr?.name || ''

      matrix.forEach((sku: any) => {
        if (!sku || typeof sku !== 'object') return
        const aspectKey = String(attrId)
        const workbenchAspect = input.workbenchFeatureAttrValues[aspectKey]
        if (workbenchAspect !== undefined && isAttrValueFilled(zhAttr, workbenchAspect)) {
          return
        }
        const existingAspect = sku?.aspect_feature_values?.[aspectKey]
        if (existingAspect !== undefined && isAttrValueFilled(zhAttr, existingAspect)) {
          return
        }

        let raw: unknown = undefined
        const specs = sku?.specs
        if (specs && typeof specs === 'object') {
          raw = getRawValueByFeatureName(specs as Record<string, unknown>, ruName)
        }
        if (raw === undefined) {
          raw = getRawValueByFeatureName(collectedMap, ruName)
        }
        if (raw === undefined) return

        const mappedValue = mapAttrValueByDictionary(ruAttr, raw)
        if (mappedValue == null) return

        sku.aspect_feature_values = {
          ...(sku.aspect_feature_values || {}),
          [aspectKey]: mappedValue,
        }
        aspectMatched += 1
      })
    })
  }

  // /sku/shops 非包装 attributes：按 key=attr.id 通用回填（每条 shopFeatureAttrs 未知结构）
  let shopFeatureMatched = 0
  if (Array.isArray(ozonRows) && ozonRows.length > 0 && Array.isArray(matrix) && matrix.length > 0) {
    const shopApply = applyOzonShopFeatureAttrsFromRows({
      ozonRows,
      skuMatrix: matrix,
      ruById,
      zhFeatureAttrs: input.zhFeatureAttrs,
      prefilledFeatureAttrValues: nextPrefilled,
      workbenchFeatureAttrValues: input.workbenchFeatureAttrValues,
    })
    nextPrefilled = shopApply.prefilledFeatureAttrValues
    publicMatched += shopApply.publicMatched
    aspectMatched += shopApply.aspectMatched
    shopFeatureMatched = shopApply.publicMatched + shopApply.aspectMatched
  }

  if (publicMatched > 0 || aspectMatched > 0 || variantAttrMatched > 0 || shopFeatureMatched > 0) {
    console.log(
      '[采集特征] 俄文配置匹配回填：公共',
      publicMatched,
      '项，变体',
      aspectMatched,
      '项，variantAttr',
      variantAttrMatched,
      '项，shopFeatureAttrs',
      shopFeatureMatched,
      '项'
    )
  }

  return {
    prefilledFeatureAttrValues: nextPrefilled,
    publicMatched,
    aspectMatched,
    variantAttrMatched,
    shopFeatureMatched,
  }
}

import type { CategoryItem } from '../../utils/aiApi'

/** 从采集 raw 中读取 /sku/shops 返回的 categories（MAIN 世界挂在顶层或 data 上） */
export function extractGoodsCategoryFromRaw(rawDataObj: any): any[] | null {
  if (!rawDataObj || typeof rawDataObj !== 'object') {
    return null
  }

  const pick = (value: unknown): any[] | null => {
    if (Array.isArray(value) && value.length > 0) {
      return value
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return [value]
    }
    return null
  }

  return (
    pick(rawDataObj.goodsCategory) ||
    pick(rawDataObj.data?.goodsCategory) ||
    pick(rawDataObj.data?.result?.goodsCategory) ||
    null
  )
}

function readStr(obj: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key]
    if (v != null && String(v).trim() !== '') {
      return String(v).trim()
    }
  }
  return ''
}

/** 单条类目记录归一为 CategoryItem（兼容 ERP metadata 与 Ozon description_category 层级） */
export function normalizeGoodsCategoryEntry(entry: any): CategoryItem | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  if (entry.metadata && typeof entry.metadata === 'object') {
    const md = entry.metadata as Record<string, any>
    const typeId = readStr(md, ['typeId', 'type_id'])
    const level2Id = readStr(md, ['level2Id', 'level2_id', 'description_category_id'])
    const level1Id = readStr(md, ['level1Id', 'level1_id'])
    const level1NameZh = readStr(md, ['level1NameZh', 'level1Name', 'level1_name_zh'])
    const level2NameZh = readStr(md, ['level2NameZh', 'level2Name', 'level2_name_zh'])
    const typeNameZh = readStr(md, ['typeNameZh', 'typeName', 'type_name_zh'])
    if (!typeId && !level2Id && !level1NameZh && !level2NameZh && !typeNameZh) {
      return null
    }
    return {
      metadata: {
        level1NameZh,
        level2NameZh,
        typeNameZh,
        level1Id,
        level2Id,
        typeId,
        ...md,
      },
    }
  }

  const src = entry as Record<string, any>
  const typeId = readStr(src, ['typeId', 'type_id', 'description_type_id'])
  const level2Id = readStr(src, ['level2Id', 'level2_id', 'description_category_id', 'descriptionCategoryId'])
  const level1Id = readStr(src, ['level1Id', 'level1_id'])
  const level1NameZh = readStr(src, [
    'level1NameZh',
    'level1Name',
    'level1_name_zh',
    'category_name',
    'categoryName',
    'name',
  ])
  const level2NameZh = readStr(src, ['level2NameZh', 'level2Name', 'level2_name_zh'])
  const typeNameZh = readStr(src, ['typeNameZh', 'typeName', 'type_name_zh', 'type_name', 'typeNameRu'])

  if (!typeId && !level2Id && !level1NameZh && !level2NameZh && !typeNameZh) {
    return null
  }

  return {
    metadata: {
      level1NameZh,
      level2NameZh,
      typeNameZh,
      level1Id,
      level2Id,
      typeId,
    },
  }
}

/** /sku/shops 返回：{ level: "2"|"3"|..., name, id }[] */
function isSkuShopsLevelCategories(categories: any[]): boolean {
  return (
    categories.length >= 2 &&
    categories.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        c.level != null &&
        c.id != null &&
        c.name != null
    )
  )
}

/**
 * 将 level 2~5 链路映射为工作台三级类目（与 descriptionCategoryTree.json 一致）
 * - level 2 → 树一级 level1Id
 * - level 3 → 树二级 level2Id（弹窗展开用，须在树中存在）
 * - level 4 → descriptionCategoryId（上架提交用，可能不在树 JSON 中）
 * - level 5 → 树三级叶子 typeId
 */
function mergeSkuShopsLevelCategories(categories: any[]): CategoryItem | null {
  const sorted = [...categories].sort(
    (a, b) => Number(a.level) - Number(b.level)
  )
  if (!sorted.length) {
    return null
  }

  const byLevel = (lv: string) =>
    sorted.find((c) => String(c.level) === lv)

  const l2 = byLevel('2') || sorted[0]
  const l3 = byLevel('3')
  const l4 = byLevel('4')
  const l5 = byLevel('5') || sorted[sorted.length - 1]

  const level1Id = String(l2?.id ?? '').trim()
  const level1NameZh = String(l2?.name ?? '').trim()
  const typeId = String(l5?.id ?? '').trim()
  const typeNameZh = String(l5?.name ?? '').trim()
  const level2Id = String(l3?.id ?? '').trim()
  const level2NameZh = String(l3?.name ?? '').trim()
  const descriptionCategoryId = String(l4?.id ?? l3?.id ?? '').trim()

  if (!level1Id && !level2Id && !typeId && !level1NameZh && !level2NameZh && !typeNameZh) {
    return null
  }

  return {
    metadata: {
      level1NameZh,
      level2NameZh,
      typeNameZh,
      level1Id,
      level2Id,
      typeId,
      descriptionCategoryId,
    },
  }
}

/**
 * Ozon 常见层级：若干 description_category + 末尾 type_id
 * 合并为一条三级类目 metadata
 */
function mergeOzonHierarchyCategories(categories: any[]): CategoryItem | null {  const descNodes = categories.filter((c) => {
    const id = c?.description_category_id ?? c?.descriptionCategoryId
    return id != null && String(id).trim() !== ''
  })
  const typeNode =
    categories.find((c) => c?.type_id != null || c?.typeId != null) ||
    categories[categories.length - 1]

  const level1 = descNodes[0]
  const level2 = descNodes.length > 1 ? descNodes[1] : descNodes[0]
  const level1NameZh = readStr(level1 || {}, ['category_name', 'categoryName', 'name', 'title'])
  const level2NameZh = readStr(level2 || {}, ['category_name', 'categoryName', 'name', 'title'])
  const typeNameZh = readStr(typeNode || {}, [
    'type_name',
    'typeName',
    'typeNameZh',
    'category_name',
    'categoryName',
    'name',
  ])
  const level1Id = String(level1?.description_category_id ?? level1?.descriptionCategoryId ?? '')
  const level2Id = String(level2?.description_category_id ?? level2?.descriptionCategoryId ?? '')
  const typeId = String(typeNode?.type_id ?? typeNode?.typeId ?? '')

  if (!level1Id && !level2Id && !typeId && !level1NameZh && !level2NameZh && !typeNameZh) {
    return null
  }

  return {
    metadata: {
      level1NameZh,
      level2NameZh,
      typeNameZh,
      level1Id,
      level2Id,
      typeId,
    },
  }
}

/** 将 goodsCategory 转为工作台 categoryTemplates 列表 */
export function buildCategoryTemplatesFromGoodsCategory(
  categories: any[]
): Array<{ id: number; name: string; data: CategoryItem }> {
  const normalized: CategoryItem[] = []

  if (isSkuShopsLevelCategories(categories)) {
    const merged = mergeSkuShopsLevelCategories(categories)
    if (merged) {
      normalized.push(merged)
    }
  }

  if (!normalized.length) {
    const hasHierarchy =
      categories.some(
        (c) =>
          c?.description_category_id != null ||
          c?.descriptionCategoryId != null ||
          c?.type_id != null ||
          c?.typeId != null
      )

    if (hasHierarchy) {
      const merged = mergeOzonHierarchyCategories(categories)
      if (merged) {
        normalized.push(merged)
      }
    }
  }

  if (!normalized.length) {
    for (const entry of categories) {
      const item = normalizeGoodsCategoryEntry(entry)
      if (item) {
        normalized.push(item)
      }
    }
  }

  return normalized.map((item, index) => {
    const md = item.metadata || {}
    const name = [md.level1NameZh, md.level2NameZh, md.typeNameZh].filter(Boolean).join('/')
    return {
      id: index + 1,
      name: name || `类目${index + 1}`,
      data: item,
    }
  })
}

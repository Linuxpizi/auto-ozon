/**
 * /sku/shops 返回的 attributes（goodsSize）→ 工作台 sku_matrix 包装字段
 * key 为 Ozon 特征属性 id（字符串）
 */
export const OZON_GOODS_SIZE_ATTR_KEYS = {
  weight: '4497',
  length: '9454',
  width: '9455',
  height: '9456',
} as const

const OZON_PACKAGING_ATTR_KEY_SET = new Set<string>(
  Object.values(OZON_GOODS_SIZE_ATTR_KEYS),
)

/** /sku/shops attributes.key 是否为包装长宽高重量字段 */
export function isOzonPackagingAttrKey(key: string | number | null | undefined): boolean {
  if (key == null) {
    return false
  }
  return OZON_PACKAGING_ATTR_KEY_SET.has(String(key))
}

/** 从 /sku/shops attributes 中筛出除包装外的全部项（通用，按 key 排除 4497/9454/9455/9456） */
export function pickNonPackagingShopAttributes(attributes: unknown): any[] {
  if (!Array.isArray(attributes)) {
    return []
  }
  return attributes.filter((item) => item && !isOzonPackagingAttrKey(item?.key))
}

export type OzonPackagingDims = {
  length?: number
  width?: number
  height?: number
  weight?: number
}

function parseAttrNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined
  }
  const num = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(num) ? num : undefined
}

function findAttrValue(attributes: any[], key: string): number | undefined {
  const item = attributes.find((a) => String(a?.key) === key)
  return parseAttrNumber(item?.value)
}

/** 将 goodsSize 属性列表解析为长宽高重量（单位：mm / g） */
export function parsePackagingFromGoodsSize(attributes: any[] | null): OzonPackagingDims | null {
  if (!attributes?.length) {
    return null
  }

  const length = findAttrValue(attributes, OZON_GOODS_SIZE_ATTR_KEYS.length)
  const width = findAttrValue(attributes, OZON_GOODS_SIZE_ATTR_KEYS.width)
  const height = findAttrValue(attributes, OZON_GOODS_SIZE_ATTR_KEYS.height)
  const weight = findAttrValue(attributes, OZON_GOODS_SIZE_ATTR_KEYS.weight)

  if (
    length == null &&
    width == null &&
    height == null &&
    weight == null
  ) {
    return null
  }

  return { length, width, height, weight }
}

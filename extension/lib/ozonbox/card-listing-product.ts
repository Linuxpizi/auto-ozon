import type {
  FactProvenance,
  PackagePhysicalField,
  PackagePhysicalProvenance,
  PackagePhysicalSnapshot,
} from '../utils/types'
import { isRecord, type OzonboxCollectedProduct } from './contract'
import { variantHasExactSku } from './list-crawl-product'
import type { OzonboxAnalyticsItem } from './seller-analytics'

const CARD_LISTING_PACKAGE_FIELDS = [
  'packageWeightG',
  'packageDepthMm',
  'packageWidthMm',
  'packageHeightMm',
] as const satisfies readonly PackagePhysicalField[]

function copiedProvenance(value: unknown): FactProvenance | undefined {
  if (!isRecord(value) || typeof value.source !== 'string' || !value.source.trim()) return undefined
  return { ...value, source: value.source }
}

export function requireCompleteCardPackageFacts(value: unknown, sku: string): PackagePhysicalSnapshot {
  if (!isRecord(value)) throw new Error(`商品卡片 SKU ${sku} 缺少包装长宽高重量事实`)

  const packageFacts: PackagePhysicalSnapshot = {}
  const provenance: PackagePhysicalProvenance = {}
  const sourceProvenance = isRecord(value.packagePhysicalProvenance)
    ? value.packagePhysicalProvenance
    : undefined

  for (const field of CARD_LISTING_PACKAGE_FIELDS) {
    const fieldValue = value[field]
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || fieldValue <= 0) {
      throw new Error(`商品卡片 SKU ${sku} 的 ${field} 缺少有效正数事实`)
    }
    packageFacts[field] = fieldValue
    const fieldProvenance = copiedProvenance(sourceProvenance?.[field])
    if (fieldProvenance) provenance[field] = fieldProvenance
  }

  if (Object.keys(provenance).length > 0) packageFacts.packagePhysicalProvenance = provenance
  return packageFacts
}

/** Read the complete canonical package facts produced by the normalized analytics item for this card SKU. */
export function requireCardListingPackageFacts(
  analyticsItem: OzonboxAnalyticsItem | null,
  sku: string,
): PackagePhysicalSnapshot {
  if (!analyticsItem) throw new Error(`商品卡片 SKU ${sku} 缺少分析数据`)
  return requireCompleteCardPackageFacts(analyticsItem.packageFacts, sku)
}

/** Apply card facts to the product and its one uniquely matching variant without mutating collected data. */
export function mergeCardListingPackageFacts(
  product: OzonboxCollectedProduct,
  requestedSku: string,
  packageFacts: PackagePhysicalSnapshot | undefined,
): OzonboxCollectedProduct {
  const completeFacts = requireCompleteCardPackageFacts(packageFacts, requestedSku)
  const matchingIndexes = product.variantsData
    .map((variant, index) => variantHasExactSku(variant, requestedSku) ? index : -1)
    .filter(index => index >= 0)

  if (matchingIndexes.length === 0) {
    throw new Error(`采集结果缺少当前 SKU ${requestedSku} 的真实变体`)
  }
  if (matchingIndexes.length > 1) {
    throw new Error(`采集结果存在多个匹配当前 SKU ${requestedSku} 的真实变体`)
  }

  const matchingIndex = matchingIndexes[0]!
  return {
    ...product,
    packageFacts: {
      ...product.packageFacts,
      ...completeFacts,
    },
    variantsData: product.variantsData.map((variant, index) => index === matchingIndex
      ? { ...variant, ...completeFacts }
      : variant),
  }
}
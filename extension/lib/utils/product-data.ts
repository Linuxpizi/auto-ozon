import type {
  FactProvenance,
  OzonAttributeFact,
  PackagePhysicalField,
  PackagePhysicalProvenance,
  PackagePhysicalSnapshot,
  ProductCompleteness,
  ProductVariant,
  ProductVariantValue,
  RequiredProductField,
  ScrapedProduct,
} from '@/lib/utils/types'

const PACKAGE_FIELDS = [
  'packageWeightG',
  'packageDepthMm',
  'packageWidthMm',
  'packageHeightMm',
] as const satisfies readonly PackagePhysicalField[]

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function strictlyPositiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function uniqueTexts(values: unknown[]): string[] {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? { ...value } : undefined
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]))
}

function normalizeRecordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  const result = new Map<string, Record<string, unknown>>()
  for (const item of value) {
    const record = normalizeRecord(item)
    if (!record) continue
    const key = JSON.stringify(stableValue(record))
    if (!result.has(key)) result.set(key, record)
  }
  return [...result.values()]
}

function normalizePackageSnapshot(value: unknown): PackagePhysicalSnapshot | undefined {
  if (!isRecord(value)) return undefined
  const snapshot: PackagePhysicalSnapshot = {}
  const provenance: PackagePhysicalProvenance = {}
  const sourceProvenance = normalizeRecord(value.packagePhysicalProvenance)

  for (const field of PACKAGE_FIELDS) {
    const fieldValue = strictlyPositiveNumber(value[field])
    if (fieldValue === undefined) continue
    snapshot[field] = fieldValue

    const fieldProvenance = normalizeRecord(sourceProvenance?.[field])
    if (fieldProvenance && text(fieldProvenance.source)) {
      provenance[field] = fieldProvenance as FactProvenance
    }
  }

  if (!PACKAGE_FIELDS.some((field) => snapshot[field] !== undefined)) return undefined
  if (Object.keys(provenance).length) snapshot.packagePhysicalProvenance = provenance
  return snapshot
}

function normalizeOzonAttributeFacts(value: unknown): OzonAttributeFact[] {
  const normalized: OzonAttributeFact[] = []
  for (const record of normalizeRecordList(value)) {
    const attributeId = positiveNumber(record.attributeId)
    const scope = record.scope
    const provenance = normalizeRecord(record.provenance)
    if (
      !Number.isSafeInteger(attributeId)
      || !attributeId
      || (scope !== 'product' && scope !== 'sku')
      || typeof record.recognized !== 'boolean'
      || typeof record.publishable !== 'boolean'
      || !provenance
      || !text(provenance.source)
      || !Array.isArray(record.values)
    ) continue

    const values = record.values.flatMap((item) => {
      const normalizedValue = normalizeRecord(item)
      return normalizedValue ? [normalizedValue] : []
    })
    if (!values.length) continue

    normalized.push({
      ...record,
      attributeId,
      values,
      scope,
      recognized: record.recognized,
      publishable: record.publishable,
      provenance: provenance as FactProvenance,
    })
  }
  return normalized
}

function normalizeVariantValues(values: ProductVariantValue[] = []): ProductVariantValue[] {
  const seen = new Set<string>()
  return values.flatMap((item) => {
    const name = text(item?.name)
    const value = text(item?.value)
    const key = name.toLocaleLowerCase()
    if (!name || !value || seen.has(key)) return []
    seen.add(key)
    return [{ ...item, name, value }]
  })
}

export function normalizeVariants(variants: ProductVariant[] = []): ProductVariant[] {
  const seen = new Set<string>()
  const result: ProductVariant[] = []
  for (const variant of variants) {
    const sku = text(variant?.sku)
    const barcode = text(variant?.barcode)
    const values = normalizeVariantValues(variant?.values)
    // 单 Offer 商品没有颜色/尺码等变体维度时，空 values 就是完整组合，
    // 不能因此丢弃页面/API 明确给出的真实 SKU。
    if (!sku) continue
    const key = `${sku}\u0000${values.map((item) => `${item.name}=${item.value}`).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    const images = uniqueTexts([
      ...(Array.isArray(variant.images) ? variant.images : []),
      variant.imageUrl,
    ])
    const videoUrls = uniqueTexts(Array.isArray(variant.videoUrls) ? variant.videoUrls : [])
    const supplierAttrs = normalizeRecordList(variant.supplierAttrs)
    const variantAttrs = normalizeRecord(variant.variantAttrs)
    const packageFacts = normalizePackageSnapshot(variant)
    const ozonAttributeFacts = normalizeOzonAttributeFacts(variant.ozonAttributeFacts)
    result.push({
      sku,
      ...(barcode ? { barcode } : {}),
      values,
      ...(positiveNumber(variant.price) !== undefined ? { price: positiveNumber(variant.price) } : {}),
      ...(positiveNumber(variant.oldPrice) !== undefined ? { oldPrice: positiveNumber(variant.oldPrice) } : {}),
      ...(positiveNumber(variant.stock) !== undefined ? { stock: positiveNumber(variant.stock) } : {}),
      ...(images.length ? { images, imageUrl: images[0] } : {}),
      ...(videoUrls.length ? { videoUrls } : {}),
      ...(positiveNumber(variant.weight) !== undefined ? { weight: positiveNumber(variant.weight) } : {}),
      ...(positiveNumber(variant.depth) !== undefined ? { depth: positiveNumber(variant.depth) } : {}),
      ...(positiveNumber(variant.width) !== undefined ? { width: positiveNumber(variant.width) } : {}),
      ...(positiveNumber(variant.height) !== undefined ? { height: positiveNumber(variant.height) } : {}),
      ...(packageFacts ?? {}),
      ...(text(variant.sourceUrl) ? { sourceUrl: text(variant.sourceUrl) } : {}),
      ...(text(variant.id) ? { id: text(variant.id) } : {}),
      ...(text(variant.productId) ? { productId: text(variant.productId) } : {}),
      ...(text(variant.offerId) ? { offerId: text(variant.offerId) } : {}),
      ...(text(variant.supplierSkuId) ? { supplierSkuId: text(variant.supplierSkuId) } : {}),
      ...(text(variant.supplierSpecText) ? { supplierSpecText: text(variant.supplierSpecText) } : {}),
      ...(supplierAttrs.length ? { supplierAttrs } : {}),
      ...(variantAttrs ? { variantAttrs } : {}),
      ...(ozonAttributeFacts.length ? { ozonAttributeFacts } : {}),
      ...(text(variant.sourcePath) ? { sourcePath: text(variant.sourcePath) } : {}),
    })
  }
  return result
}

export function normalizeSkuList(
  skuList: ScrapedProduct['skuList'] = [],
  variants: ProductVariant[] = [],
): ScrapedProduct['skuList'] {
  const seen = new Set<string>()
  const result: ScrapedProduct['skuList'] = []
  for (const item of [
    ...skuList,
    ...variants.map((variant) => ({ sku: variant.sku, barcode: variant.barcode || '' })),
  ]) {
    const sku = text(item?.sku)
    const barcode = text(item?.barcode)
    if (!sku && !barcode) continue
    const key = `${sku}\u0000${barcode}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ sku, barcode })
  }
  return result
}

export function normalizeProduct(product: ScrapedProduct): ScrapedProduct {
  const variants = normalizeVariants(product.variants)
  const normalized: ScrapedProduct = {
    ...product,
    variants,
    skuList: normalizeSkuList(product.skuList, variants),
  }
  const packageFacts = normalizePackageSnapshot(product.packageFacts)
  const ozonAttributeFacts = normalizeOzonAttributeFacts(product.ozonAttributeFacts)
  if (packageFacts) normalized.packageFacts = packageFacts
  else delete normalized.packageFacts
  if (ozonAttributeFacts.length) normalized.ozonAttributeFacts = ozonAttributeFacts
  else delete normalized.ozonAttributeFacts
  return normalized
}

export function getProductCompleteness(product: ScrapedProduct): ProductCompleteness {
  const missing: RequiredProductField[] = []
  const variants = normalizeVariants(product.variants)
  const skuList = normalizeSkuList(product.skuList)
  const listedSkus = new Set(skuList.map((item) => item.sku).filter(Boolean))
  const variantSkus = new Set(variants.map((variant) => variant.sku))
  if (listedSkus.size === 0) missing.push('skuList')
  if (
    variants.length === 0
    || Array.from(listedSkus).some((sku) => !variantSkus.has(sku))
    || variants.some((variant) => !listedSkus.has(variant.sku))
    // 多 SKU 商品必须携带每个 SKU 的变体维度；只有单 Offer 商品允许空组合。
    || (Math.max(listedSkus.size, variantSkus.size) > 1 && variants.some((variant) => variant.values.length === 0))
  ) missing.push('variants')
  return { complete: missing.length === 0, missing }
}

export function assertCompleteProduct(product: ScrapedProduct): ScrapedProduct {
  const normalized = normalizeProduct(product)
  const completeness = getProductCompleteness(normalized)
  if (!completeness.complete) {
    throw new Error(`商品 ${normalized.sourceId || normalized.sourceUrl} 缺少强制采集字段: ${completeness.missing.join(', ')}`)
  }
  return normalized
}
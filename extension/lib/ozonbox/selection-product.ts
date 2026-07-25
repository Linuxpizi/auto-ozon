import { isRecord, type OzonboxCollectedProduct, type OzonboxVariant } from './contract'
import type {
  FactProvenance,
  OzonAttributeFact,
  PackagePhysicalField,
  PackagePhysicalProvenance,
  PackagePhysicalSnapshot,
  ProductFact,
  ProductSpec,
  ProductVariant,
  ProductVariantValue,
  ScrapedProduct,
} from '@/lib/utils/types'

const PACKAGE_FIELDS = [
  'packageWeightG',
  'packageDepthMm',
  'packageWidthMm',
  'packageHeightMm',
] as const satisfies readonly PackagePhysicalField[]

const LEGACY_PACKAGE_FIELDS = {
  packageWeightG: 'weight',
  packageDepthMm: 'depth',
  packageWidthMm: 'width',
  packageHeightMm: 'height',
} as const satisfies Record<PackagePhysicalField, keyof OzonboxVariant>

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function colorValues(facts: ProductFact[], variants: ProductVariant[]): string[] {
  const isColorName = (name: string) => /^(?:颜色|色号|color|colour|цвет)$/iu.test(name.normalize('NFKC').trim())
  return uniqueStrings([
    ...facts.filter((fact) => isColorName(fact.name)).map((fact) => text(fact.value)),
    ...variants.flatMap((variant) => variant.values
      .filter((value) => isColorName(value.name))
      .map((value) => text(value.value))),
  ])
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]))
}

function recordFacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  const result = new Map<string, Record<string, unknown>>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const copy = { ...item }
    const key = JSON.stringify(stableValue(copy))
    if (!result.has(key)) result.set(key, copy)
  }
  return [...result.values()]
}

function mergeRecordFacts(
  existing: Array<Record<string, unknown>> = [],
  incoming: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  return recordFacts([...existing, ...incoming])
}

function ozonAttributeFacts(value: unknown): OzonAttributeFact[] {
  return recordFacts(value) as OzonAttributeFact[]
}

function packageSnapshotFromVariant(variant: OzonboxVariant | undefined): PackagePhysicalSnapshot | undefined {
  if (!variant) return undefined
  const snapshot: PackagePhysicalSnapshot = {}
  const provenance: PackagePhysicalProvenance = {}

  for (const field of PACKAGE_FIELDS) {
    const explicit = positiveNumber(variant[field])
    const legacyField = LEGACY_PACKAGE_FIELDS[field]
    const legacy = positiveNumber(variant[legacyField])
    if (explicit !== undefined) {
      snapshot[field] = explicit
      const explicitProvenance = variant.packagePhysicalProvenance?.[field]
      if (explicitProvenance) provenance[field] = { ...explicitProvenance }
      continue
    }
    if (legacy === undefined) continue
    snapshot[field] = legacy
    provenance[field] = {
      source: 'legacy_variant_physical',
      sourcePath: `Ozon PDP variant.${legacyField}`,
    }
  }

  if (!PACKAGE_FIELDS.some((field) => snapshot[field] !== undefined)) return undefined
  if (Object.keys(provenance).length) snapshot.packagePhysicalProvenance = provenance
  return snapshot
}

function mergePackageSnapshots(
  sku: string,
  existing: PackagePhysicalSnapshot | undefined,
  incoming: PackagePhysicalSnapshot | undefined,
  rejectConflicts: boolean,
): PackagePhysicalSnapshot | undefined {
  if (!existing && !incoming) return undefined
  const snapshot: PackagePhysicalSnapshot = {}
  const provenance: PackagePhysicalProvenance = {}

  for (const field of PACKAGE_FIELDS) {
    const existingValue = positiveNumber(existing?.[field])
    const incomingValue = positiveNumber(incoming?.[field])
    if (rejectConflicts && existingValue !== undefined && incomingValue !== undefined && existingValue !== incomingValue) {
      throw new Error(`Ozon SKU ${sku} 对应了冲突的包装物理字段 ${field}`)
    }
    const value = existingValue ?? incomingValue
    if (value === undefined) continue
    snapshot[field] = value
    const source = existingValue !== undefined
      ? existing?.packagePhysicalProvenance?.[field]
      : incoming?.packagePhysicalProvenance?.[field]
    if (source) provenance[field] = { ...source }
  }

  if (!PACKAGE_FIELDS.some((field) => snapshot[field] !== undefined)) return undefined
  if (Object.keys(provenance).length) snapshot.packagePhysicalProvenance = provenance
  return snapshot
}

function mergeVariantAttrs(
  sku: string,
  existing: Record<string, unknown> = {},
  incoming: Record<string, unknown> = {},
): Record<string, unknown> {
  const result = { ...existing }
  for (const [name, value] of Object.entries(incoming)) {
    if (name in result && JSON.stringify(stableValue(result[name])) !== JSON.stringify(stableValue(value))) {
      throw new Error(`Ozon SKU ${sku} 的事实属性“${name}”存在冲突值`)
    }
    result[name] = value
  }
  return result
}

function requireCollectedProduct(value: unknown): OzonboxCollectedProduct {
  if (!isRecord(value) || value.source !== 'OZON') throw new Error('Ozon 采集器返回了无效商品数据')
  const productId = text(value.productId)
  if (!productId || !/^\d+$/.test(productId) || Number(productId) <= 0) {
    throw new Error('Ozon 采集结果缺少有效的 productId')
  }
  if (!text(value.sourceUrl) || !text(value.title)) throw new Error('Ozon 采集结果缺少商品标题或来源地址')
  if (!positiveNumber(value.price)) throw new Error('Ozon 采集结果缺少有效价格')
  if (!Array.isArray(value.images) || !Array.isArray(value.specs) || !Array.isArray(value.variantsData)) {
    throw new Error('Ozon 采集结果中的图片、规格或变体格式无效')
  }
  if (value.tags !== undefined && (!Array.isArray(value.tags)
    || value.tags.some((tag) => typeof tag !== 'string' || !tag.trim()))) {
    throw new Error('Ozon 采集结果中的标签格式无效')
  }
  return value as unknown as OzonboxCollectedProduct
}

function currentVariant(collected: OzonboxCollectedProduct): OzonboxVariant | undefined {
  const explicitSku = text(collected.sku)
  return collected.variantsData.find((variant) => text(variant.productId) === collected.productId)
    ?? (explicitSku ? collected.variantsData.find((variant) => text(variant.sku) === explicitSku) : undefined)
}

function variantSku(variant: OzonboxVariant): string | undefined {
  return text(variant.sku) ?? text(variant.productId) ?? text(variant.offerId) ?? text(variant.id)
}

function canonicalText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function variantValues(value: unknown, sku: string): ProductVariantValue[] {
  if (!isRecord(value)) return []
  const valuesByName = new Map<string, ProductVariantValue>()
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = text(rawName)
    const itemValue = text(rawValue)
    if (!name || !itemValue) continue

    const canonicalName = canonicalText(name)
    const existing = valuesByName.get(canonicalName)
    if (existing && canonicalText(existing.value) !== canonicalText(itemValue)) {
      throw new Error(`Ozon SKU ${sku} 的事实性维度“${name}”存在冲突值`)
    }
    if (!existing) valuesByName.set(canonicalName, { name, value: itemValue })
  }
  return Array.from(valuesByName.values()).sort((left, right) => {
    const byName = canonicalText(left.name).localeCompare(canonicalText(right.name))
    return byName || canonicalText(left.value).localeCompare(canonicalText(right.value))
  })
}

function variantValuesSignature(values: ProductVariantValue[]): string {
  return JSON.stringify(values.map(({ name, value }) => [canonicalText(name), canonicalText(value)]))
}

function mergeOptionalFact<T extends number | string>(
  sku: string,
  label: string,
  existing: T | undefined,
  incoming: T | undefined,
): T | undefined {
  if (existing !== undefined && incoming !== undefined && existing !== incoming) {
    throw new Error(`Ozon SKU ${sku} 对应了冲突的${label}`)
  }
  return existing ?? incoming
}

function mergeDuplicateVariant(existing: ProductVariant, incoming: ProductVariant): ProductVariant {
  if (variantValuesSignature(existing.values) !== variantValuesSignature(incoming.values)) {
    throw new Error(`Ozon SKU ${existing.sku} 对应了冲突的事实性变体维度`)
  }

  const price = mergeOptionalFact(existing.sku, '价格', existing.price, incoming.price)
  const oldPrice = mergeOptionalFact(existing.sku, '原价', existing.oldPrice, incoming.oldPrice)
  const stock = mergeOptionalFact(existing.sku, '库存', existing.stock, incoming.stock)
  const weight = mergeOptionalFact(existing.sku, '重量', existing.weight, incoming.weight)
  const depth = mergeOptionalFact(existing.sku, '长度', existing.depth, incoming.depth)
  const width = mergeOptionalFact(existing.sku, '宽度', existing.width, incoming.width)
  const height = mergeOptionalFact(existing.sku, '高度', existing.height, incoming.height)
  const sourceUrl = mergeOptionalFact(existing.sku, '来源地址', existing.sourceUrl, incoming.sourceUrl)
  const id = mergeOptionalFact(existing.sku, 'ID', existing.id, incoming.id)
  const productId = mergeOptionalFact(existing.sku, 'productId', existing.productId, incoming.productId)
  const offerId = mergeOptionalFact(existing.sku, 'offerId', existing.offerId, incoming.offerId)
  const supplierSkuId = mergeOptionalFact(existing.sku, '供应商 SKU ID', existing.supplierSkuId, incoming.supplierSkuId)
  const supplierSpecText = mergeOptionalFact(existing.sku, '供应商规格', existing.supplierSpecText, incoming.supplierSpecText)
  const images = uniqueStrings([...(existing.images ?? []), existing.imageUrl, ...(incoming.images ?? []), incoming.imageUrl])
  const videoUrls = uniqueStrings([...(existing.videoUrls ?? []), ...(incoming.videoUrls ?? [])])
  const packageFacts = mergePackageSnapshots(existing.sku, existing, incoming, true)
  const attributes = ozonAttributeFacts([
    ...(existing.ozonAttributeFacts ?? []),
    ...(incoming.ozonAttributeFacts ?? []),
  ])
  return {
    ...existing,
    sku: existing.sku,
    values: existing.values,
    ...(price !== undefined ? { price } : {}),
    ...(oldPrice !== undefined ? { oldPrice } : {}),
    ...(stock !== undefined ? { stock } : {}),
    ...(images.length ? { images, imageUrl: images[0] } : {}),
    ...(videoUrls.length ? { videoUrls } : {}),
    ...(weight !== undefined ? { weight } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(packageFacts ?? {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(id ? { id } : {}),
    ...(productId ? { productId } : {}),
    ...(offerId ? { offerId } : {}),
    ...(supplierSkuId ? { supplierSkuId } : {}),
    ...(supplierSpecText ? { supplierSpecText } : {}),
    supplierAttrs: mergeRecordFacts(existing.supplierAttrs, incoming.supplierAttrs),
    variantAttrs: mergeVariantAttrs(existing.sku, existing.variantAttrs, incoming.variantAttrs),
    ...(attributes.length ? { ozonAttributeFacts: attributes } : {}),
    sourcePath: existing.sourcePath ?? incoming.sourcePath,
  }
}

function factsFrom(textFacts: unknown, specs: Array<Record<string, unknown>>): ProductFact[] {
  const result = new Map<string, ProductFact>()
  const append = (fact: ProductFact): void => {
    const key = `${canonicalText(fact.name)}\u0000${canonicalText(fact.value)}`
    if (!result.has(key)) result.set(key, fact)
  }

  for (const item of Array.isArray(textFacts) ? textFacts : []) {
    if (!isRecord(item)) continue
    const name = text(item.name)
    const value = text(item.value)
    if (!name || !value) continue
    append({ ...item, name, value } as ProductFact)
  }

  for (const spec of specs) {
    const name = text(spec.name) ?? text(spec.label)
    const value = text(spec.value)
    if (!name || !value) continue
    append({
      ...spec,
      name,
      value,
      sourcePath: text(spec.sourcePath) ?? 'Ozon PDP characteristics',
      provenance: isRecord(spec.provenance)
        ? { ...spec.provenance } as FactProvenance
        : {
            source: 'ozon_pdp_characteristic',
            sourcePath: 'Ozon PDP characteristics',
          },
    })
  }
  return [...result.values()]
}

function specsFrom(variant: OzonboxVariant | undefined): ProductSpec[] {
  const packageFacts = packageSnapshotFromVariant(variant)
  if (!packageFacts) return []
  const spec: ProductSpec = {
    ...(packageFacts.packageWeightG !== undefined ? { package_weight_g: packageFacts.packageWeightG } : {}),
    ...(packageFacts.packageDepthMm !== undefined ? { package_depth_mm: packageFacts.packageDepthMm } : {}),
    ...(packageFacts.packageWidthMm !== undefined ? { package_width_mm: packageFacts.packageWidthMm } : {}),
    ...(packageFacts.packageHeightMm !== undefined ? { package_height_mm: packageFacts.packageHeightMm } : {}),
    ...(packageFacts.packagePhysicalProvenance
      ? { package_physical_provenance: packageFacts.packagePhysicalProvenance }
      : {}),
  }
  return [spec]
}

export function toSelectionProduct(value: unknown): ScrapedProduct {
  const collected = requireCollectedProduct(value)
  const current = currentVariant(collected)
  const price = positiveNumber(current?.price) ?? collected.price
  const oldPrice = positiveNumber(current?.oldPrice) ?? 0
  const adaptedVariants: ProductVariant[] = collected.variantsData.map((variant, index) => {
    const sku = variantSku(variant)
    if (!sku) throw new Error(`Ozon 第 ${index + 1} 个变体缺少可核验的 SKU 身份`)
    const values = variantValues(variant.variantAttrs, sku)
    const variantPrice = positiveNumber(variant.price)
    const variantOldPrice = positiveNumber(variant.oldPrice)
    const images = uniqueStrings(variant.images.map(text))
    const videoUrls = uniqueStrings([...(variant.videos ?? []).map(text), text(variant.video)])
    const weight = positiveNumber(variant.weight)
    const depth = positiveNumber(variant.depth)
    const width = positiveNumber(variant.width)
    const height = positiveNumber(variant.height)
    const sourceUrl = text(variant.sourceUrl)
    const id = text(variant.id)
    const productId = text(variant.productId)
    const offerId = text(variant.offerId)
    const supplierSkuId = text(variant.supplierSkuId)
    const supplierSpecText = text(variant.supplierSpecText)
    const packageFacts = packageSnapshotFromVariant(variant)
    const attributes = ozonAttributeFacts(variant.ozonAttributeFacts)
    return {
      sku,
      values,
      ...(variantPrice !== undefined ? { price: variantPrice } : {}),
      ...(variantOldPrice !== undefined ? { oldPrice: variantOldPrice } : {}),
      ...(nonNegativeNumber(variant.stock) !== undefined ? { stock: nonNegativeNumber(variant.stock) } : {}),
      ...(images.length ? { images, imageUrl: images[0] } : {}),
      ...(videoUrls.length ? { videoUrls } : {}),
      ...(weight !== undefined ? { weight } : {}),
      ...(depth !== undefined ? { depth } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(packageFacts ?? {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(id ? { id } : {}),
      ...(productId ? { productId } : {}),
      ...(offerId ? { offerId } : {}),
      ...(supplierSkuId ? { supplierSkuId } : {}),
      ...(supplierSpecText ? { supplierSpecText } : {}),
      supplierAttrs: recordFacts(variant.supplierAttrs),
      variantAttrs: isRecord(variant.variantAttrs) ? { ...variant.variantAttrs } : {},
      ...(attributes.length ? { ozonAttributeFacts: attributes } : {}),
      sourcePath: 'Ozon PDP offer selector / structured data',
    }
  })
  const variantsBySku = new Map<string, ProductVariant>()
  for (const variant of adaptedVariants) {
    const existing = variantsBySku.get(variant.sku)
    variantsBySku.set(variant.sku, existing ? mergeDuplicateVariant(existing, variant) : variant)
  }
  const variants = Array.from(variantsBySku.values())
  if (!variants.length) throw new Error('Ozon 采集结果没有可持久化的真实变体')
  if (variants.length > 1) {
    const incomplete = variants.filter((variant) => variant.values.length === 0)
    if (incomplete.length) {
      throw new Error(`Ozon 多变体商品有 ${incomplete.length} 个 SKU 缺少事实性变体维度，已拒绝保存`)
    }
  }
  const images = uniqueStrings([
    ...collected.variantsData.flatMap((variant) => variant.images.map(text)),
    ...collected.images.map(text),
  ])
  const videoUrls = uniqueStrings(collected.variantsData.flatMap((variant) => [
    ...(variant.videos ?? []).map(text),
    text(variant.video),
  ]))
  const facts = factsFrom(collected.textFacts, collected.specs)
  const colors = colorValues(facts, variants)
  const brand = text(collected.brand)
  const category = text(collected.categoryPath)
  const description = text(collected.description) ?? text(collected.descriptionRu)
  const recordName = text(collected.recordName)
  const selectedSku = text(collected.sku)
  const titleRu = text(collected.titleRu)
  const descriptionRu = text(collected.descriptionRu)
  const collectionStatus = text(collected.status)
  const ozonCategoryPathId = positiveInteger(collected.categoryId)
  const ozonCategoryId = positiveInteger(collected.descriptionCategoryId)
  const ozonTypeId = positiveInteger(collected.typeId)
  const variantAttrIds = Array.from(new Set((Array.isArray(collected.variantAttrIds) ? collected.variantAttrIds : [])
    .map(positiveInteger)
    .filter((item): item is number => item !== undefined)))
  const warehouse = text(collected.warehouse)
  const warehouseId = text(collected.warehouseId)
  const logisticsType = text(collected.logisticsType)
  const deliveryMethod = text(collected.deliveryMethod)
  const deliveryRegion = text(collected.deliveryRegion)
  const deliveryDays = positiveInteger(collected.deliveryDays)
  const discount = text(collected.discount)
  const stock = text(collected.stock)
  const packageFacts = mergePackageSnapshots(
    selectedSku ?? collected.productId,
    collected.packageFacts,
    packageSnapshotFromVariant(current),
    false,
  )
  const attributes = ozonAttributeFacts(collected.ozonAttributeFacts)

  return {
    platform: 'ozon',
    sourceId: collected.productId,
    title: collected.title.trim(),
    currency: 'RUB',
    price,
    oldPrice,
    images,
    ...(videoUrls.length ? { videoUrls } : {}),
    rating: 0,
    reviewCount: 0,
    ...(brand ? { brand } : {}),
    ...(category ? { category } : {}),
    ...(description ? { description } : {}),
    sourceUrl: collected.sourceUrl.trim(),
    scrapedAt: new Date().toISOString(),
    ...(recordName ? { recordName } : {}),
    ...(selectedSku ? { selectedSku } : {}),
    ...(titleRu ? { titleRu } : {}),
    ...(descriptionRu ? { descriptionRu } : {}),
    ...(variantAttrIds.length ? { variantAttrIds } : {}),
    ...(collectionStatus ? { collectionStatus } : {}),
    ...(ozonCategoryPathId !== undefined ? { ozonCategoryPathId } : {}),
    skuList: variants.map((variant) => ({ sku: variant.sku, barcode: '' })),
    variants,
    specList: specsFrom(current),
    facts,
    ...(packageFacts ? { packageFacts } : {}),
    ...(attributes.length ? { ozonAttributeFacts: attributes } : {}),
    ...(colors.length ? { colorList: colors } : {}),
    ...(collected.tags?.length ? { tags: uniqueStrings(collected.tags.map(text)) } : {}),
    ...(ozonCategoryId !== undefined ? { ozonCategoryId } : {}),
    ...(ozonTypeId !== undefined ? { ozonTypeId } : {}),
    ...(collected.ozonMetrics ? { ozonMetrics: collected.ozonMetrics } : {}),
    ...(warehouse ? { warehouse } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(logisticsType ? { logisticsType } : {}),
    ...(deliveryMethod ? { deliveryMethod } : {}),
    ...(deliveryRegion ? { deliveryRegion } : {}),
    ...(deliveryDays !== undefined ? { deliveryDays } : {}),
    ...(discount ? { discount } : {}),
    ...(stock ? { stock } : {}),
  }
}

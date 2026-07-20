import type { OzonboxCollectedProduct, OzonboxVariant } from './contract'
import { isRecord } from './contract'
import { extractOzonProductId } from './url'

type JsonRecord = Record<string, unknown>

interface PackageFacts {
  depth?: number
  width?: number
  height?: number
  weight?: number
}

type LengthUnit = 'mm' | 'cm' | 'm'
type WeightUnit = 'g' | 'kg'

const PACKAGE_LABEL_PATTERN = /(?:упаковк|посылк|package|packaging|包装|包裹)/i
const DIMENSIONS_LABEL_PATTERN = /(?:размер|габарит|dimensions?|size|尺寸)/i
const DEPTH_LABEL_PATTERN = /(?:длина|length|长(?:度)?)/i
const WIDTH_LABEL_PATTERN = /(?:ширина|width|宽(?:度)?)/i
const HEIGHT_LABEL_PATTERN = /(?:высота|height|高(?:度)?)/i
const WEIGHT_LABEL_PATTERN = /(?:вес|weight|重量)/i

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function parsePositivePrice(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const match = value.replace(/[\u00a0\u202f]/g, ' ').match(/\d[\d\s.,]*/)
  if (!match) return undefined
  let normalized = match[0].replace(/\s/g, '')
  const separator = Math.max(normalized.lastIndexOf(','), normalized.lastIndexOf('.'))
  if (separator >= 0 && normalized.length - separator - 1 === 2) {
    normalized = `${normalized.slice(0, separator).replace(/[.,]/g, '')}.${normalized.slice(separator + 1)}`
  } else {
    normalized = normalized.replace(/[.,]/g, '')
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function positiveDecimal(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function unitTokens(value: string): string[] {
  return Array.from(value.toLowerCase().matchAll(/(?:^|[^a-zа-яё])(мм|mm|см|cm|кг|kg|г|g|м|m)(?=$|[^a-zа-яё])/giu))
    .map((match) => match[1]!.toLowerCase())
}

function lengthUnit(value: string): LengthUnit | undefined {
  const units = new Set(unitTokens(value).flatMap<LengthUnit>((unit) => {
    if (unit === 'мм' || unit === 'mm') return ['mm']
    if (unit === 'см' || unit === 'cm') return ['cm']
    if (unit === 'м' || unit === 'm') return ['m']
    return []
  }))
  return units.size === 1 ? [...units][0] : undefined
}

function weightUnit(value: string): WeightUnit | undefined {
  const units = new Set(unitTokens(value).flatMap<WeightUnit>((unit) => {
    if (unit === 'г' || unit === 'g') return ['g']
    if (unit === 'кг' || unit === 'kg') return ['kg']
    return []
  }))
  return units.size === 1 ? [...units][0] : undefined
}

function toMillimetres(value: number, unit: LengthUnit): number {
  const multiplier = unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1
  return Number((value * multiplier).toFixed(6))
}

function toGrams(value: number, unit: WeightUnit): number {
  return Number((value * (unit === 'kg' ? 1000 : 1)).toFixed(6))
}

function onePositiveNumber(value: string): number | undefined {
  const matches = value.match(/\d+(?:[.,]\d+)?/g)
  return matches?.length === 1 ? positiveDecimal(matches[0]!) : undefined
}

function parseLength(value: string, label: string): number | undefined {
  const amount = onePositiveNumber(value)
  const unit = lengthUnit(value) ?? lengthUnit(label)
  return amount && unit ? toMillimetres(amount, unit) : undefined
}

function parseCombinedDimensions(value: string, label: string): Pick<PackageFacts, 'depth' | 'width' | 'height'> | undefined {
  const amounts = value.match(/\d+(?:[.,]\d+)?/g)?.map(positiveDecimal)
  if (!amounts || amounts.length !== 3 || amounts.some((amount) => amount === undefined)) return undefined
  const unit = lengthUnit(value) ?? lengthUnit(label)
  if (!unit) return undefined
  const [depth, width, height] = amounts.map((amount) => toMillimetres(amount!, unit))
  return { depth, width, height }
}

function readPackageFacts(specs: Array<Record<string, unknown>>): PackageFacts {
  let combined: Pick<PackageFacts, 'depth' | 'width' | 'height'> | undefined
  let depth: number | undefined
  let width: number | undefined
  let height: number | undefined
  let weight: number | undefined

  for (const spec of specs) {
    const label = text(spec.name)
    const value = text(spec.value)
    if (!label || !value || !PACKAGE_LABEL_PATTERN.test(label)) continue

    if (!combined && DIMENSIONS_LABEL_PATTERN.test(label)) {
      combined = parseCombinedDimensions(value, label)
    }
    if (depth === undefined && DEPTH_LABEL_PATTERN.test(label)) depth = parseLength(value, label)
    if (width === undefined && WIDTH_LABEL_PATTERN.test(label)) width = parseLength(value, label)
    if (height === undefined && HEIGHT_LABEL_PATTERN.test(label)) height = parseLength(value, label)
    if (weight === undefined && WEIGHT_LABEL_PATTERN.test(label)) {
      const amount = onePositiveNumber(value)
      const unit = weightUnit(value) ?? weightUnit(label)
      if (amount && unit) weight = toGrams(amount, unit)
    }
  }

  const dimensions = combined ?? (depth && width && height ? { depth, width, height } : {})
  return { ...dimensions, ...(weight ? { weight } : {}) }
}

function uniqueUrls(values: unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    const raw = isRecord(value) ? text(value.url ?? value.contentUrl) : text(value)
    if (!raw) continue
    try {
      const url = new URL(raw, location.origin)
      if (!['http:', 'https:'].includes(url.protocol)) continue
      const normalized = url.href.replace(/\/wc\d+\//, '/wc1000/')
      if (!result.includes(normalized)) result.push(normalized)
    } catch (error) {
      console.warn('Ozonbox ignored invalid media URL:', error)
    }
  }
  return result
}

function typeIncludes(node: JsonRecord, expected: string): boolean {
  const raw = node['@type']
  return (Array.isArray(raw) ? raw : [raw])
    .some((item) => typeof item === 'string' && item.toLowerCase() === expected.toLowerCase())
}

function collectProductNodes(root: unknown, result: JsonRecord[]): void {
  if (Array.isArray(root)) {
    root.forEach((item) => collectProductNodes(item, result))
    return
  }
  if (!isRecord(root)) return
  if (typeIncludes(root, 'Product')) result.push(root)
  if (Array.isArray(root['@graph'])) collectProductNodes(root['@graph'], result)
}

function productNodeMatches(node: JsonRecord, productId: string): boolean {
  const ids = [node.productID, node.productId, node.identifier].map(text)
  if (ids.includes(productId)) return true
  for (const value of [node.url, node['@id'], node.mainEntityOfPage]) {
    const raw = isRecord(value) ? text(value['@id'] ?? value.url) : text(value)
    if (raw && extractOzonProductId(raw, location.origin) === productId) return true
  }
  return false
}

function readOffer(
  offer: JsonRecord,
  product: JsonRecord,
  currentProductId: string,
  singleOffer: boolean,
): OzonboxVariant | undefined {
  const rawUrl = text(offer.url ?? offer['@id'])
  const declaredProductId = text(offer.productID ?? offer.productId)
    ?? (rawUrl ? extractOzonProductId(rawUrl, location.origin) : undefined)
  const isCurrent = declaredProductId === currentProductId || (!declaredProductId && singleOffer)
  const specification = isRecord(offer.priceSpecification) ? offer.priceSpecification : undefined
  const price = parsePositivePrice(offer.price ?? specification?.price)
  if (!price) return undefined
  const productId = declaredProductId ?? (isCurrent ? currentProductId : undefined)
  const sku = text(offer.sku) ?? (isCurrent ? text(product.sku) : undefined)
  const offerId = text(offer.offerId ?? offer.offerID)
  if (!productId && !sku && !offerId) return undefined
  const availability = text(offer.availability)?.toLowerCase()
  return {
    ...(productId ? { productId } : {}),
    ...(sku ? { sku } : {}),
    ...(offerId ? { offerId } : {}),
    price,
    images: uniqueUrls(Array.isArray(offer.image) ? offer.image : [offer.image]),
    ...(availability?.endsWith('/outofstock') ? { stock: 0 } : {}),
    ...(rawUrl ? { sourceUrl: rawUrl } : {}),
    supplierAttrs: [],
    variantAttrs: {},
  }
}

function readJsonLd(productId: string): {
  title?: string
  description?: string
  sku?: string
  images: string[]
  specs: Array<Record<string, unknown>>
  variants: OzonboxVariant[]
} {
  const nodes: JsonRecord[] = []
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    if (!script.textContent?.trim()) continue
    try {
      collectProductNodes(JSON.parse(script.textContent), nodes)
    } catch (error) {
      console.warn('Ozonbox ignored invalid JSON-LD:', error)
    }
  }
  const product = nodes.find((node) => productNodeMatches(node, productId))
  if (!product) return { images: [], specs: [], variants: [] }
  const rawOffers = Array.isArray(product.offers) ? product.offers : isRecord(product.offers) ? [product.offers] : []
  const variants = rawOffers
    .filter(isRecord)
    .map((offer) => readOffer(offer, product, productId, rawOffers.length === 1))
    .filter((variant): variant is OzonboxVariant => Boolean(variant))
  const specs: Array<Record<string, unknown>> = []
  if (Array.isArray(product.additionalProperty)) {
    for (const property of product.additionalProperty) {
      if (!isRecord(property)) continue
      const name = text(property.name ?? property.propertyID)
      const value = text(property.value)
      if (name && value) specs.push({ name, value })
    }
  }
  return {
    title: text(product.name),
    description: text(product.description),
    sku: text(product.sku),
    images: uniqueUrls(Array.isArray(product.image) ? product.image : [product.image]),
    specs,
    variants,
  }
}

function elementText(selector: string): string | undefined {
  const value = document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()
  return value || undefined
}

function readDomImages(): string[] {
  return uniqueUrls(Array.from(document.querySelectorAll<HTMLImageElement>('[data-widget="webGallery"] img'))
    .flatMap((image) => [image.currentSrc, image.src]))
}

function readDomPrice(): number | undefined {
  const widget = document.querySelector('[data-widget="webPrice"]')
  if (!widget) return undefined
  return parsePositivePrice(widget.querySelector(
    '[data-testid*="price" i], [class*="Headline600Large"], [class*="price" i]',
  )?.textContent)
}

function readOldPrice(): number | undefined {
  const candidates = document.querySelectorAll<HTMLElement>('[data-widget="webPrice"] span, [data-widget="webPrice"] del, [data-widget="webPrice"] s')
  for (const element of candidates) {
    if (element.matches('del, s') || getComputedStyle(element).textDecorationLine.includes('line-through')) {
      const price = parsePositivePrice(element.textContent)
      if (price) return price
    }
  }
  return undefined
}

function appendSpec(result: Array<Record<string, unknown>>, seen: Set<string>, name?: string, value?: string): void {
  const cleanName = name?.replace(/\s+/g, ' ').trim()
  const cleanValue = value?.replace(/\s+/g, ' ').trim()
  if (!cleanName || !cleanValue) return
  const key = `${cleanName.toLowerCase()}\u0000${cleanValue.toLowerCase()}`
  if (seen.has(key)) return
  seen.add(key)
  result.push({ name: cleanName, value: cleanValue })
}

function readSpecs(initial: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  initial.forEach((item) => appendSpec(result, seen, text(item.name), text(item.value)))
  const widgets = document.querySelectorAll('[data-widget="webCharacteristics"], [data-widget="webShortCharacteristics"], [data-widget="webFullCharacteristics"]')
  for (const widget of widgets) {
    for (const term of widget.querySelectorAll('dt')) {
      appendSpec(result, seen, term.textContent ?? undefined, term.nextElementSibling?.textContent ?? undefined)
    }
    for (const row of widget.querySelectorAll('tr')) {
      const cells = Array.from(row.querySelectorAll('th, td'))
      if (cells.length >= 2) appendSpec(result, seen, cells[0]?.textContent ?? undefined, cells.slice(1).map((cell) => cell.textContent).join(' '))
    }
  }
  return result
}

function categoryPath(): string | undefined {
  const parts = Array.from(document.querySelectorAll('[data-widget="webBreadcrumb"] a, [data-widget="webBreadcrumbs"] a, nav[aria-label*="breadcrumb" i] a'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value))
  return parts.length ? Array.from(new Set(parts)).join(' > ') : undefined
}

function explicitOptionVariants(currentProductId: string): OzonboxVariant[] {
  const result: OzonboxVariant[] = []
  const seen = new Set<string>()
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('[data-widget="webOfferSelector"] a[href*="/product/"]')) {
    const productId = extractOzonProductId(anchor.href)
    if (!productId || productId === currentProductId || seen.has(productId)) continue
    const priceText = anchor.querySelector('[data-testid*="price" i], [class*="price" i]')?.textContent
    if (!priceText || !/(?:₽|руб)/i.test(priceText)) continue
    const price = parsePositivePrice(priceText)
    if (!price) continue
    seen.add(productId)
    const image = anchor.querySelector<HTMLImageElement>('img')
    result.push({ productId, price, images: uniqueUrls([image?.currentSrc, image?.src]), sourceUrl: anchor.href, supplierAttrs: [], variantAttrs: {} })
  }
  return result
}

function mergeVariants(groups: OzonboxVariant[][]): OzonboxVariant[] {
  const result = new Map<string, OzonboxVariant>()
  for (const group of groups) {
    for (const variant of group) {
      const key = variant.productId ? `product:${variant.productId}` : variant.sku ? `sku:${variant.sku}` : variant.offerId ? `offer:${variant.offerId}` : undefined
      if (!key) continue
      const existing = result.get(key)
      result.set(key, existing ? {
        ...variant,
        ...existing,
        images: uniqueUrls([...existing.images, ...variant.images]),
        supplierAttrs: existing.supplierAttrs.length ? existing.supplierAttrs : variant.supplierAttrs,
        variantAttrs: Object.keys(existing.variantAttrs).length ? existing.variantAttrs : variant.variantAttrs,
      } : variant)
    }
  }
  return [...result.values()]
}

export async function collectCurrentOzonProduct(): Promise<OzonboxCollectedProduct> {
  const productId = extractOzonProductId(location.href)
  if (!productId) throw new Error('当前 URL 不是带真实 productId 的 Ozon 商品详情页')
  const structured = readJsonLd(productId)
  const title = elementText('[data-widget="webProductHeading"] h1, [data-widget="webProductHeading"], h1') ?? structured.title
  if (!title) throw new Error('当前 Ozon 商品缺少可核验的标题')
  const sourceUrl = `${location.origin}${location.pathname}`
  const images = uniqueUrls([...readDomImages(), ...structured.images])
  const jsonCurrent = structured.variants.find((variant) => variant.productId === productId)
  const price = jsonCurrent?.price ?? readDomPrice()
  if (!price) throw new Error('当前 Ozon 商品缺少可核验的正价')
  const oldPrice = readOldPrice()
  const specs = readSpecs(structured.specs)
  const packageFacts = readPackageFacts(specs)
  const currentVariant: OzonboxVariant = {
    ...(jsonCurrent ?? {}),
    productId,
    ...(structured.sku ? { sku: structured.sku } : {}),
    price,
    ...(oldPrice ? { oldPrice } : {}),
    images: uniqueUrls([...(jsonCurrent?.images ?? []), ...images]),
    sourceUrl,
    supplierAttrs: jsonCurrent?.supplierAttrs ?? [],
    variantAttrs: jsonCurrent?.variantAttrs ?? {},
    ...packageFacts,
  }
  const variantsData = mergeVariants([[currentVariant], structured.variants.filter((variant) => variant.productId !== productId), explicitOptionVariants(productId)])
  if (!variantsData.length) throw new Error('当前 Ozon 商品没有带真实身份与正价的变体')
  const description = elementText('[data-widget="webDescription"]') ?? structured.description
  const path = categoryPath()
  return {
    source: 'OZON', sourceUrl, productId, recordName: title.slice(0, 200),
    ...(structured.sku ? { sku: structured.sku } : {}),
    title, ...(description ? { description } : {}), images, price,
    specs, variantsData, variantAttrIds: [],
    ...(path ? { categoryPath: path } : {}), status: 'draft',
  }
}

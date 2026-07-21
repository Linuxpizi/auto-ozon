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
const OFFER_SELECTOR = '[data-widget="webOfferSelector"], [data-widget="webAspects"]'
const OFFER_LINK = 'a[href*="/product/"]'
const OFFER_PRICE = '[data-testid*="price" i], [class*="price" i]'
const CURRENCY_PATTERN = /(?:₽|руб(?:\.|лей|ля)?)/i
const MAX_OFFER_GRAPH_SIZE = 300
const BRAND_SPEC_NAMES = new Set(['brand', 'бренд', '品牌'])

interface OfferSelectorGroup {
  element: HTMLElement
  label: string
  currentValue: string
}

interface OfferSelectorResult {
  variants: OzonboxVariant[]
  links: Array<{ productId: string; url: string }>
  unresolvedProductIds: string[]
  currentAttrs: Record<string, string>
  hasWidgets: boolean
}

interface OfferSelectorGraph {
  variants: OzonboxVariant[]
  currentAttrs: Record<string, string>
  hasSelector: boolean
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function factualString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function canonicalSpecName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[:：]\s*$/, '')
    .toLocaleLowerCase()
}

/**
 * Read only an explicitly declared product-level brand.
 * JSON-LD wins; characteristics are an exact-name fallback. Seller/title data
 * is deliberately not accepted because it is not a factual brand source.
 */
export function readFactualBrand(
  jsonLdBrand: unknown,
  specs: Array<Record<string, unknown>>,
): string | undefined {
  const structuredBrand = isRecord(jsonLdBrand)
    ? factualString(jsonLdBrand.name)
    : factualString(jsonLdBrand)
  if (structuredBrand) return structuredBrand

  for (const spec of specs) {
    const name = factualString(spec.name)
    if (!name || !BRAND_SPEC_NAMES.has(canonicalSpecName(name))) continue
    const value = factualString(spec.value)
    if (value) return value
  }
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

function uniqueUrls(values: unknown[], baseUrl?: string | null): string[] {
  const resolvedBaseUrl = baseUrl ?? (typeof location !== 'undefined' ? location.href : undefined)
  const result: string[] = []
  for (const value of values) {
    const raw = isRecord(value) ? text(value.url ?? value.contentUrl) : text(value)
    if (!raw) continue
    try {
      const url = new URL(raw, resolvedBaseUrl)
      if (!['http:', 'https:'].includes(url.protocol)) continue
      const normalized = url.href.replace(/\/wc\d+\//, '/wc1000/')
      if (!result.includes(normalized)) result.push(normalized)
    } catch (error) {
      console.warn('Ozonbox ignored invalid media URL:', error)
    }
  }
  return result
}

function canonicalPageUrl(value: string): string {
  const url = new URL(value)
  return `${url.origin}${url.pathname}`
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

function productNodeMatches(node: JsonRecord, productId: string, pageUrl: string): boolean {
  const ids = [node.productID, node.productId, node.identifier].map(text)
  if (ids.includes(productId)) return true
  for (const value of [node.url, node['@id'], node.mainEntityOfPage]) {
    const raw = isRecord(value) ? text(value['@id'] ?? value.url) : text(value)
    if (raw && extractOzonProductId(raw, new URL(pageUrl).origin) === productId) return true
  }
  return false
}

function readOffer(
  offer: JsonRecord,
  product: JsonRecord,
  currentProductId: string,
  singleOffer: boolean,
  pageUrl: string,
): OzonboxVariant | undefined {
  const rawUrl = text(offer.url ?? offer['@id'])
  const declaredProductId = text(offer.productID ?? offer.productId)
    ?? (rawUrl ? extractOzonProductId(rawUrl, new URL(pageUrl).origin) : undefined)
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
    images: uniqueUrls(Array.isArray(offer.image) ? offer.image : [offer.image], pageUrl),
    videos: uniqueUrls(Array.isArray(offer.video) ? offer.video : [offer.video], pageUrl),
    ...(availability?.endsWith('/outofstock') ? { stock: 0 } : {}),
    ...(rawUrl ? { sourceUrl: canonicalPageUrl(new URL(rawUrl, pageUrl).href) } : {}),
    supplierAttrs: [],
    variantAttrs: {},
  }
}

function readJsonLd(productId: string, root: Document = document, pageUrl = location.href): {
  title?: string
  brand?: string
  description?: string
  sku?: string
  images: string[]
  videoUrls: string[]
  specs: Array<Record<string, unknown>>
  variants: OzonboxVariant[]
} {
  const nodes: JsonRecord[] = []
  for (const script of root.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    if (!script.textContent?.trim()) continue
    try {
      collectProductNodes(JSON.parse(script.textContent), nodes)
    } catch (error) {
      console.warn('Ozonbox ignored invalid JSON-LD:', error)
    }
  }
  const product = nodes.find((node) => productNodeMatches(node, productId, pageUrl))
  if (!product) return { images: [], videoUrls: [], specs: [], variants: [] }
  const rawOffers = Array.isArray(product.offers) ? product.offers : isRecord(product.offers) ? [product.offers] : []
  const variants = rawOffers
    .filter(isRecord)
    .map((offer) => readOffer(offer, product, productId, rawOffers.length === 1, pageUrl))
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
    brand: readFactualBrand(product.brand, specs),
    description: text(product.description),
    sku: text(product.sku),
    images: uniqueUrls(Array.isArray(product.image) ? product.image : [product.image], pageUrl),
    videoUrls: uniqueUrls(Array.isArray(product.video) ? product.video : [product.video], pageUrl),
    specs,
    variants,
  }
}

function elementText(selector: string, root: Document = document): string | undefined {
  const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()
  return value || undefined
}

function readDomImages(root: Document = document, pageUrl = location.href): string[] {
  return uniqueUrls(Array.from(root.querySelectorAll<HTMLImageElement>('[data-widget="webGallery"] img'))
    .flatMap((image) => [image.currentSrc, image.getAttribute('src')]), pageUrl)
}

function readDomVideos(root: Document = document, pageUrl = location.href): string[] {
  return uniqueUrls(Array.from(root.querySelectorAll<HTMLElement>('video, video source'))
    .flatMap((media) => [media.getAttribute('src'), media.getAttribute('data-src')]), pageUrl)
}

function readDomPrice(root: Document = document): number | undefined {
  const widget = root.querySelector('[data-widget="webPrice"]')
  if (!widget) return undefined
  return parsePositivePrice(widget.querySelector(
    '[data-testid*="price" i], [class*="Headline600Large"], [class*="price" i]',
  )?.textContent)
}

function readOldPrice(root: Document = document): number | undefined {
  const candidates = root.querySelectorAll<HTMLElement>('[data-widget="webPrice"] span, [data-widget="webPrice"] del, [data-widget="webPrice"] s')
  for (const element of candidates) {
    const inlineDecoration = element.style.textDecorationLine || element.style.textDecoration
    const computedDecoration = typeof document !== 'undefined'
      && root === document
      && typeof getComputedStyle === 'function'
      ? getComputedStyle(element).textDecorationLine
      : ''
    if (element.matches('del, s') || inlineDecoration.includes('line-through') || computedDecoration.includes('line-through')) {
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

function readSpecs(initial: Array<Record<string, unknown>>, root: Document = document): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  initial.forEach((item) => appendSpec(result, seen, text(item.name), text(item.value)))
  const widgets = root.querySelectorAll('[data-widget="webCharacteristics"], [data-widget="webShortCharacteristics"], [data-widget="webFullCharacteristics"]')
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

/**
 * 从一个已核验为目标 Ozon 商品的详情页读取该 SKU 自己的事实。
 * 该函数只消费页面结构化数据和真实 DOM，不推断媒体、价格或尺寸。
 */
export function readOzonVariantFacts(
  root: Document,
  productId: string,
  pageUrl: string,
  variantAttrs: Record<string, unknown> = {},
): OzonboxVariant {
  const structured = readJsonLd(productId, root, pageUrl)
  const structuredCurrent = structured.variants.find((variant) => variant.productId === productId)
    ?? (structured.variants.length === 1 ? structured.variants[0] : undefined)
  const domPrice = readDomPrice(root)
  const price = mergeOptionalNumberFact(productId, '价格', structuredCurrent?.price, domPrice)
  const oldPrice = mergeOptionalNumberFact(productId, '原价', structuredCurrent?.oldPrice, readOldPrice(root))
  const specs = readSpecs(structured.specs, root)
  const packageFacts = readPackageFacts(specs)
  const images = uniqueUrls([
    ...(structuredCurrent?.images ?? []),
    ...structured.images,
    ...readDomImages(root, pageUrl),
  ], pageUrl)
  const videos = uniqueUrls([
    ...(structuredCurrent?.videos ?? []),
    structuredCurrent?.video,
    ...structured.videoUrls,
    ...readDomVideos(root, pageUrl),
  ], pageUrl)
  const mergedAttrs = mergeVariantAttrs(structuredCurrent?.variantAttrs ?? {}, variantAttrs, productId)
  const selectorAttrs = Object.entries(mergedAttrs).map(([label, value]) => ({ label, value }))

  return {
    ...(structuredCurrent ?? {}),
    productId,
    ...(structured.sku ? { sku: structured.sku } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(oldPrice !== undefined ? { oldPrice } : {}),
    images,
    ...(videos.length ? { video: videos[0], videos } : {}),
    sourceUrl: canonicalPageUrl(pageUrl),
    supplierAttrs: mergeRecordFacts([
      ...(structuredCurrent?.supplierAttrs ?? []),
      ...selectorAttrs,
      ...specs,
    ]),
    variantAttrs: mergedAttrs,
    ...packageFacts,
  }
}

export function readOzonCategoryPath(): string | undefined {
  const parts = Array.from(document.querySelectorAll('[data-widget="webBreadcrumb"] a, [data-widget="webBreadcrumbs"] a, nav[aria-label*="breadcrumb" i] a'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value))
  return parts.length ? Array.from(new Set(parts)).join(' > ') : undefined
}

function normalizedText(value: unknown): string | undefined {
  const result = typeof value === 'string'
    ? value.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()
    : undefined
  return result || undefined
}

function descriptorFromText(value: unknown): Pick<OfferSelectorGroup, 'label' | 'currentValue'> | undefined {
  const normalized = normalizedText(value)
  if (!normalized || normalized.length > 160 || CURRENCY_PATTERN.test(normalized)) return undefined
  const match = normalized.match(/^([^:：]{1,60})[:：]\s*([^:：]{1,90})$/u)
  if (!match) return undefined
  const label = normalizedText(match[1])
  const currentValue = normalizedText(match[2])
  if (!label || !currentValue || !/\p{L}/u.test(label)) return undefined
  return { label, currentValue }
}

function descriptorWithoutOptions(element: HTMLElement): Pick<OfferSelectorGroup, 'label' | 'currentValue'> | undefined {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll(`${OFFER_LINK}, button, [role="button"], script, style`).forEach((node) => node.remove())
  const ownDescriptor = descriptorFromText(clone.textContent)
  if (ownDescriptor) return ownDescriptor

  const candidates = Array.from(element.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, span, div'))
    .filter((candidate) => !candidate.closest(OFFER_LINK))
    .flatMap((candidate) => {
      const descriptors = [descriptorFromText(candidate.getAttribute('aria-label')), descriptorFromText(candidate.textContent)]
      return descriptors.filter((descriptor): descriptor is Pick<OfferSelectorGroup, 'label' | 'currentValue'> => Boolean(descriptor))
    })
  const unique = new Map(candidates.map((candidate) => [
    `${candidate.label.toLocaleLowerCase()}\u0000${candidate.currentValue.toLocaleLowerCase()}`,
    candidate,
  ]))
  return unique.size === 1 ? [...unique.values()][0] : undefined
}

function offerSelectorGroup(anchor: HTMLAnchorElement, widget: HTMLElement): OfferSelectorGroup | undefined {
  let element = anchor.parentElement
  while (element && element !== widget) {
    const descriptor = descriptorWithoutOptions(element)
    if (descriptor) return { element, ...descriptor }
    element = element.parentElement
  }
  const descriptor = descriptorWithoutOptions(widget)
  return descriptor ? { element: widget, ...descriptor } : undefined
}

function optionValue(anchor: HTMLAnchorElement, group: OfferSelectorGroup): string | undefined {
  const candidates = [
    anchor.getAttribute('aria-label'),
    anchor.getAttribute('title'),
    ...Array.from(anchor.querySelectorAll<HTMLElement>('[aria-label], [title], img[alt]')).flatMap((element) => [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('alt'),
    ]),
  ]
  const clone = anchor.cloneNode(true) as HTMLAnchorElement
  clone.querySelectorAll(OFFER_PRICE).forEach((node) => node.remove())
  candidates.push(clone.textContent)

  const values = candidates.flatMap((candidate) => {
    const normalized = normalizedText(candidate)
      ?.replace(/\d[\d\s.,]*\s*(?:₽|руб(?:\.|лей|ля)?)/giu, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!normalized || normalized.length > 120 || CURRENCY_PATTERN.test(normalized)) return []
    const withoutLabel = normalized.replace(new RegExp(`^${escapeRegExp(group.label)}\\s*[:：]\\s*`, 'iu'), '').trim()
    return withoutLabel ? [withoutLabel] : []
  })
  return Array.from(new Set(values)).sort((left, right) => left.length - right.length)[0]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function absoluteOfferUrl(anchor: HTMLAnchorElement, pageUrl: string): string | undefined {
  const raw = anchor.getAttribute('href')
  if (!raw) return undefined
  try {
    const url = new URL(raw, pageUrl)
    return extractOzonProductId(url.href) ? url.href : undefined
  } catch {
    return undefined
  }
}

function isSelectedOffer(anchor: HTMLAnchorElement, currentProductId: string, pageUrl: string): boolean {
  const url = absoluteOfferUrl(anchor, pageUrl)
  return (url ? extractOzonProductId(url) : undefined) === currentProductId
    || anchor.getAttribute('aria-current') === 'true'
    || anchor.getAttribute('aria-checked') === 'true'
    || Boolean(anchor.closest('[aria-checked="true"], [data-selected="true"]'))
}

export function readOfferSelector(root: Document, currentProductId: string, pageUrl: string): OfferSelectorResult {
  const variantsByProductId = new Map<string, OzonboxVariant>()
  const widgets = Array.from(root.querySelectorAll<HTMLElement>(OFFER_SELECTOR))
  const anchors = widgets.flatMap((widget) => Array.from(widget.querySelectorAll<HTMLAnchorElement>(OFFER_LINK)))
  const linksByProductId = new Map<string, string>()
  for (const anchor of anchors) {
    const url = absoluteOfferUrl(anchor, pageUrl)
    const productId = url ? extractOzonProductId(url) : undefined
    if (url && productId && !linksByProductId.has(productId)) linksByProductId.set(productId, url)
  }
  const groupByAnchor = new Map<HTMLAnchorElement, OfferSelectorGroup>()
  const groups: OfferSelectorGroup[] = []

  for (const anchor of anchors) {
    const widget = anchor.closest<HTMLElement>(OFFER_SELECTOR)
    if (!widget) continue
    const group = offerSelectorGroup(anchor, widget)
    if (!group) continue
    groupByAnchor.set(anchor, group)
    if (!groups.some((item) => item.element === group.element)) groups.push(group)
  }
  for (const widget of widgets) {
    if (groups.some((group) => group.element === widget)) continue
    const descriptor = descriptorWithoutOptions(widget)
    if (descriptor) groups.push({ element: widget, ...descriptor })
  }

  const currentAttrs: Record<string, string> = {}
  for (const group of groups) {
    const existing = currentAttrs[group.label]
    if (existing !== undefined && existing !== group.currentValue) {
      throw new Error(`Ozon 当前商品的维度“${group.label}”存在冲突值，无法事实性解析选择器`)
    }
    currentAttrs[group.label] = group.currentValue
  }
  const resolved = new Set<string>()
  for (const anchor of anchors) {
    const url = absoluteOfferUrl(anchor, pageUrl)
    const productId = url ? extractOzonProductId(url) : undefined
    if (!productId || !url) continue
    const group = groupByAnchor.get(anchor)
    const value = group ? (isSelectedOffer(anchor, currentProductId, pageUrl) ? group.currentValue : optionValue(anchor, group)) : undefined
    if (!group || !value) continue
    resolved.add(productId)
    const image = anchor.querySelector<HTMLImageElement>('img')
    const priceText = anchor.querySelector(OFFER_PRICE)?.textContent
    const price = priceText && CURRENCY_PATTERN.test(priceText) ? parsePositivePrice(priceText) : undefined
    const variantAttrs = { ...currentAttrs, [group.label]: value }
    const variant: OzonboxVariant = {
      productId,
      ...(price ? { price } : {}),
      images: uniqueUrls([image?.currentSrc, image?.getAttribute('src')], pageUrl),
      sourceUrl: url,
      supplierAttrs: Object.entries(variantAttrs).map(([label, itemValue]) => ({ label, value: itemValue })),
      variantAttrs,
    }
    const existing = variantsByProductId.get(productId)
    variantsByProductId.set(productId, existing ? {
      ...variant,
      ...existing,
      price: mergeOptionalNumberFact(productId, '价格', existing.price, variant.price),
      oldPrice: mergeOptionalNumberFact(productId, '原价', existing.oldPrice, variant.oldPrice),
      stock: mergeOptionalNumberFact(productId, '库存', existing.stock, variant.stock),
      images: uniqueUrls([...existing.images, ...variant.images], pageUrl),
      variantAttrs: mergeVariantAttrs(existing.variantAttrs, variant.variantAttrs, productId),
    } : variant)
  }
  return {
    variants: [...variantsByProductId.values()],
    links: [...linksByProductId].map(([productId, url]) => ({ productId, url })),
    unresolvedProductIds: [...linksByProductId.keys()].filter((productId) => !resolved.has(productId)),
    currentAttrs,
    hasWidgets: widgets.length > 0,
  }
}

async function readOfferSelectorGraph(currentProductId: string): Promise<OfferSelectorGraph> {
  const initial = readOfferSelector(document, currentProductId, location.href)
  if (initial.unresolvedProductIds.length) {
    throw new Error(`Ozon 变体选择器中有 ${initial.unresolvedProductIds.length} 个商品无法关联事实性维度：${initial.unresolvedProductIds.slice(0, 5).join(', ')}`)
  }
  if (!initial.links.length) {
    return { variants: initial.variants, currentAttrs: initial.currentAttrs, hasSelector: initial.hasWidgets }
  }

  const variants: OzonboxVariant[] = [...initial.variants]
  const links = new Map(initial.links.map((link) => [link.productId, link.url]))
  const visited = new Set([currentProductId])
  const queue = initial.links.map((link) => link.productId)

  while (queue.length) {
    if (links.size > MAX_OFFER_GRAPH_SIZE) {
      throw new Error(`Ozon 变体选择器关联商品超过 ${MAX_OFFER_GRAPH_SIZE} 个，已停止采集以避免误抓推荐商品`)
    }
    const productId = queue.shift()!
    if (visited.has(productId)) continue
    const url = links.get(productId)
    if (!url) throw new Error(`Ozon 变体 ${productId} 缺少可核验的详情页地址`)

    let response: Response
    try {
      response = await fetch(url, { credentials: 'include' })
    } catch (error) {
      throw new Error(`无法读取 Ozon 变体 ${productId} 的详情页：${error instanceof Error ? error.message : String(error)}`)
    }
    if (!response.ok) throw new Error(`无法读取 Ozon 变体 ${productId} 的详情页：HTTP ${response.status}`)
    const finalUrl = response.url || url
    const finalProductId = extractOzonProductId(finalUrl)
    if (finalProductId !== productId) {
      throw new Error(`Ozon 变体 ${productId} 的详情页跳转到了不同商品 ${finalProductId ?? '未知'}`)
    }
    const html = await response.text()
    if (!html.trim()) throw new Error(`Ozon 变体 ${productId} 的详情页为空`)
    const remoteDocument = new DOMParser().parseFromString(html, 'text/html')
    const selector = readOfferSelector(remoteDocument, productId, finalUrl)
    if (!selector.hasWidgets || !Object.keys(selector.currentAttrs).length) {
      throw new Error(`Ozon 变体 ${productId} 的详情页未提供可核验的变体选择器，无法确认全部变体`)
    }
    if (selector.unresolvedProductIds.length) {
      throw new Error(`Ozon 变体 ${productId} 的选择器中有 ${selector.unresolvedProductIds.length} 个商品无法关联事实性维度：${selector.unresolvedProductIds.slice(0, 5).join(', ')}`)
    }

    variants.push(readOzonVariantFacts(remoteDocument, productId, finalUrl, selector.currentAttrs), ...selector.variants)
    visited.add(productId)
    for (const link of selector.links) {
      const existingUrl = links.get(link.productId)
      if (existingUrl && new URL(existingUrl).pathname !== new URL(link.url).pathname) {
        throw new Error(`Ozon 变体 ${link.productId} 对应了冲突的详情页地址`)
      }
      if (!existingUrl) links.set(link.productId, link.url)
      if (!visited.has(link.productId)) queue.push(link.productId)
    }
  }

  return {
    variants: mergeVariants([variants]),
    currentAttrs: initial.currentAttrs,
    hasSelector: true,
  }
}

function mergeVariantAttrs(existing: Record<string, unknown>, incoming: Record<string, unknown>, identity: string): Record<string, unknown> {
  const result = { ...incoming, ...existing }
  for (const [name, incomingValue] of Object.entries(incoming)) {
    const existingValue = existing[name]
    if (existingValue !== undefined && text(existingValue) !== text(incomingValue)) {
      throw new Error(`Ozon 变体 ${identity} 的维度“${name}”存在冲突，无法事实性合并`)
    }
  }
  return result
}

function mergeOptionalNumberFact(
  identity: string,
  label: string,
  existing: number | null | undefined,
  incoming: number | null | undefined,
): number | undefined {
  const existingFact = existing ?? undefined
  const incomingFact = incoming ?? undefined
  if (existingFact !== undefined && incomingFact !== undefined && existingFact !== incomingFact) {
    throw new Error(`Ozon 变体 ${identity} 的${label}存在冲突，无法事实性合并`)
  }
  return existingFact ?? incomingFact
}

function mergeOptionalTextFact(
  identity: string,
  label: string,
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | undefined {
  const existingFact = text(existing)
  const incomingFact = text(incoming)
  if (existingFact !== undefined && incomingFact !== undefined && existingFact !== incomingFact) {
    throw new Error(`Ozon 变体 ${identity} 的${label}存在冲突，无法事实性合并`)
  }
  return existingFact ?? incomingFact
}

function stableFactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableFactValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableFactValue(item)]))
}

function mergeRecordFacts(values: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>()
  for (const value of values) {
    const key = JSON.stringify(stableFactValue(value))
    if (!result.has(key)) result.set(key, value)
  }
  return [...result.values()]
}

function mergeVariants(groups: OzonboxVariant[][]): OzonboxVariant[] {
  const result = new Map<string, OzonboxVariant>()
  for (const group of groups) {
    for (const variant of group) {
      const key = variant.productId ? `product:${variant.productId}` : variant.sku ? `sku:${variant.sku}` : variant.offerId ? `offer:${variant.offerId}` : undefined
      if (!key) continue
      const existing = result.get(key)
      const identity = key.replace(/^[^:]+:/, '')
      if (!existing) {
        const videos = uniqueUrls([...(variant.videos ?? []), variant.video], variant.sourceUrl)
        result.set(key, {
          ...variant,
          images: uniqueUrls(variant.images, variant.sourceUrl),
          ...(videos.length ? { video: videos[0], videos } : {}),
          supplierAttrs: mergeRecordFacts(variant.supplierAttrs),
        })
        continue
      }
      const videos = uniqueUrls([
        ...(existing.videos ?? []), existing.video,
        ...(variant.videos ?? []), variant.video,
      ], existing.sourceUrl ?? variant.sourceUrl)
      result.set(key, {
        ...variant,
        ...existing,
        id: mergeOptionalTextFact(identity, 'ID', existing.id, variant.id),
        productId: mergeOptionalTextFact(identity, 'productId', existing.productId, variant.productId),
        sku: mergeOptionalTextFact(identity, 'SKU', existing.sku, variant.sku),
        offerId: mergeOptionalTextFact(identity, 'offerId', existing.offerId, variant.offerId),
        supplierSkuId: mergeOptionalTextFact(identity, '供应商 SKU ID', existing.supplierSkuId, variant.supplierSkuId),
        supplierSpecText: mergeOptionalTextFact(identity, '供应商规格', existing.supplierSpecText, variant.supplierSpecText),
        price: mergeOptionalNumberFact(identity, '价格', existing.price, variant.price),
        oldPrice: mergeOptionalNumberFact(identity, '原价', existing.oldPrice, variant.oldPrice),
        stock: mergeOptionalNumberFact(identity, '库存', existing.stock, variant.stock),
        weight: mergeOptionalNumberFact(identity, '重量', existing.weight, variant.weight),
        depth: mergeOptionalNumberFact(identity, '长度', existing.depth, variant.depth),
        width: mergeOptionalNumberFact(identity, '宽度', existing.width, variant.width),
        height: mergeOptionalNumberFact(identity, '高度', existing.height, variant.height),
        images: uniqueUrls([...existing.images, ...variant.images], existing.sourceUrl ?? variant.sourceUrl),
        ...(videos.length ? { video: videos[0], videos } : {}),
        supplierAttrs: mergeRecordFacts([...existing.supplierAttrs, ...variant.supplierAttrs]),
        variantAttrs: mergeVariantAttrs(existing.variantAttrs, variant.variantAttrs, identity),
      })
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
  const specs = readSpecs(structured.specs)
  const brand = structured.brand ?? readFactualBrand(undefined, specs)
  const selector = await readOfferSelectorGraph(productId)
  const currentVariant = readOzonVariantFacts(document, productId, sourceUrl, selector.currentAttrs)
  const selectorProductIds = new Set([productId, ...selector.variants.flatMap((variant) => variant.productId ? [variant.productId] : [])])
  const structuredSelectorVariants = structured.variants.filter((variant) => (
    variant.productId !== productId && variant.productId !== undefined && variant.productId !== null
    && selectorProductIds.has(variant.productId)
  ))
  if (!selector.hasSelector && structured.variants.some((variant) => variant.productId !== productId)) {
    throw new Error('Ozon 结构化数据包含多个 Offer，但页面未提供可核验的变体选择器，无法确认全部变体维度')
  }
  const variantsData = mergeVariants([[currentVariant], structuredSelectorVariants, selector.variants])
  if (!variantsData.length) throw new Error('当前 Ozon 商品没有带真实身份与正价的变体')
  if (variantsData.length > 1) {
    const incomplete = variantsData.filter((variant) => Object.keys(variant.variantAttrs).length === 0)
    if (incomplete.length) {
      const identities = incomplete.map((variant) => variant.productId ?? variant.sku ?? variant.offerId ?? variant.id).filter(Boolean)
      throw new Error(`Ozon 多变体商品有 ${incomplete.length} 个 SKU 缺少事实性维度：${identities.slice(0, 5).join(', ')}`)
    }
  }
  const description = elementText('[data-widget="webDescription"]') ?? structured.description
  const path = readOzonCategoryPath()
  return {
    source: 'OZON', sourceUrl, productId, recordName: title.slice(0, 200),
    ...(structured.sku ? { sku: structured.sku } : {}),
    title, ...(brand ? { brand } : {}), ...(description ? { description } : {}), images, price,
    specs, variantsData, variantAttrIds: [],
    ...(path ? { categoryPath: path } : {}), status: 'draft',
  }
}

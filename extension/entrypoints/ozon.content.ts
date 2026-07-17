import type { OzonMetrics, ProductVariant, ProductVariantValue, ScrapedProduct } from '@/lib/utils/types'
import '@/features/ozon-tools/content/ozonGenericFetchBridge'
import '@/features/ozon-tools/content/erpFetchProductInfoBridge'
import '@/features/ozon-tools/content/scripts/ozon-seller-logout-bridge'

interface CollectedFact { name: string; value: string; sourcePath?: string }
type CollectorProduct = Partial<ScrapedProduct> & { facts?: CollectedFact[] }
import { injectFloatingButton } from '@/lib/utils/floating-button'
import {
  randomDelay, normalDelay, microPause, readingPause, occasionalLongPause,
  humanScroll, humanScrollToTop, humanScrollToBottom,
  humanClick, humanLinkClick,
  transitionPause, batchTransitionPause, enrichDelay, scrollPause,
} from '@/lib/utils/humanize'

// ─── 通用工具 ───────────────────────────────────────────────

function getText(selector: string, parent: Element | Document = document): string {
  const el = parent.querySelector(selector)
  return el?.textContent?.trim() || ''
}

function parsePrice(text: string): number {
  const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

function normalizeText(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).replace(/\s+/g, ' ').trim()
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalizeText(v)).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    const candidates = [
      value.content, value.text, value.value, value.title, value.name, value.label,
      value.caption, value.displayName, value.textRs, value.values, value.propertyValues,
    ]
    for (const candidate of candidates) {
      const text = normalizeText(candidate)
      if (text) return text
    }
  }
  return ''
}

function decodeOzonState(value: any): any {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || !/^[{[]/.test(text)) return value
  try { return JSON.parse(text) } catch { return value }
}

function decodedOzonStateEntries(states: any): Array<[string, any]> {
  return Object.entries(states || {})
    .map(([key, value]) => [key, decodeOzonState(value)] as [string, any])
    .filter(([, value]) => value && typeof value === 'object')
}

function readOzonVariantValues(node: any): ProductVariantValue[] {
  const candidates = [node?.characteristics, node?.properties, node?.aspects, node?.variantValues]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    const values = candidate.flatMap((item: any) => {
      const name = normalizeText(item?.name ?? item?.title ?? item?.label ?? item?.propertyName)
      const value = normalizeText(item?.value ?? item?.text ?? item?.selectedValue ?? item?.propertyValue)
      return name && value ? [{ name, value }] : []
    })
    if (values.length > 0) return values
  }
  return []
}

function readOzonVariant(node: any): ProductVariant | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null
  const sku = normalizeText(node.sku ?? node.offerId ?? node.offerID ?? node.article ?? node.productId)
  const values = readOzonVariantValues(node)
  if (!sku || values.length === 0) return null
  const barcode = normalizeText(node.barcode ?? node.gtin ?? node.ean).replace(/\s/g, '')
  const price = parsePrice(normalizeText(node.finalPrice ?? node.currentPrice ?? node.price))
  const oldPrice = parsePrice(normalizeText(node.oldPrice ?? node.originalPrice))
  const stock = Number(node.stock ?? node.quantity ?? node.availableQuantity)
  const imageUrl = normalizeOzonMediaUrl(normalizeText(node.imageUrl ?? node.image ?? node.picture))
  return {
    sku,
    ...(barcode ? { barcode } : {}),
    values,
    ...(price > 0 ? { price } : {}),
    ...(oldPrice > 0 ? { oldPrice } : {}),
    ...(Number.isFinite(stock) && stock >= 0 ? { stock } : {}),
    ...(looksLikeImageUrl(imageUrl) ? { imageUrl } : {}),
    sourcePath: 'Ozon widgetStates',
  }
}

function readSchemaVariantValues(node: any): ProductVariantValue[] {
  if (!node || typeof node !== 'object') return []
  const values: ProductVariantValue[] = []
  const append = (name: string, value: any) => {
    const normalized = normalizeText(value)
    if (!normalized || values.some((item) => item.name.toLowerCase() === name.toLowerCase())) return
    values.push({ name, value: normalized })
  }
  append('颜色', node.color)
  append('尺码', node.size)
  for (const property of Array.isArray(node.additionalProperty) ? node.additionalProperty : []) {
    const name = normalizeText(property?.name ?? property?.propertyID)
    const value = normalizeText(property?.value)
    if (name && value) append(name, value)
  }
  return values
}

/** 只读取 Schema.org Product/Offer 明确声明的 SKU，不扫描推荐商品等任意 productId。 */
function extractJsonLdVariants(root: any): ProductVariant[] {
  const products: any[] = []
  const visit = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node !== 'object') return
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
    if (types.some((type) => String(type).toLowerCase() === 'product')) products.push(node)
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(visit)
  }
  visit(root)

  const variants: ProductVariant[] = []
  for (const product of products) {
    const rawOffers = product.offers
      ? (Array.isArray(product.offers) ? product.offers : [product.offers])
      : [product]
    const productValues = readSchemaVariantValues(product)
    for (const offer of rawOffers) {
      const sku = normalizeText(offer?.sku ?? product.sku ?? product.productID)
      if (!sku) continue
      const offerValues = readSchemaVariantValues(offer)
      const values = offerValues.length > 0 ? offerValues : (rawOffers.length === 1 ? productValues : [])
      const barcode = normalizeText(
        offer?.gtin ?? offer?.gtin13 ?? offer?.gtin12 ?? offer?.gtin8
        ?? product.gtin ?? product.gtin13 ?? product.gtin12 ?? product.gtin8,
      ).replace(/\s/g, '')
      const price = Number(offer?.price ?? offer?.priceSpecification?.price)
      const imageUrl = normalizeOzonMediaUrl(normalizeText(offer?.image ?? product.image?.[0] ?? product.image))
      variants.push({
        sku,
        ...(barcode ? { barcode } : {}),
        values,
        ...(Number.isFinite(price) && price > 0 ? { price } : {}),
        ...(looksLikeImageUrl(imageUrl) ? { imageUrl } : {}),
        sourcePath: 'script[type="application/ld+json"] Product/Offer',
      })
    }
  }
  return mergeOzonVariants(variants)
}

function mergeOzonVariants(...groups: Array<ProductVariant[] | undefined>): ProductVariant[] {
  const bySku = new Map<string, ProductVariant>()
  for (const group of groups) {
    for (const variant of group || []) {
      const sku = normalizeText(variant.sku)
      if (!sku) continue
      const existing = bySku.get(sku)
      // 相同 SKU 优先保留变体维度更完整的事实记录。
      if (!existing || (variant.values?.length || 0) > (existing.values?.length || 0)) bySku.set(sku, variant)
    }
  }
  return Array.from(bySku.values())
}

function extractOzonVariants(node: any, depth = 0, result: ProductVariant[] = []): ProductVariant[] {
  if (!node || depth > 8 || result.length >= 200) return result
  if (Array.isArray(node)) {
    for (const item of node) extractOzonVariants(item, depth + 1, result)
    return result
  }
  if (typeof node !== 'object') return result
  const variant = readOzonVariant(node)
  if (variant && !result.some((item) => item.sku === variant.sku)) result.push(variant)
  for (const value of Object.values(node)) extractOzonVariants(value, depth + 1, result)
  return result
}

function pushUniqueText(list: string[] | undefined, value: any, maxLength = 120): string[] {
  const target = list || []
  const text = normalizeText(value)
  if (!text || text.length > maxLength) return target
  if (!target.some((item) => item.toLowerCase() === text.toLowerCase())) target.push(text)
  return target
}

function addPriceRange(result: CollectorProduct, price: number, minQty = 0, maxQty = 0) {
  if (!Number.isFinite(price) || price <= 0) return
  result.priceRanges = result.priceRanges || []
  const exists = result.priceRanges.some((item) => Number(item.price) === price && Number(item.minQty || 0) === minQty)
  if (!exists) result.priceRanges.push({ minQty, maxQty, price })
}

function humanizeOzonKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasOzonPhysicalUnitOrCompound(value: any): boolean {
  const text = normalizeText(value)
  if (!text) return false
  return /\d\s*(?:мм|mm|см|cm|м\b|kg\b|кг|g\b|гр\b|г\b|грамм|литр|л\b)/i.test(text)
    || /\d[\d\s,.]*\s*(?:x|х|×|\*)\s*\d[\d\s,.]*(?:\s*(?:x|х|×|\*)\s*\d[\d\s,.]*)?/i.test(text)
}

function isTrustedOzonPhysicalPath(path: string): boolean {
  const normalized = path.toLowerCase()
  return /(characteristic|properties|property|specification|specifications|params|dimension|dimensions|package|packaging|logistic|shipment|delivery|sku|offer|webfull|webshortcharacteristics|webcharacteristics|webproductproperties|webaspects|webdescription)/i.test(normalized)
}

function isOzonLayoutPhysicalPath(path: string): boolean {
  const normalized = path.toLowerCase()
  return /(gallery|image|images|picture|photo|preview|thumbnail|media|video|icon|logo|banner|layout|style|css|view|viewport|screen|component|widgetstyle|grid|carousel|slider|button|modal|popup|font|offset|position|ratio|aspect|placeholder)/i.test(normalized)
}

function shouldCollectSemanticPhysicalAttribute(path: string, value: any): boolean {
  const hasPhysicalKey = /(weight|вес|масса|depth|height|width|length|dimension|габарит|размер|volume|объем|объём|package|упаков)/i.test(path)
  if (!hasPhysicalKey) return false

  const trustedPath = isTrustedOzonPhysicalPath(path)
  const layoutPath = isOzonLayoutPhysicalPath(path)
  const hasUnit = hasOzonPhysicalUnitOrCompound(value)

  // API 中大量 gallery/image/style 字段也叫 width/height，这些是 UI 像素，不是商品规格。
  // 只有来自明确商品特征/规格/包装/物流路径，或值本身带 mm/cm/g/kg 等物理单位时才采集。
  if (layoutPath && !trustedPath) return false
  return trustedPath || hasUnit
}

function isTrustedPhysicalFact(attr: CollectedFact): boolean {
  const sourcePath = normalizeText((attr as any).sourcePath)
  if (!sourcePath) return true
  if (isOzonLayoutPhysicalPath(sourcePath) && !isTrustedOzonPhysicalPath(sourcePath)) return false
  return isTrustedOzonPhysicalPath(sourcePath) || hasOzonPhysicalUnitOrCompound(attr.value)
}

function looksLikeImageUrl(text: string): boolean {
  return /^https?:\/\//i.test(text) && /(?:\.jpg|\.jpeg|\.png|\.webp|\/wc\d+\/|multimedia|ozonru)/i.test(text) && !/video/i.test(text)
}

function looksLikeVideoUrl(text: string): boolean {
  return /^https?:\/\//i.test(text) && /(?:\.mp4|\.m3u8|video|videohost|rutube|youtube)/i.test(text)
}

function normalizeOzonMediaUrl(url: string): string {
  const text = normalizeText(url)
  if (!text) return ''
  const withProtocol = text.startsWith('//') ? `https:${text}` : text
  return withProtocol.replace(/\/wc\d+\//, '/wc1000/')
}

function collectOzonValueSignals(node: any, result: CollectorProduct, path: string[] = [], depth = 0) {
  if (!node || depth > 8) return
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectOzonValueSignals(item, result, [...path, String(index)], depth + 1))
    return
  }
  if (typeof node !== 'object') return

  const objectText = normalizeText(node)
  if (objectText) applySemanticOzonField(result, path.join('.'), objectText, node)

  for (const [key, rawValue] of Object.entries(node)) {
    const currentPath = [...path, key]
    const pathText = currentPath.join('.')
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      applySemanticOzonField(result, pathText, rawValue, node)
      continue
    }
    if (Array.isArray(rawValue)) {
      if (rawValue.every((item) => typeof item === 'string')) {
        applySemanticOzonField(result, pathText, rawValue.join(', '), node)
      }
      collectOzonValueSignals(rawValue, result, currentPath, depth + 1)
      continue
    }
    collectOzonValueSignals(rawValue, result, currentPath, depth + 1)
  }
}

function applySemanticOzonField(result: CollectorProduct, path: string, value: any, parent?: any) {
  const key = path.toLowerCase().replace(/[-_\s]/g, '')
  const text = normalizeText(value)
  if (!text) return

  if (/url|src|link|image|video|cover|preview|file/.test(key)) {
    const url = normalizeOzonMediaUrl(text)
    if (looksLikeVideoUrl(url)) result.videoUrls = pushUniqueText(result.videoUrls, url, 500)
    else if (looksLikeImageUrl(url)) result.images = pushUniqueText(result.images, url, 500)
  }

  if (!result.title && /(productheading|producttitle|goodstitle|itemtitle|^title$|name$)/.test(key) && text.length > 8 && text.length < 300) {
    result.title = text
  }
  if (!result.description && /(description|annotation|richcontent|fulltext)/.test(key) && text.length > 30) {
    result.description = text.slice(0, 2000)
  }
  if (!result.brand && /(brandname|brand\.name|brandtitle|manufacturer)/.test(path.toLowerCase()) && text.length < 120) {
    result.brand = text
  }
  if (!result.sellerName && /(merchantname|sellername|shopname|companyname|storetitle|seller\.title)/.test(key) && text.length < 160) {
    result.sellerName = text
  }
  if (!result.sellerUrl && /(sellerurl|merchanturl|shopurl|storeurl)/.test(key) && /^https?:\/\//i.test(text)) {
    result.sellerUrl = text
  }

  if (/(actionprice|finalprice|cardprice|pricewithcard|currentprice|price)/.test(key) && !/(old|base|original|before|cross|strike|discount|commission)/.test(key)) {
    const p = parsePrice(text)
    if (p > 0 && (!result.price || p < result.price || /action|final|current/.test(key))) result.price = p
    if (p > 0) addPriceRange(result, p)
  }
  if (/(oldprice|baseprice|originalprice|pricebefore|crossedprice|strikeprice)/.test(key)) {
    const p = parsePrice(text)
    if (p > 0) result.oldPrice = p
  }
  if (!result.discount && /(discount|sale|badge|benefit|скидк|акци)/i.test(`${path} ${text}`) && text.length <= 80) {
    result.discount = text
    result.tags = pushUniqueText(result.tags, text, 80)
  }
  if (/(promotion|promo|badge|label|action|акци|скидк|coupon|купон)/i.test(path) && text.length <= 100 && !/^https?:\/\//i.test(text)) {
    result.tags = pushUniqueText(result.tags, text, 100)
  }
  if (/(paidpromotion|advert|ads|sponsored|реклам|продвиж)/i.test(`${path} ${text}`) && text.length <= 140) {
    addCollectedFact(result.facts!, '付费推广', text, path)
  }

  if (!result.rating && /(rating|score|totalscore)/.test(key)) {
    const r = parseFloat(text.replace(',', '.'))
    if (r > 0 && r <= 5) result.rating = r
  }
  if (!result.reviewCount && /(reviewscount|reviewcount|commentscount|feedbackscount|opinionscount)/.test(key)) {
    const c = parseMetricNumber(text)
    if (c > 0) result.reviewCount = c
  }
  if (!result.stock && /(stock|available|quantity|remain|остат|налич)/i.test(`${path} ${text}`) && text.length < 160) {
    result.stock = text
  }

  if (/(sku|offerid|productid|article|артикул|barcode|gtin|ean)/i.test(path) && text.length < 80) {
    const isBarcode = /(barcode|gtin|ean|штрихкод)/i.test(path)
    const item = isBarcode ? { sku: '', barcode: text.replace(/\D/g, '') || text } : { sku: text, barcode: '' }
    if ((item.sku || item.barcode) && !result.skuList!.some((s) => s.sku === item.sku && s.barcode === item.barcode)) result.skuList!.push(item)
  }
  if (/(monthlysales|salesmonth|soldmonth|ordersmonth|продаж.*месяц)/i.test(key)) addCollectedFact(result.facts!, '月销量', text, path)
  if (/(monthlyrevenue|revenuemonth|turnovermonth|gmv|выручк.*месяц)/i.test(key)) addCollectedFact(result.facts!, '月销售额', text, path)
  if (/(turnover|turnoverdynamics|оборачиваем|динамик)/i.test(key)) addCollectedFact(result.facts!, '周转动态', text, path)
  if (/(followers|subscribers|favorite|wish|followcount|подпис|избран)/i.test(key)) addCollectedFact(result.facts!, '被跟数量', text, path)
  if (/(conversion|cr|конверси)/i.test(key) && /\d/.test(text)) addCollectedFact(result.facts!, '成交率', text, path)
  if (/(rfbs.*commission|commission.*rfbs)/i.test(key)) addCollectedFact(result.facts!, 'rFBS佣金', text, path)
  if (/(fbp.*commission|fbo.*commission|commission.*fbp|commission.*fbo)/i.test(key)) addCollectedFact(result.facts!, 'FBP佣金', text, path)
  if (/(createdat|publishedat|listedat|datecreate|datepublish|размещ|создан)/i.test(key) && text.length < 80) addCollectedFact(result.facts!, '上架时间', text, path)

  if (shouldCollectSemanticPhysicalAttribute(path, text)) {
    addCollectedFact(result.facts!, humanizeOzonKey(path.split('.').slice(-2).join(' ')), text, path)
  }
  applyLogisticsCandidate(result, path, text)

  const minQty = parseMetricNumber(parent?.minQuantity ?? parent?.minQty ?? parent?.from ?? parent?.quantityFrom)
  const maxQty = parseMetricNumber(parent?.maxQuantity ?? parent?.maxQty ?? parent?.to ?? parent?.quantityTo)
  if (/(price|amount)/.test(key) && /(range|tier|quantity|qty|bulk|wholesale)/i.test(JSON.stringify(parent || {}).slice(0, 500))) {
    const p = parsePrice(text)
    if (p > 0) addPriceRange(result, p, minQty, maxQty)
  }
}

function addCollectedFact(attrs: CollectedFact[], name: any, value: any, sourcePath?: string) {
  const attrName = normalizeText(name).replace(/[:：]+$/, '').trim()
  const attrValue = normalizeText(value)
  if (!attrName || !attrValue || attrName === attrValue || attrName.length > 120 || attrValue.length > 500) return
  const attrSourcePath = normalizeText(sourcePath)

  const duplicate = attrs.find((a) => (
    a.name.trim().toLowerCase() === attrName.toLowerCase()
    && a.value.trim().toLowerCase() === attrValue.toLowerCase()
  ))
  if (duplicate) {
    if (attrSourcePath && !(duplicate as any).sourcePath) duplicate.sourcePath = attrSourcePath
    return
  }

  const attr: CollectedFact = { name: attrName, value: attrValue }
  if (attrSourcePath) attr.sourcePath = attrSourcePath
  attrs.push(attr)
}

function mergeCollectedFacts(...groups: Array<CollectedFact[] | undefined>): CollectedFact[] {
  const merged: CollectedFact[] = []
  for (const group of groups) {
    for (const attr of group || []) addCollectedFact(merged, attr.name, attr.value, (attr as any).sourcePath)
  }
  return merged
}

function mergeSkuLists(...groups: Array<ScrapedProduct['skuList'] | undefined>): ScrapedProduct['skuList'] {
  const merged: ScrapedProduct['skuList'] = []
  for (const group of groups) {
    for (const item of group || []) {
      const sku = normalizeText(item?.sku)
      const barcode = normalizeText(item?.barcode)
      if (!sku && !barcode) continue
      if (!merged.some((existing) => existing.sku === sku && existing.barcode === barcode)) merged.push({ sku, barcode })
    }
  }
  return merged
}

function isCategoryWidgetKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '')
  return normalized.includes('breadcrumb') || normalized.includes('breadcrumbs') || normalized.includes('breadcrum')
}

function mergePhysicalSpec(
  base: ScrapedProduct['specList'][number] | undefined,
  fallback: ScrapedProduct['specList'][number] | undefined,
): ScrapedProduct['specList'][number] | undefined {
  if (!base && !fallback) return undefined
  const merged: ScrapedProduct['specList'][number] = {
    weight_g: base?.weight_g || fallback?.weight_g || 0,
    depth_mm: base?.depth_mm || fallback?.depth_mm || 0,
    height_mm: base?.height_mm || fallback?.height_mm || 0,
    width_mm: base?.width_mm || fallback?.width_mm || 0,
    package_weight_g: base?.package_weight_g || fallback?.package_weight_g || 0,
    package_depth_mm: base?.package_depth_mm || fallback?.package_depth_mm || 0,
    package_height_mm: base?.package_height_mm || fallback?.package_height_mm || 0,
    package_width_mm: base?.package_width_mm || fallback?.package_width_mm || 0,
    volume_cm3: base?.volume_cm3 || fallback?.volume_cm3 || 0,
  }

  const extraKeys = new Set<string>([
    ...Object.keys(fallback || {}),
    ...Object.keys(base || {}),
  ])
  for (const key of extraKeys) {
    if (key in merged) continue
    const baseValue = base?.[key]
    const fallbackValue = fallback?.[key]
    merged[key] = baseValue || fallbackValue || ''
  }
  return merged
}

function parseUnitNumber(text: string): number {
  const match = normalizeText(text).match(/([\d]+(?:[\s,.][\d]+)?)/)
  return match ? parseFloat(match[1].replace(/\s/g, '').replace(',', '.')) : 0
}

function parseWeightToGrams(value: string, name = ''): number {
  const text = `${name} ${value}`.toLowerCase()
  const num = parseUnitNumber(value)
  if (!num) return 0
  if (/\bkg\b|кг|килограмм/.test(text)) return Math.round(num * 1000)
  if (/\bmg\b|мг|миллиграм/.test(text)) return Math.round(num / 1000)
  if (/\bг\b|гр|грамм|weight|вес|масса|重量/.test(text)) return Math.round(num)
  return 0
}

function parseLengthToMm(value: string, name = ''): number {
  const text = `${name} ${value}`.toLowerCase()
  const num = parseUnitNumber(value)
  if (!num) return 0
  if (/\bcm\b|см|сантиметр/.test(text)) return Math.round(num * 10)
  if (/\bm\b|метр/.test(text) && !/\bmm\b/.test(text)) return Math.round(num * 1000)
  if (/\bmm\b|мм|миллиметр|длина|ширина|высота|глубина|length|width|height|depth|尺寸/.test(text)) return Math.round(num)
  return 0
}

function isPackagePhysicalField(text: string): boolean {
  return /(упаков|package|packaging|boxed|с упаковкой|в упаковке|包装)/i.test(text)
}

function extractPhysicalSpecFromFacts(attrs: CollectedFact[]): ScrapedProduct['specList'] {
  const spec: ScrapedProduct['specList'][number] = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }

  for (const attr of attrs) {
    if (!isTrustedPhysicalFact(attr)) continue

    const name = normalizeText(attr.name).toLowerCase()
    const value = normalizeText(attr.value)
    const combined = `${name} ${value}`.toLowerCase()
    const isPackage = isPackagePhysicalField(combined)

    if (/(вес|масса|weight|重量)/.test(name)) {
      const weight = parseWeightToGrams(value, name)
      if (weight && isPackage && !spec.package_weight_g) spec.package_weight_g = weight
      if (weight && !isPackage && !spec.weight_g) spec.weight_g = weight
    }

    const dimMatch = value.match(/(\d[\d\s,.]*)\s*(?:x|х|×|\*)\s*(\d[\d\s,.]*)\s*(?:x|х|×|\*)\s*(\d[\d\s,.]*)\s*(мм|mm|см|cm|м|m)?/i)
    if (dimMatch && /(размер|габарит|dimension|size|длина|ширина|высота|尺寸)/.test(name)) {
      const unit = dimMatch[4] || (/(см|cm)/i.test(combined) ? 'см' : /(м|m)/i.test(combined) ? 'м' : 'мм')
      const toMm = (raw: string) => parseLengthToMm(`${raw} ${unit}`, name)
      if (isPackage) {
        if (!spec.package_depth_mm) spec.package_depth_mm = toMm(dimMatch[1])
        if (!spec.package_width_mm) spec.package_width_mm = toMm(dimMatch[2])
        if (!spec.package_height_mm) spec.package_height_mm = toMm(dimMatch[3])
      } else {
        if (!spec.depth_mm) spec.depth_mm = toMm(dimMatch[1])
        if (!spec.width_mm) spec.width_mm = toMm(dimMatch[2])
        if (!spec.height_mm) spec.height_mm = toMm(dimMatch[3])
      }
    }

    const length = /(глубин|длин|depth|length|длина|长)/.test(name) ? parseLengthToMm(value, name) : 0
    const height = /(высот|height|высота|高)/.test(name) ? parseLengthToMm(value, name) : 0
    const width = /(ширин|width|ширина|宽)/.test(name) ? parseLengthToMm(value, name) : 0
    if (isPackage) {
      if (!spec.package_depth_mm && length) spec.package_depth_mm = length
      if (!spec.package_height_mm && height) spec.package_height_mm = height
      if (!spec.package_width_mm && width) spec.package_width_mm = width
    } else {
      if (!spec.depth_mm && length) spec.depth_mm = length
      if (!spec.height_mm && height) spec.height_mm = height
      if (!spec.width_mm && width) spec.width_mm = width
    }

    if (!spec.color && /(цвет|color|颜色)/.test(name) && value.length <= 80) spec.color = value
    if (!spec.size && /(размер|size|尺码|规格)/.test(name) && value.length <= 120) spec.size = value
  }

  const volumeLength = spec.package_depth_mm || 0
  const volumeWidth = spec.package_width_mm || 0
  const volumeHeight = spec.package_height_mm || 0
  if (volumeLength && volumeWidth && volumeHeight) spec.volume_cm3 = Math.round((volumeLength * volumeWidth * volumeHeight) / 1000)

  const hasSpec = spec.weight_g || spec.depth_mm || spec.height_mm || spec.width_mm || spec.package_weight_g || spec.package_depth_mm || spec.package_height_mm || spec.package_width_mm || spec.color || spec.size
  return hasSpec ? [spec] : []
}

function firstFactValue(attrs: CollectedFact[], patterns: RegExp[]): string {
  for (const attr of attrs) {
    const name = normalizeText(attr.name)
    if (patterns.some((pattern) => pattern.test(name))) return normalizeText(attr.value)
  }
  return ''
}

function parseMetricNumber(value: any): number {
  const text = normalizeText(value).replace(/\u00a0/g, ' ')
  if (!text) return 0
  const multiplier = /(?:млн|million|millions)/i.test(text) ? 1_000_000 : /(?:тыс|k\b|thousand)/i.test(text) ? 1_000 : 1
  const match = text.match(/(\d[\d\s.,]*)/)
  if (!match) return 0
  const normalized = match[1].replace(/\s/g, '').replace(',', '.')
  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : 0
}

function parseMetricPercent(value: any): number {
  const parsed = parseFloat(normalizeText(value).replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = normalizeText(value)
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    result.push(text)
  }
  return result
}

function parseDeliveryDays(value: any): number {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 0
  const range = text.match(/(\d+)\s*[-–—]\s*(\d+)\s*(?:дн|day|день|дня|дней|天)/i)
  if (range) return parseInt(range[2]) || parseInt(range[1]) || 0
  const single = text.match(/(\d+)\s*(?:дн|day|день|дня|дней|天|час|hour)/i)
  if (!single) return 0
  const n = parseInt(single[1]) || 0
  return /час|hour/i.test(text) && n > 0 ? 1 : n
}

function inferLogisticsType(text: any): string {
  const value = normalizeText(text)
  if (/delivery\s*by\s*ozon|доставк[аи]\s+ozon|со склада ozon|fbo/i.test(value)) return 'FBO'
  if (/delivery\s*by\s*seller|доставк[аи]\s+продавц|fbs/i.test(value)) return 'FBS'
  if (/partner\s*delivery|real\s*fbs|rfbs|партн[её]р/i.test(value)) return 'realFBS'
  return ''
}

function applyLogisticsCandidate(result: CollectorProduct, key: string, value: any) {
  const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, '')
  const text = normalizeText(value)
  if (!text || text.length > 180) return

  const logisticsType = inferLogisticsType(`${key} ${text}`)
  if (logisticsType && !result.logisticsType) result.logisticsType = logisticsType
  if (!result.deliveryDays) result.deliveryDays = parseDeliveryDays(text)

  if (!result.warehouse && /(warehouse|склад|warehousename|stockname)/i.test(key)) result.warehouse = text
  if (!result.warehouseId && /(warehouseid|stockid|складid)/i.test(normalizedKey)) result.warehouseId = text
  if (!result.deliveryMethod && /(deliverymethod|method|courier|pickup|способ|доставк)/i.test(key)) result.deliveryMethod = text
  if (!result.deliveryRegion && /(region|address|city|location|регион|город|адрес)/i.test(key)) result.deliveryRegion = text
}

function extractLogisticsFromObject(node: any, result: CollectorProduct, depth = 0) {
  if (!node || depth > 6) return
  if (Array.isArray(node)) {
    node.forEach((item) => extractLogisticsFromObject(item, result, depth + 1))
    return
  }
  if (typeof node !== 'object') return

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' || typeof value === 'number') applyLogisticsCandidate(result, key, value)
    if (typeof value === 'object') extractLogisticsFromObject(value, result, depth + 1)
  }
}

function extractLogisticsFromDocument(doc: Document): CollectorProduct {
  const result: CollectorProduct = {}
  const selectors = [
    '[data-widget*="Delivery"]', '[data-widget*="delivery"]', '[data-widget*="Logistic"]',
    '[data-widget*="Stock"]', '[data-widget*="Availability"]', '[data-widget*="Pickup"]',
    '[data-widget*="webDelivery"]', '[data-widget*="webAddToCart"]',
  ].join(', ')

  Array.from(doc.querySelectorAll(selectors)).forEach((el) => {
    const widget = el.getAttribute('data-widget') || ''
    const text = normalizeText(el.textContent || '')
    applyLogisticsCandidate(result, widget || 'delivery', text)
  })

  const bodyText = normalizeText(doc.body?.innerText || doc.body?.textContent || '')
  if (!result.logisticsType) result.logisticsType = inferLogisticsType(bodyText)
  if (!result.deliveryDays) result.deliveryDays = parseDeliveryDays(bodyText)
  return result
}

function buildOzonMetrics(product: CollectorProduct): OzonMetrics {
  const attrs = product.facts || []
  const spec = product.specList?.[0] || { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }
  const skuFromList = product.skuList?.find((item) => normalizeText(item.sku))?.sku || ''
  const articleNumber = firstFactValue(attrs, [
    /^артикул$/i,
    /артикул\s*(продавца|поставщика)?/i,
    /vendor\s*code/i,
    /article/i,
    /货号/,
  ])
  const sku = skuFromList || firstFactValue(attrs, [/^sku$/i, /ozon\s*sku/i, /озон\s*sku/i]) || product.sourceId || ''
  const monthlySales = parseMetricNumber(firstFactValue(attrs, [/月销量/, /monthly\s*sales/i, /продаж[иа]?\s*в\s*месяц/i]))
  const monthlyRevenueAttr = parseMetricNumber(firstFactValue(attrs, [/月销售额/, /monthly\s*revenue/i, /выручк[аеи]?\s*за\s*месяц/i]))
  const monthlyRevenue = monthlyRevenueAttr || (monthlySales && product.price ? Math.round(monthlySales * product.price) : 0)
  const priceCandidates = [product.price || 0, product.oldPrice || 0, ...(product.priceRanges || []).map((range: any) => Number(range.price) || 0)].filter((value) => value > 0)
  const packageLengthMm = spec.package_depth_mm || 0
  const packageWidthMm = spec.package_width_mm || 0
  const packageHeightMm = spec.package_height_mm || 0
  const packageWeightG = spec.package_weight_g || 0
  const volumeCm3 = spec.volume_cm3 || (packageLengthMm && packageWidthMm && packageHeightMm ? Math.round((packageLengthMm * packageWidthMm * packageHeightMm) / 1000) : 0)

  const metrics: OzonMetrics = {
    sku,
    articleNumber,
    brand: product.brand || firstFactValue(attrs, [/^бренд$/i, /^brand$/i, /品牌/]),
    category: product.category || '',
    promotions: uniqueStrings([...(product.tags || []), product.discount]),
    paidPromotion: firstFactValue(attrs, [/付费推广/, /paid\s*promotion/i, /реклам/i, /продвиж/i]),
    monthlyRevenue,
    monthlySales,
    turnoverDynamics: firstFactValue(attrs, [/周转动态/, /turnover/i, /оборачиваем/i, /динамик/i]),
    followersCount: parseMetricNumber(firstFactValue(attrs, [/被跟数量/, /followers?/i, /подпис/i, /отслеж/i])),
    minPrice: priceCandidates.length ? Math.min(...priceCandidates) : 0,
    maxPrice: priceCandidates.length ? Math.max(...priceCandidates) : 0,
    rfbsCommission: parseMetricPercent(firstFactValue(attrs, [/rFBS\s*佣金/i, /rfbs/i])),
    fbpCommission: parseMetricPercent(firstFactValue(attrs, [/FBP\s*佣金/i, /fbp/i])),
    conversionRate: parseMetricPercent(firstFactValue(attrs, [/成交率/, /conversion/i, /конверси/i])),
    volumeCm3,
    lengthMm: packageLengthMm,
    widthMm: packageWidthMm,
    heightMm: packageHeightMm,
    weightG: packageWeightG,
    packageWeightG,
    packageLengthMm,
    packageWidthMm,
    packageHeightMm,
    warehouse: product.warehouse || firstFactValue(attrs, [/warehouse/i, /склад/i, /仓库/]),
    warehouseId: product.warehouseId || '',
    logisticsType: product.logisticsType || inferLogisticsType(`${product.deliveryMethod || ''} ${product.warehouse || ''}`),
    deliveryMethod: product.deliveryMethod || firstFactValue(attrs, [/delivery\s*method/i, /способ\s*достав/i, /配送方式/]),
    deliveryRegion: product.deliveryRegion || firstFactValue(attrs, [/delivery\s*region/i, /регион/i, /配送区域/]),
    deliveryDays: product.deliveryDays || parseDeliveryDays(firstFactValue(attrs, [/delivery/i, /достав/i, /配送时效/])),
    listedAt: firstFactValue(attrs, [/上架时间/, /listed/i, /created/i, /размещ/i, /дата\s*(создания|публикации)/i]),
    missingFields: [],
  }

  const requiredChecks: Array<[keyof OzonMetrics, string, (value: any) => boolean]> = [
    ['sku', 'SKU', Boolean],
    ['articleNumber', '货号', Boolean],
    ['brand', '品牌', Boolean],
    ['category', '类目', Boolean],
    ['promotions', '促销活动', (value) => Array.isArray(value) && value.length > 0],
    ['paidPromotion', '付费推广', Boolean],
    ['monthlyRevenue', '月销售额', (value) => value > 0],
    ['monthlySales', '月销量', (value) => value > 0],
    ['turnoverDynamics', '周转动态', Boolean],
    ['followersCount', '被跟数量', (value) => value > 0],
    ['minPrice', '最低价', (value) => value > 0],
    ['maxPrice', '最高价', (value) => value > 0],
    ['rfbsCommission', 'rFBS佣金', (value) => value > 0],
    ['fbpCommission', 'FBP佣金', (value) => value > 0],
    ['conversionRate', '成交率', (value) => value > 0],
    ['volumeCm3', '体积', (value) => value > 0],
    ['lengthMm', '长', (value) => value > 0],
    ['widthMm', '宽', (value) => value > 0],
    ['heightMm', '高', (value) => value > 0],
    ['weightG', '重量', (value) => value > 0],
    ['warehouse', '仓库', Boolean],
    ['logisticsType', '物流模式', Boolean],
    ['deliveryMethod', '配送方式', Boolean],
    ['deliveryRegion', '配送区域', Boolean],
    ['deliveryDays', '配送时效', (value) => value > 0],
    ['listedAt', '上架时间', Boolean],
  ]
  metrics.missingFields = requiredChecks
    .filter(([key, _label, isPresent]) => !isPresent((metrics as any)[key]))
    .map(([_key, label]) => label)
  return metrics
}

function appendOzonMetrics(product: CollectorProduct): CollectorProduct {
  return { ...product, ozonMetrics: buildOzonMetrics(product) }
}

function extractCategoryFromBreadcrumbItems(items: any[]): string {
  const ignored = /^(ozon|главная|каталог|home|首页|главная страница)$/i
  const cats = items
    .map((item) => normalizeText(item?.title ?? item?.text ?? item?.label ?? item?.name ?? item?.content ?? item))
    .filter((text) => text && !ignored.test(text) && !/ozon\.ru/i.test(text))
  return cats.join(' > ')
}

function extractCategoryFromWidget(widget: any): string {
  const candidates = [
    widget?.options?.items, widget?.items, widget?.links, widget?.breadcrumbs, widget?.breadCrumbs,
    widget?.options?.breadcrumbs, widget?.options?.breadCrumbs, widget?.categoryPath, widget?.categories,
    widget?.path, widget?.items?.items, widget?.content?.items, widget?.content?.breadcrumbs,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const category = extractCategoryFromBreadcrumbItems(candidate)
      if (category) return category
    }
  }
  return normalizeText(widget?.category?.title ?? widget?.category?.name ?? widget?.categoryName)
}

function extractFactPairsFromObject(node: any, attrs: CollectedFact[], depth = 0) {
  if (!node || depth > 5) return
  if (Array.isArray(node)) {
    node.forEach((item) => extractFactPairsFromObject(item, attrs, depth + 1))
    return
  }
  if (typeof node !== 'object') return

  const name = normalizeText(node.name ?? node.propertyName ?? node.title ?? node.label ?? node.caption ?? node.key)
  const value = normalizeText(node.value ?? node.text ?? node.propertyValue ?? node.propertyValues ?? node.values ?? node.content)
  addCollectedFact(attrs, name, value)

  for (const key of ['characteristics', 'properties', 'params', 'items', 'rows', 'sections', 'groups']) {
    if (Array.isArray(node[key])) extractFactPairsFromObject(node[key], attrs, depth + 1)
    if (Array.isArray(node.options?.[key])) extractFactPairsFromObject(node.options[key], attrs, depth + 1)
  }
}

function extractOzonIdsFromObject(node: any, result: CollectorProduct, depth = 0) {
  if (!node || depth > 6 || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => extractOzonIdsFromObject(item, result, depth + 1))
    return
  }
  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '')
    if (!result.ozonCategoryId && /^(descriptioncategoryid|categoryid)$/.test(normalizedKey)) {
      const id = Number(value)
      if (Number.isFinite(id) && id > 0) result.ozonCategoryId = id
    }
    if (!result.ozonTypeId && normalizedKey === 'typeid') {
      const id = Number(value)
      if (Number.isFinite(id) && id > 0) result.ozonTypeId = id
    }
    if (typeof value === 'object') extractOzonIdsFromObject(value, result, depth + 1)
  }
}

// ─── 页面类型检测 ────────────────────────────────────────────

function detectPageType(): 'product' | 'list' | 'unknown' {
  const path = location.pathname
  // 列表页优先检测 — 分类/品牌/搜索/卖家/集合页 URL 末尾可能也带数字
  // 例如 /category/krupnaya-bytovaya-tehnika-10501/ 末尾有 10501
  if (/\/(category|brand|search|seller|collection|c)\//i.test(path)) {
    return 'list'
  }
  // 商品详情页检测:
  // 1. 纯数字结尾: /3087144237/
  // 2. slug结尾带数字: /product/tyul-shtory-...-3087144237/
  // 3. /product/ 路径下任何详情页
  const segments = path.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const lastSeg = segments[segments.length - 1]
    const secondSeg = segments[0]
    // /product/xxx-123/ — 直接匹配
    if (secondSeg === 'product') return 'product'
    // 最后一段是纯数字 (老式 URL)
    if (/^\d+\/?$/.test(lastSeg)) return 'product'
    // 最后一段以数字结尾 (slug URL, 如 xxx-1234567/)
    if (/\-\d+\/?$/.test(lastSeg)) return 'product'
  }
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════════
//  商品详情页 采集
// ═══════════════════════════════════════════════════════════════

function extractDetailSourceId(): string {
  // 支持 slug URL: /product/xxx-3087144237/ 和旧式 /3087144237/
  const match = location.pathname.match(/(\d{5,})\s*\/?\s*$/)
  return match?.[1] || ''
}

function extractDetailImages(): string[] {
  const imgs = Array.from(document.querySelectorAll('[data-widget="webGallery"] img'))
    .map((img) => (img as HTMLImageElement).src)
    .filter((src) => src && !src.includes('icon') && !src.includes('logo'))
  const hd = imgs.map((s) => s.replace(/\/wc\d+\//, '/wc500/'))
  return [...new Set(hd.length ? hd : imgs)].slice(0, 10)
}

function extractDetailPrice(): number {
  const mainPrice = document.querySelector('[data-widget="webPrice"] .tsHeadline600Large')
  if (mainPrice) return parsePrice(mainPrice.textContent || '')
  const el = document.querySelector('[data-widget="webPrice"] span[class*="Headline"]')
  return parsePrice(el?.textContent || '')
}

function extractDetailOldPrice(): number {
  const oldEl = document.querySelector('[data-widget="webPrice"] span.pdp_bj')
  if (oldEl) return parsePrice(oldEl.textContent || '')
  const spans = document.querySelectorAll('[data-widget="webPrice"] span')
  for (const span of Array.from(spans)) {
    if (window.getComputedStyle(span).textDecorationLine.includes('line-through')) {
      return parsePrice(span.textContent || '')
    }
  }
  return 0
}

function extractDetailRating(): number {
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const match = el.textContent.match(/([\d.]+)/)
    return match ? parseFloat(match[1]) : 0
  }
  const star = document.querySelector('[class*="rating"], [class*="star"]')
  const match = star?.textContent?.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractDetailReviewCount(): number {
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const match = el.textContent.replace(/\s/g, '').match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }
  return 0
}

function extractDetailBrand(): string {
  const brandEl = document.querySelector('[data-widget="webBrandName"] a, [data-widget="webBrandName"] span')
  if (brandEl) return brandEl.textContent?.trim() || ''
  const links = Array.from(document.querySelectorAll('a[href*="/brand/"]'))
  return links[0]?.textContent?.trim() || ''
}

function extractDetailCategory(): string {
  // 只从 Ozon 明确的面包屑/结构化 meta 中取类目，避免 nav 或随机 category 链接污染类目路径。
  const breadcrumbSelector = [
    '[data-widget="webBreadcrumb"] a',
    '[data-widget="breadCrumbs"] a',
    '[data-widget="webBreadcrumbs"] a',
    '[data-widget*="Breadcrumb"] a',
    '[data-widget*="breadCrumb"] a',
    '[data-widget*="breadcrumb"] a',
    'nav[aria-label*="breadcrumb" i] a',
  ].join(', ')

  const breadcrumbs = Array.from(document.querySelectorAll<HTMLAnchorElement>(breadcrumbSelector))
  const category = extractCategoryFromBreadcrumbItems(breadcrumbs.map((a) => a.textContent?.trim() || ''))
  if (category) return category

  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
    try {
      const json = JSON.parse(script.textContent || '{}')
      const list = Array.isArray(json) ? json : [json]
      for (const item of list) {
        if (item?.['@type'] === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
          const fromLd = extractCategoryFromBreadcrumbItems(item.itemListElement.map((x: any) => x?.item?.name || x?.name || ''))
          if (fromLd) return fromLd
        }
      }
    } catch { /* ignore invalid JSON-LD */ }
  }

  const metaCategory = document.querySelector('meta[property="product:category"], meta[name="category"]')?.getAttribute('content') || ''
  return normalizeText(metaCategory)
}

function extractDetailSellerName(): string {
  const merchantEl = document.querySelector('[data-widget="webMerchantInfo"] a, [data-widget="webMerchantInfo"] span')
  if (merchantEl) return merchantEl.textContent?.trim() || ''
  const bestEl = document.querySelector('[data-widget="webBestSeller"] button span')
  if (bestEl) {
    const text = bestEl.textContent?.trim() || ''
    return text.replace(/\d+\s*₽.*$/, '').trim() || text
  }
  return ''
}

async function extractDetailFacts(): Promise<CollectedFact[]> {
  const facts: CollectedFact[] = []

  // 策略 1: 先尝试逐个点击「展开全部」按钮,让折叠的特征显示出来
  // ★ 拟人化:逐个点击而非批量点击,每次点击后等待 DOM 更新
  const expandBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"], [data-widget="webCharacteristics"] button, [class*="characteristic"] button'
  )
  for (const btn of Array.from(expandBtns)) {
    const text = btn.textContent?.trim() || ''
    if (/показать все|展开|show more|все характеристики/i.test(text)) {
      await humanClick(btn as HTMLElement)
      await normalDelay(300, 800)
    }
  }

  // 策略 2: 从所有明确 characteristics widget 解析特征。
  // Ozon 常同时渲染 webShortCharacteristics / webCharacteristics / webFullCharacteristics，必须全部合并。
  const charWidgets = Array.from(document.querySelectorAll('[data-widget*="Characteristics"], [data-widget*="characteristics"], [data-widget*="Properties"], [data-widget*="Specifications"]'))
  for (const charWidget of charWidgets) {
    for (const dl of Array.from(charWidget.querySelectorAll('dl'))) {
      const terms = Array.from(dl.querySelectorAll('dt'))
      for (const dt of terms) {
        const name = dt.textContent?.trim() || ''
        const dd = dt.nextElementSibling
        const value = dd?.textContent?.trim() || ''
        addCollectedFact(facts, name, value)
      }
    }

    charWidget.querySelectorAll('tr, li, [class*="row"], [class*="item"]').forEach((row) => {
      const children = Array.from(row.children).filter((child) => normalizeText(child.textContent))
      if (children.length >= 2) {
        const name = children[0]?.textContent?.trim() || ''
        const value = children.slice(1).map((child) => child.textContent?.trim() || '').filter(Boolean).join(', ')
        addCollectedFact(facts, name, value)
      }
    })
  }

  return facts
}

/** 提取 SKU / article 编号 — Ozon 商品页有专门的 SKU 展示区域 */
function extractDetailSku(): string {
  // Ozon 通常在「Артикул」或「SKU」标签附近显示编号
  const allText = document.body.innerText || ''
  const skuPatterns = [
    /(?:Ozon\s*SKU|SKU\s*Ozon|Артикул\s+Ozon)[:\s№#]*([\w\-.]+)/i,
    /Артикул(?!\s+(?:продавца|поставщика))[:\s№#]*(\d{5,})/i,
    /\bSKU[:\s№#]*([\w\-.]+)/i,
  ]
  for (const pattern of skuPatterns) {
    const match = allText.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  // 尝试从 meta 标签提取
  const metaSku = document.querySelector('meta[itemprop="sku"]')
  if (metaSku) return metaSku.getAttribute('content') || ''
  // 尝试从 JSON-LD 提取
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const s of Array.from(scripts)) {
    try {
      const json = JSON.parse(s.textContent || '{}')
      if (json.sku) return String(json.sku)
      if (json.productID) return String(json.productID)
    } catch { /* ignore */ }
  }
  return ''
}

/** 提取商品页变体/SKU 信息 */
function extractDetailVariants(): string {
  const variants: string[] = []
  // 颜色/内存/尺寸变体按钮
  const variantEls = document.querySelectorAll(
    '[data-widget="webOfferSelector"] button, [class*="variant"] button, [class*="offer"] [class*="option"] button'
  )
  variantEls.forEach((el) => {
    const text = el.textContent?.trim() || ''
    if (text && text.length < 50) variants.push(text)
  })
  return variants.join(', ')
}

function extractDetailDescription(): string {
  const el = document.querySelector('[data-widget="webDescription"]')
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

async function scrapeOzonProduct(): Promise<ScrapedProduct | null> {
  const sourceId = extractDetailSourceId()
  if (!sourceId) return null

  // ★ 拟人化:先模拟浏览页面顶部内容,等待页面完全加载
  await readingPause()

  // 模拟用户慢慢向下滚动查看商品信息
  const scrollTargets = [300, 600, 400]
  for (const dist of scrollTargets) {
    await humanScroll(dist)
    await normalDelay(400, 1000)
  }

  // 展开全部特征
  const expandAllBtns = document.querySelectorAll(
    'button[class*="show-more"], button[class*="expand"]'
  )
  for (const btn of Array.from(expandAllBtns)) {
    await humanClick(btn as HTMLElement)
  }

  await microPause()
  const facts = await extractDetailFacts()

  // SKU 仅作为标识特征；完整变体必须来自结构化页面数据/API。
  const sku = extractDetailSku()
  if (sku) facts.unshift({ name: 'Артикул (SKU)', value: sku })
  const variantSummary = extractDetailVariants()
  if (variantSummary) facts.push({ name: '变体选项', value: variantSummary })

  // 从 JSON-LD 补充额外结构化数据
  let jsonLd: any = null
  const jsonLdDocuments: any[] = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent || '{}')
      jsonLdDocuments.push(data)
      if (data['@type'] === 'Product' || data.productID) jsonLd = data
    } catch { /* ignore */ }
  })
  if (jsonLd) {
    if (jsonLd.sku && !sku) facts.unshift({ name: 'SKU', value: String(jsonLd.sku) })
    if (jsonLd.brand?.name) { /* brand 已单独提取 */ }
    if (jsonLd.weight) facts.push({ name: '重量', value: String(jsonLd.weight) })
    if (jsonLd.color) facts.push({ name: '颜色', value: String(jsonLd.color) })
  }

  // ── 拟人化: 先尝试通过内部 API 获取结构化数据 (评分/规格/视频/标签更准确) ──
  let apiData: CollectorProduct | null = null
  try {
    apiData = await fetchProductDetailFromApi(sourceId, location.href)
  } catch { /* DOM fallback below */ }

  // ── 从 DOM 提取基础数据 (作为 fallback / 补充) ──
  const domData = {
    title: getText('h1') || getText('[data-widget="webProductHeading"] span'),
    price: extractDetailPrice(),
    oldPrice: extractDetailOldPrice(),
    images: extractDetailImages(),
    rating: extractDetailRating(),
    reviewCount: extractDetailReviewCount(),
    brand: extractDetailBrand() || (jsonLd?.brand?.name ?? ''),
    category: extractDetailCategory(),
    sellerName: extractDetailSellerName(),
    facts,
    description: extractDetailDescription(),
  }

  // ── 从 DOM 提取视频 (<video> 元素 + 嵌入视频源) ──
  const domVideos: string[] = []
  document.querySelectorAll('video source, video').forEach((el) => {
    const src = (el as HTMLSourceElement).src || (el as HTMLVideoElement).src || ''
    if (src && src.startsWith('http') && !domVideos.includes(src)) domVideos.push(src)
  })
  // Ozon 视频也经常以 data 特征或 iframe 形式出现
  document.querySelectorAll('[data-video-url], [data-src*="video"]').forEach((el) => {
    const url = el.getAttribute('data-video-url') || el.getAttribute('data-src') || ''
    if (url && url.startsWith('http') && !domVideos.includes(url)) domVideos.push(url)
  })

  // ── 从 DOM 提取真实促销标签；不把分类/品牌/任意 class=tag 文本混入 tags。
  const domTags: string[] = []
  document.querySelectorAll('[data-widget="webPromoLabel"] span, [data-widget="webProductDiscount"] span').forEach((el) => {
    const t = el.textContent?.trim() || ''
    if (t && t.length < 50 && !domTags.includes(t)) domTags.push(t)
  })

  const collectedFacts = mergeCollectedFacts(apiData?.facts, domData.facts)
  const jsonLdVariants = extractJsonLdVariants(jsonLdDocuments)
  const mergedVariants = mergeOzonVariants(apiData?.variants, jsonLdVariants)
  // DOM 中明确展示的 SKU 且页面/API 均未声明多 Offer 时，它就是无变体维度的单 Offer。
  // 这是页面事实的表达，不使用 sourceId 或默认值构造 SKU。
  if (mergedVariants.length === 0 && sku && !variantSummary) {
    mergedVariants.push({ sku, values: [], sourcePath: 'DOM Артикул/SKU' })
  }
  const variantSkus = new Set(mergedVariants.map((variant) => variant.sku))
  const verifiedApiSkuList = (apiData?.skuList || []).filter((item) => !item.sku || variantSkus.has(item.sku))
  const mergedSkuList = mergeSkuLists(
    verifiedApiSkuList,
    sku ? [{ sku, barcode: '' }] : [],
    mergedVariants.map((variant) => ({ sku: variant.sku, barcode: variant.barcode || '' })),
  )
  const inferredSpecList = extractPhysicalSpecFromFacts(collectedFacts)
  const mergedSpec = mergePhysicalSpec(apiData?.specList?.[0], inferredSpecList[0])
  const mergedSpecList = mergedSpec ? [mergedSpec] : []
  const domLogistics = extractLogisticsFromDocument(document)

  // ── 合并: API 数据优先 (更准确), DOM 数据补充缺失字段 ──
  const merged = appendOzonMetrics({
    platform: 'ozon',
    sourceId,
    title: apiData?.title || domData.title,
    currency: 'RUB',
    price: apiData?.price || domData.price,
    oldPrice: apiData?.oldPrice || domData.oldPrice,
    images: (apiData?.images?.length ? apiData.images : domData.images).slice(0, 20),
    rating: apiData?.rating || domData.rating,
    reviewCount: apiData?.reviewCount || domData.reviewCount,
    brand: apiData?.brand || domData.brand,
    category: apiData?.category || domData.category,
    sellerName: apiData?.sellerName || domData.sellerName,
    sellerUrl: apiData?.sellerUrl || '',
    description: (apiData?.description && apiData.description.length > 10 ? apiData.description : domData.description),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
    videoUrls: (apiData?.videoUrls?.length ? apiData.videoUrls : domVideos),
    skuList: mergedSkuList,
    variants: mergedVariants,
    specList: mergedSpecList,
    tags: (apiData?.tags?.length ? apiData.tags : domTags),
    ozonCategoryId: apiData?.ozonCategoryId || 0,
    ozonTypeId: apiData?.ozonTypeId || 0,
    warehouse: apiData?.warehouse || domLogistics.warehouse || '',
    warehouseId: apiData?.warehouseId || domLogistics.warehouseId || '',
    logisticsType: apiData?.logisticsType || domLogistics.logisticsType || '',
    deliveryMethod: apiData?.deliveryMethod || domLogistics.deliveryMethod || '',
    deliveryRegion: apiData?.deliveryRegion || domLogistics.deliveryRegion || '',
    deliveryDays: apiData?.deliveryDays || domLogistics.deliveryDays || 0,
    discount: apiData?.discount || '',
    stock: apiData?.stock || '',
    priceRanges: apiData?.priceRanges || [],
    minOrderQty: apiData?.minOrderQty || 0,
    supplierUrl: apiData?.supplierUrl || '',
    tradeQuantity: apiData?.tradeQuantity || 0,
  }) as ScrapedProduct


  return merged
}

// ═══════════════════════════════════════════════════════════════
//  列表页 采集 (分类/品牌/搜索结果页 → 滚动采集)
// ═══════════════════════════════════════════════════════════════

interface ListCard {
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  rating: number
  reviewCount: number
  brand: string
  sellerName: string
  sourceUrl: string
}

/** 从一个商品卡片 DOM 元素提取摘要 */
function parseCard(el: HTMLElement): ListCard | null {
  // Ozon href 格式: /product/...-1425179442/?at=xxx 或 /product/...-1425179442/
  // ID 在 slug 末尾,紧跟查询参数(可能有 ?at=...)
  const links = Array.from(el.querySelectorAll('a[href*="/product/"]')) as HTMLAnchorElement[]
  if (links.length === 0) return null

  let href = ''
  let sourceId = ''
  for (const l of links) {
    const rawHref = l.getAttribute('href') || ''
    const cleanHref = rawHref.split('?')[0]
    // ID 是末尾连续数字(≥6位),例如 ...-1425179442/
    const idMatch = cleanHref.match(/([\d]{6,})\/?$/)
    if (idMatch) {
      href = rawHref
      sourceId = idMatch[1]
      break
    }
  }
  if (!sourceId) return null

  // 标题 — Ozon 实际用 tsBody500Medium 类名
  const titleEl =
    el.querySelector('span.tsBody500Medium') ||
    el.querySelector('span[class*="tsBody500"]') ||
    el.querySelector('span[class*="tsBody"]') ||
    el.querySelector('a[href*="/product/"] span') ||
    el.querySelector('[class*="title"]')
  const title = titleEl?.textContent?.trim() || ''

  // 价格 — Ozon 用 tsHeadline500Medium 做当前价,带 line-through 的是原价
  const priceEls = el.querySelectorAll('span')
  let price = 0
  let oldPrice = 0
  for (const sp of Array.from(priceEls)) {
    const text = sp.textContent || ''
    if (!text.includes('\u20BD') && !/\d/.test(text)) continue
    const val = parsePrice(text)
    if (val === 0) continue
    const isStrike = window.getComputedStyle(sp).textDecorationLine.includes('line-through')
    if (isStrike) {
      oldPrice = val
    } else if (val > price) {
      price = val
    }
  }

  // 图片
  const img = el.querySelector('img') as HTMLImageElement | null
  const imageUrl = img?.src?.replace(/\/wc\d+\//, '/wc500/') || ''

  // 评分
  let rating = 0
  const ratingEl = el.querySelector('[class*="rating"], [class*="star"]')
  if (ratingEl) {
    const m = ratingEl.textContent?.match(/([\d.]+)/)
    if (m) rating = parseFloat(m[1])
  }

  // 评论数
  let reviewCount = 0
  const reviewEl = el.querySelector('[class*="review"], [class*="comment"]')
  if (reviewEl) {
    const m = reviewEl.textContent?.match(/(\d+)/)
    if (m) reviewCount = parseInt(m[1])
  }

  // ★ 品牌 — Ozon 卡片上通常有品牌标签
  let brand = ''
  const brandLink = el.querySelector('a[href*="/brand/"]')
  if (brandLink) {
    brand = brandLink.textContent?.trim() || ''
  }
  if (!brand) {
    // 品牌有时是 tsBody300Medium 样式的 span
    const brandSpan = el.querySelector('[class*="brand"], [class*="Brand"]')
    if (brandSpan) brand = brandSpan.textContent?.trim() || ''
  }

  // ★ 卖家
  let sellerName = ''
  const sellerEl = el.querySelector('[class*="seller"], [class*="Seller"], [class*="merchant"]')
  if (sellerEl) sellerName = sellerEl.textContent?.trim() || ''

  const fullUrl = new URL(href, location.origin).href

  return { sourceId, title, price, oldPrice, imageUrl, rating, reviewCount, brand, sellerName, sourceUrl: fullUrl }
}

/** 扫描页面上所有可见的商品卡片 */
function scanListCards(): ListCard[] {
  const seen = new Set<string>()
  const cards: ListCard[] = []

  // Ozon 列表页商品卡片的常见容器
  const selectors = [
    '[class*="tile-root"]',                           // Ozon 实际卡片类(从DOM验证)
    '[data-widget="tileGridDesktop"] > div',          // 标准网格
    '[data-widget="searchResults"] > div',            // 搜索结果
    '[class*="widget-search-result"] > div',          // 搜索结果备选
    '[data-widget*="tile"] > div',                    // 任意 tile widget
    '[class*="tile-hover"]',                          // tile-hover 卡片类
    'a[href*="/product/"]',                           // 所有商品链接的父级
  ]

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel)
    if (els.length === 0) continue


    els.forEach((el) => {
      // 如果元素本身不是卡片容器,向上找一层
      const cardEl = (el.querySelector('a[href*="/product/"]') ? el : el.parentElement) as HTMLElement | null
      if (!cardEl) return
      const card = parseCard(cardEl)
      if (card && !seen.has(card.sourceId)) {
        seen.add(card.sourceId)
        cards.push(card)
      }
    })
    if (cards.length > 0) break
  }

  // 最终兜底:扫描页面上所有包含 product 链接的最近卡片容器
  if (cards.length === 0) {
    const allLinks = document.querySelectorAll('a[href*="/product/"]')
    allLinks.forEach((a) => {
      // 向上遍历找到最近的合理卡片容器(有子图片或子链接的 div)
      let container: HTMLElement | null = a.parentElement
      for (let i = 0; i < 5 && container; i++) {
        if (container.querySelector('img') || container.querySelectorAll('a[href*="/product/"]').length <= 3) break
        container = container.parentElement
      }
      if (!container) return
      const card = parseCard(container)
      if (card && !seen.has(card.sourceId)) {
        seen.add(card.sourceId)
        cards.push(card)
      }
    })
  }

  return cards
}

/**
 * 查找并点击"下一页"按钮
 * Ozon 分页有多种形态:
 *   1. [data-widget="paginator"] 内的 <a> / <button>
 *   2. 带有 rel="next" 的链接
 *   3. 文本为 "Далее" 或 ">" 的按钮
 *   4. URL 含 page=N 的链接中当前页+1 的那个
 *
 * ★ 拟人化:使用 humanLinkClick 替代原生 .click()
 */
async function findAndClickNextPage(): Promise<boolean> {
  // 策略 1: data-widget="paginator" 内的下一页链接
  const paginator = document.querySelector('[data-widget="paginator"]')
  if (paginator) {
    // 查找 rel="next" 或文本含 "Далее" / ">" 的按钮
    const nextBtn =
      (paginator.querySelector('a[rel="next"]') as HTMLElement) ||
      Array.from(paginator.querySelectorAll('a, button')).find((el) => {
        const text = el.textContent?.trim() || ''
        return text === 'Далее' || text === '>' || text === '»'
      }) as HTMLElement
    if (nextBtn) {
      // ★ 拟人化:先 hover,再延时点击
      await humanLinkClick(nextBtn)
      return true
    }
  }

  // 策略 2: 全局查找 rel="next"
  const relNext = document.querySelector('a[rel="next"]') as HTMLElement | null
  if (relNext) {
    await humanLinkClick(relNext)
    return true
  }

  // 策略 3: 查找所有分页链接,找到当前页码的下一个
  const currentUrl = new URL(location.href)
  const currentPageMatch = currentUrl.search.match(/[?&]page=(\d+)/)
  const currentPage = currentPageMatch ? parseInt(currentPageMatch[1]) : 1
  const nextPage = currentPage + 1

  // 查找 href 中包含 page=nextPage 的链接
  const allLinks = document.querySelectorAll('a[href*="page="]') as NodeListOf<HTMLAnchorElement>
  for (const link of allLinks) {
    const href = link.getAttribute('href') || ''
    if (new RegExp(`[?&]page=${nextPage}(?:&|$)`).test(href)) {
      await humanLinkClick(link)
      return true
    }
  }

  // 策略 4: 查找 Ozon 常见的分页组件中 "下一个" 的按钮
  const allButtons = document.querySelectorAll('button, a')
  for (const btn of allButtons) {
    const text = btn.textContent?.trim() || ''
    const ariaLabel = btn.getAttribute('aria-label') || ''
    if (
      text === 'Далее' || text === '>' || text === '»' ||
      ariaLabel.toLowerCase().includes('next') ||
      ariaLabel.toLowerCase().includes('далее')
    ) {
      // 确认它是分页按钮(附近有数字按钮)
      const parent = btn.closest('[class*="paginator"], [class*="pagination"], nav')
      if (parent) {
        await humanLinkClick(btn as HTMLElement)
        return true
      }
    }
  }

  return false
}

/** 等待页面内容更新(检测商品卡片变化) */
function waitForPageUpdate(oldFirstId: string, timeout = 9000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const cards = scanListCards()
      if (cards.length > 0 && cards[0]?.sourceId !== oldFirstId) {
        resolve(true)
        return
      }
      if (Date.now() - start > timeout) {
        resolve(false)
        return
      }
      setTimeout(check, 500)
    }
    setTimeout(check, 1000)
  })
}

/** 滚动并采集:反复滚动到底部,等待新内容加载,直到无新商品或达到上限 */
async function scrollAndCollect(
  maxItems: number,
  scrollDelay: number,
  onProgress: (count: number) => void,
  shouldStop?: () => boolean,
): Promise<ListCard[]> {
  // Ozon 用虚拟滚动:卡片滚出视口就从 DOM 移除
  // 所以必须用持久 Map 跨 tick 记录已采集的卡片
  const allCards = new Map<string, ListCard>()
  let maxPages = 10 // 安全上限,防止无限翻页

  // ★ 拟人化:开始采集前等待一小会儿,模拟用户打开页面后浏览
  await readingPause()

  while (allCards.size < maxItems && maxPages > 0) {
    // 检查停止信号
    if (shouldStop && shouldStop()) {
      break
    }

    // ★ 拟人化:偶尔暂停更久
    await occasionalLongPause()

    // ── 当前页:滚动并采集 ──
    let stableRounds = 0
    const MAX_STABLE = 3

    const tick = (): Promise<void> => {
      return new Promise((resolveTick) => {
        // 检查停止信号
        if (shouldStop && shouldStop()) {
          resolveTick()
          return
        }
        const freshCards = scanListCards()
        for (const c of freshCards) {
          allCards.set(c.sourceId, c)
        }
        const totalCount = allCards.size
        onProgress(totalCount)

        if (totalCount >= maxItems) {
          resolveTick()
          return
        }

        if (freshCards.length === 0) {
          stableRounds++
          if (stableRounds >= MAX_STABLE) {
            resolveTick()
            return
          }
        } else {
          stableRounds = 0
        }

        // ★ 拟人化:用 humanScroll 替代固定距离滚动,滚动距离也有波动
        const scrollAmount = window.innerHeight * (0.85 + Math.random() * 0.3)
        humanScroll(scrollAmount).then(() => {
          // ★ 拟人化:滚动后用可变延时替代固定延时
          scrollPause(scrollDelay).then(() => tick().then(resolveTick))
        })
      })
    }

    await tick()

    if (allCards.size >= maxItems) break

    // ── 当前页已滚动完毕,尝试翻到下一页 ──
    // ★ 拟人化:模拟用户浏览完当前页后慢慢滚到底部
    await humanScrollToBottom()
    await normalDelay(500, 1200)

    // 记录当前第一个卡片的 ID,用于判断页面是否已更新
    const currentCards = scanListCards()
    const oldFirstId = currentCards.length > 0 ? currentCards[0].sourceId : ''

    const clicked = await findAndClickNextPage()
    if (!clicked) {
      break
    }

    maxPages--

    // 等待页面内容更新
    const updated = await waitForPageUpdate(oldFirstId)
    if (!updated) {
      break
    }

    // ★ 拟人化:新页面加载后,先停顿再模拟用户回到顶部
    await readingPause()
    await humanScrollToTop()
    await normalDelay(800, 2000)
  }

  return Array.from(allCards.values()).slice(0, maxItems)
}

// ═══════════════════════════════════════════════════════════════
//  后台补全:通过 Ozon 内部 JSON API 获取商品详情
//  不打开页面、不导航,纯粹后台 fetch 请求
// ═══════════════════════════════════════════════════════════════

const OZON_INTERNAL_API = 'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2'

/**
 * HTML 降级采集:通过 fetch 商品页面 HTML,解析 DOM 提取数据
 * 当内部 JSON API 返回 403 时使用
 */
async function fetchProductDetailFromHtml(sourceId: string, sourceUrl?: string): Promise<CollectorProduct | null> {
  // 使用真实的产品页面 URL,构造错误的 URL (如 /product/-12345/) 会 404
  const productUrl = sourceUrl || `https://www.ozon.ru/product/${sourceId}/`
  try {
    await randomDelay(300, 800)
    const resp = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })
    if (!resp.ok) {
      return null
    }
    const html = await resp.text()

    const result: CollectorProduct = {
      platform: 'ozon',
      sourceId,
      currency: 'RUB',
      images: [],
      facts: [],
    }

    // ── 策略 A: 解析 <script type="application/ld+json"> (SEO 结构化数据) ──
    const ldJsonMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
    if (ldJsonMatch) {
      for (const block of ldJsonMatch) {
        const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
        try {
          const ld = JSON.parse(jsonStr)
          if (ld['@type'] === 'Product' || ld.name) {
            result.title = result.title || ld.name || ''
            result.description = result.description || ld.description || ''
            if (ld.brand?.name) result.brand = ld.brand.name
            else if (typeof ld.brand === 'string') result.brand = ld.brand
            if (ld.image) {
              const imgs = Array.isArray(ld.image) ? ld.image : [ld.image]
              result.images = imgs.filter((u: string) => u && u.startsWith('http'))
            }
            if (ld.sku) result.sourceId = String(ld.sku)
            if (ld.category) result.category = ld.category
            // 价格
            const offers = ld.offers || ld.Offers
            if (offers) {
              const o = Array.isArray(offers) ? offers[0] : offers
              if (o.price) result.price = parseFloat(o.price) || result.price
              if (o.priceCurrency) result.price = result.price // already in roubles on Ozon
            }
            // 评分
            if (ld.aggregateRating) {
              result.rating = parseFloat(ld.aggregateRating.ratingValue) || result.rating
              result.reviewCount = parseInt(ld.aggregateRating.reviewCount) || result.reviewCount
            }
          }
        } catch { /* not valid JSON, skip */ }
      }
    }

    // ── 策略 B: 解析 HTML DOM (DOMParser) ──
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // brand
    if (!result.brand) {
      const brandEl = doc.querySelector('[data-widget="webBrandName"] a, [data-widget="webBrandName"] span, a[href*="/brand/"]')
      result.brand = brandEl?.textContent?.trim() || ''
    }
    // title
    if (!result.title) {
      const titleEl = doc.querySelector('h1, [data-widget="webProductHeading"] span')
      result.title = titleEl?.textContent?.trim() || ''
    }
    // 分类面包屑
    if (!result.category) {
      const crumbs = doc.querySelectorAll('[data-widget="webBreadcrumb"] a, [data-widget="breadCrumbs"] a, [data-widget="webBreadcrumbs"] a, [data-widget*="Breadcrumb"] a, [data-widget*="breadCrumb"] a, [data-widget*="breadcrumb"] a')
      if (crumbs.length > 0) {
        result.category = extractCategoryFromBreadcrumbItems(Array.from(crumbs).map(a => a.textContent?.trim() || ''))
      }
    }
    // 描述
    if (!result.description) {
      const descEl = doc.querySelector('[data-widget="webDescription"]')
      result.description = descEl?.textContent?.trim() || ''
    }
    // 特征
    if (!result.facts!.length) {
      const attrsContainers = doc.querySelectorAll('[data-widget*="Characteristics"], [data-widget*="characteristics"], [data-widget*="Properties"], [data-widget*="Specifications"]')
      for (const attrsContainer of Array.from(attrsContainers)) {
        const rows = attrsContainer.querySelectorAll('tr, li, [class*="row"], dl > div')
        for (const row of Array.from(rows)) {
          const cells = row.querySelectorAll('td, span, dt, dd')
          if (cells.length >= 2) {
            const name = cells[0]?.textContent?.trim()
            const value = Array.from(cells).slice(1).map((cell) => cell.textContent?.trim() || '').filter(Boolean).join(', ')
            addCollectedFact(result.facts!, name, value)
          }
        }
      }
    }
    // 卖家
    if (!result.sellerName) {
      const sellerEl = doc.querySelector('[data-widget="webMerchantInfo"] a, [data-widget="webBestSeller"] button span')
      result.sellerName = sellerEl?.textContent?.trim() || ''
    }
    // 图片 (从 meta og:image)
    if (!result.images!.length) {
      const ogImg = doc.querySelector('meta[property="og:image"]')
      if (ogImg) {
        const src = ogImg.getAttribute('content') || ''
        if (src) result.images = [src]
      }
    }

    result.facts = mergeCollectedFacts(result.facts)
    result.specList = extractPhysicalSpecFromFacts(result.facts || [])
    const htmlLogistics = extractLogisticsFromDocument(doc)
    result.warehouse = result.warehouse || htmlLogistics.warehouse || ''
    result.warehouseId = result.warehouseId || htmlLogistics.warehouseId || ''
    result.logisticsType = result.logisticsType || htmlLogistics.logisticsType || ''
    result.deliveryMethod = result.deliveryMethod || htmlLogistics.deliveryMethod || ''
    result.deliveryRegion = result.deliveryRegion || htmlLogistics.deliveryRegion || ''
    result.deliveryDays = result.deliveryDays || htmlLogistics.deliveryDays || 0

    // 至少有标题或品牌才算成功
    return (result.title || result.brand) ? appendOzonMetrics(result) : null
  } catch (e) {
    return null
  }
}

/**
 * 通过 Ozon 内部 JSON API 获取单个商品的完整详情
 * sourceId 如 "1425179442"
 * 返回的 JSON 结构中有 "widgetStates" 包含所有 widget 数据
 */
async function fetchProductDetailFromApi(sourceId: string, sourceUrl?: string): Promise<CollectorProduct | null> {
  // 内容脚本直接 fetch（同源请求，携带 cookie）
  const candidatePaths: string[] = []
  try {
    const u = new URL(sourceUrl || location.href, location.origin)
    // Ozon 内部 API 对真实 slug path 更友好，例如 /product/name-1425179442/
    // 仅保留 pathname，避免列表页跟踪参数影响返回的 widgetStates。
    if (u.pathname.includes('/product/')) {
      candidatePaths.push(u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`)
    }
  } catch { /* ignore invalid sourceUrl */ }
  candidatePaths.push(`/product/${sourceId}/`)

  for (const productPath of Array.from(new Set(candidatePaths))) {
    try {
      await randomDelay(200, 600)
      const apiUrl = `${OZON_INTERNAL_API}?url=${encodeURIComponent(productPath)}`
      const resp = await fetch(apiUrl, {
        headers: {
          'accept': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        credentials: 'include',
      })
      if (resp.ok) {
        const data = await resp.json()
        const result = parseInternalApiResponse(data, sourceId)
        if (result) return result
      } else {
      }
    } catch (e) {
    }
  }

  // HTML 页面降级 (用真实 URL)
  return await fetchProductDetailFromHtml(sourceId, sourceUrl)
}

/**
 * 解析 Ozon 内部 API 的 JSON 响应,提取结构化商品数据
 */
function parseInternalApiResponse(data: any, sourceId: string): CollectorProduct | null {
  const result: CollectorProduct = {
    platform: 'ozon',
    sourceId,
    currency: 'RUB',
    images: [],
    videoUrls: [],
    skuList: [],
    variants: [],
    specList: [],
    facts: [],
  }

  const states = data?.widgetStates || data || {}
  const allKeys = Object.keys(states)
  const decodedWidgets = decodedOzonStateEntries(states)
  result.variants = extractOzonVariants(decodedWidgets.map(([, widget]) => widget))

  // ── Step 1: 按 widget key 匹配提取 ──
  // 数据结构参考: 后端 ozon_product_scraper.py 中的解析逻辑
  for (const [key, val] of Object.entries(states)) {
    if (typeof val !== 'string') continue
    let widget: any
    try { widget = JSON.parse(val as string) } catch { continue }

    extractOzonIdsFromObject(widget, result)
    extractLogisticsFromObject(widget, result)
    const normalizedWidgetKey = key.toLowerCase()
    // 类目只从明确 breadcrumb widget 解析；不从任意 Category/category key 猜测，避免误采内部推荐分类。
    if (normalizedWidgetKey.includes('haract') || normalizedWidgetKey.includes('roper') || normalizedWidgetKey.includes('pecif') || normalizedWidgetKey.includes('webfull')) {
      extractFactPairsFromObject(widget, result.facts!)
    }

    // --- 标题: webProductHeading ---
    if (!result.title && key.includes('webProductHeading')) {
      const t = widget.title || widget.options?.title || widget.text || ''
      if (typeof t === 'string' && t.length > 3) {
        result.title = t
      }
    }

    // --- 价格: webPrice (排除 Decreased) ---
    if (!result.price && key.includes('webPrice') && !key.includes('Decreased')) {
      // Ozon webPrice widget: 可能有嵌套结构
      const priceRaw = widget.price || widget.options?.price || widget.actionPrice || widget.options?.actionPrice || ''
      const oldPriceRaw = widget.oldPrice || widget.options?.oldPrice || widget.basePrice || widget.options?.basePrice || ''
      const p = parsePrice(String(priceRaw))
      const op = parsePrice(String(oldPriceRaw))
      if (p > 0) result.price = p
      if (op > 0) result.oldPrice = op
    }

    // --- 评分和评论数: webReviewProductScore ---
    // Ozon 实际结构: { "totalScore": 4.9, "reviewsCount": 61800, "score": null }
    if (!result.rating && key.includes('webReviewProductScore')) {
      const totalScore = widget.totalScore ?? widget.options?.totalScore ?? widget.score ?? null
      const reviewsCount = widget.reviewsCount ?? widget.options?.reviewsCount ?? widget.reviewCount ?? null
      const r = parseFloat(String(totalScore).replace(',', '.'))
      if (r > 0 && r <= 5) result.rating = r  // Ozon rating 1-5
      const c = parseInt(String(reviewsCount).replace(/\D/g, ''))
      if (c > 0) result.reviewCount = c
    }

    // --- 品牌: webBrand (不是 webBrandName!) ---
    // Ozon 实际 key 是 "webBrand-xxx", 结构: { content: { title: { text: [{ type: "link", content: "BrandName" }] } } }
    if (!result.brand && key.includes('webBrand') && !key.includes('webBrandGrid')) {
      // 路径 1: content.title.text[].content
      const textArr = widget.content?.title?.text || widget.options?.content?.title?.text || []
      if (Array.isArray(textArr)) {
        for (const t of textArr) {
          if (t?.type === 'link' && t?.content && typeof t.content === 'string' && t.content.length > 1) {
            result.brand = t.content.trim()
            break
          }
        }
      }
      // 路径 2: 简单字段
      if (!result.brand) {
        const b = widget.text || widget.options?.text || widget.name || widget.options?.name || ''
        if (typeof b === 'string' && b.length > 1) result.brand = b.trim()
      }
    }

    // --- 分类面包屑: webBreadcrumb ---
    if (!result.category && isCategoryWidgetKey(key)) {
      const category = extractCategoryFromWidget(widget)
      if (category) result.category = category
    }

    // --- 描述: webDescription ---
    if (!result.description && key.includes('webDescription')) {
      const d = widget.text || widget.options?.text || widget.content || widget.options?.content || widget.description || ''
      if (typeof d === 'string' && d.length > 10) result.description = d.slice(0, 2000)
    }

    // --- 特征/特征: webShortCharacteristics / webCharacteristics / webFullCharacteristics ---
    // Ozon has multiple characteristics widgets with DIFFERENT data structures:
    //   webShortCharacteristics — 3-5 "highlight" attrs at top of page
    //     Structure A: { characteristics: [{ title: { textRs: [...] }, values: [{ text: "..." }] }] }
    //   webCharacteristics — FULL product specs (20-30+ attrs)
    //     Structure B: { sections: [{ title: "...", properties: [{ name, value, propertyName, propertyValues }] }] }
    //     Structure C: { characteristics: [{ groupName, properties: [{ propertyName, propertyValues }] }] }
    //     Structure D: { groups: [{ title, properties: [{ title, value }] }] }
    //   webFullCharacteristics — sometimes used for detailed specs
    //   webProductProperties / webSpecifications — alternative widget names
    if (key.includes('haract') || key.includes('roper') || key.includes('pecif') || key.includes('webFull')) {
      // ── Extract from Structure A: characteristics[].title.textRs + values[].text ──
      const chars = widget.characteristics || widget.options?.characteristics || []
      if (Array.isArray(chars)) {
        for (const ch of chars) {
          if (!ch) continue

          // ── Path 1: title.textRs[].content → values[].text (webShortCharacteristics format) ──
          let name = ''
          const textRs = ch.title?.textRs || ch.title?.text || []
          if (Array.isArray(textRs)) {
            for (const tr of textRs) {
              if (tr?.type === 'text' && tr?.content) { name = tr.content; break }
              if (tr?.type === 'link' && tr?.content) { name = tr.content; break }
            }
          }
          // Path 2: title is a string directly
          if (!name && typeof ch.title === 'string') name = ch.title
          // Path 3: name/label/propertyName fields
          if (!name) name = ch.name || ch.label || ch.property || ch.propertyName || ''

          // ── Extract value ──
          let value = ''
          // values[].text (webShortCharacteristics format)
          const values = ch.values || []
          if (Array.isArray(values)) {
            for (const v of values) {
              if (v?.text) { value = v.text; break }
              if (v?.content) { value = v.content; break }
            }
          }
          // propertyValues[].value (webCharacteristics format)
          if (!value && Array.isArray(ch.propertyValues)) {
            for (const pv of ch.propertyValues) {
              if (pv?.value) { value = pv.value; break }
            }
          }
          // Direct value/text fields
          if (!value) value = ch.value || ch.text || ''

          if (name && String(name).length > 1) {
            addCollectedFact(result.facts!, name, value)
            if (!result.brand && /^бренд$/i.test(String(name).trim())) {
              result.brand = String(value).trim()
            }
          }

          // ── Nested properties inside a characteristic group ──
          if (ch.properties && Array.isArray(ch.properties)) {
            for (const prop of ch.properties) {
              if (!prop) continue
              let pName = prop.name || prop.propertyName || prop.title || ''
              if (!pName && typeof prop.title === 'string') pName = prop.title
              // Try textRs for name
              if (!pName && Array.isArray(prop.title?.textRs)) {
                for (const tr of prop.title.textRs) {
                  if (tr?.type === 'text' && tr?.content) { pName = tr.content; break }
                }
              }
              let pValue = prop.value || prop.text || ''
              if (!pValue && Array.isArray(prop.propertyValues)) {
                for (const pv of prop.propertyValues) { if (pv?.value) { pValue = pv.value; break } }
              }
              if (!pValue && Array.isArray(prop.values)) {
                for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
              }
              if (pName && String(pName).length > 1) {
                addCollectedFact(result.facts!, pName, pValue)
                if (!result.brand && /^бренд$/i.test(String(pName).trim())) {
                  result.brand = String(pValue).trim()
                }
              }
            }
          }
        }
      }

      // ── Extract from Structure B: sections[].properties[] ──
      const sections = widget.sections || widget.options?.sections || []
      if (Array.isArray(sections)) {
        for (const sec of sections) {
          if (!sec) continue
          const props = sec.properties || sec.items || sec.rows || []
          if (!Array.isArray(props)) continue
          for (const prop of props) {
            if (!prop) continue
            let pName = prop.name || prop.propertyName || prop.label || prop.title || ''
            if (!pName && Array.isArray(prop.title?.textRs)) {
              for (const tr of prop.title.textRs) { if (tr?.content) { pName = tr.content; break } }
            }
            let pValue = prop.value || prop.text || ''
            if (!pValue && Array.isArray(prop.propertyValues)) {
              for (const pv of prop.propertyValues) { if (pv?.value) { pValue = pv.value; break } }
            }
            if (!pValue && Array.isArray(prop.values)) {
              for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
            }
            if (pName && String(pName).length > 1) {
              addCollectedFact(result.facts!, pName, pValue)
              if (!result.brand && /^бренд$/i.test(String(pName).trim())) {
                result.brand = String(pValue).trim()
              }
            }
          }
        }
      }

      // ── Extract from Structure D: groups[].properties[] ──
      const groups = widget.groups || widget.options?.groups || []
      if (Array.isArray(groups)) {
        for (const grp of groups) {
          if (!grp) continue
          const props = grp.properties || grp.items || []
          if (!Array.isArray(props)) continue
          for (const prop of props) {
            if (!prop) continue
            let pName = prop.name || prop.title || prop.label || ''
            if (!pName && Array.isArray(prop.title?.textRs)) {
              for (const tr of prop.title.textRs) { if (tr?.content) { pName = tr.content; break } }
            }
            let pValue = prop.value || prop.text || ''
            if (!pValue && Array.isArray(prop.values)) {
              for (const v of prop.values) { if (v?.text) { pValue = v.text; break } }
            }
            if (pName && String(pName).length > 1) {
              addCollectedFact(result.facts!, pName, pValue)
            }
          }
        }
      }
    }

    // --- 卖家: webMerchantInfo / webBestSeller ---
    if (!result.sellerName && (key.includes('webMerchantInfo') || key.includes('webBestSeller'))) {
      const s = widget.merchantName || widget.options?.merchantName || widget.text || widget.name || ''
      if (typeof s === 'string' && s.length > 1) result.sellerName = s
    }

    // --- 图片: webGallery ---
    if (!result.images!.length && key.includes('webGallery')) {
      const raw = widget.options?.images || widget.images || widget.items || []
      if (Array.isArray(raw) && raw.length > 0) {
        result.images = raw.map((img: any) => {
          if (typeof img === 'string') return img.startsWith('//') ? 'https:' + img : img
          const url = img.big || img.medium || img.small || img.url || img.src || ''
          return url.startsWith('//') ? 'https:' + url : url
        }).filter(Boolean)
      }
    }
  }

  // ── Step 2: 通用递归扫描接口数据 ──
  // Ozon 经常调整 widget key 和嵌套结构。固定 key 解析只能采到标题/价格等基础字段，
  // 这里按语义路径补采促销、广告、销量、佣金、库存、媒体、SKU、包装规格和物流字段。
  for (const [key, widget] of decodedWidgets) {
    collectOzonValueSignals(widget, result, [key])
  }
  if (data && data !== states) collectOzonValueSignals(data, result, ['root'])

  // SKU 清单与完整变体采用同一结构化事实源，避免递归语义扫描采入 productId 等非 SKU 标识。
  if (result.variants.length > 0) {
    result.skuList = result.variants.map((variant) => ({ sku: variant.sku, barcode: variant.barcode || '' }))
  }

  // 不从标题或面包屑猜测品牌。品牌必须来自 webBrand/brand 链接/JSON-LD/特征中的「Бренд」。

  result.facts = mergeCollectedFacts(result.facts)

  // ── Step 4: 从特征中提取物理规格、标识符、折扣、库存 → JSON arrays ──
  const specAccum: ScrapedProduct['specList'][number] = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }
  if (result.facts && result.facts.length > 0) {
    for (const attr of result.facts) {
      if (!isTrustedPhysicalFact(attr)) continue

      const name = (attr.name || '').toLowerCase().trim()
      const val = attr.value || ''

      // 折扣
      if (!result.discount && (name === 'скидка' || name.includes('discount'))) {
        result.discount = val
      }

      // 库存
      if (!result.stock && (name.includes('остал') || name.includes('stock') || name === 'наличие')) {
        result.stock = val
      }

      // 重量 / 尺寸：统一走单位解析，支持 мм/см/м 和 г/кг；包装字段只写入 package_*。
      const isPackage = isPackagePhysicalField(`${name} ${val}`)
      if (!specAccum.weight_g && /(вес|масса|weight|重量)/.test(name)) {
        const weight = parseWeightToGrams(val, name)
        if (weight && isPackage && !specAccum.package_weight_g) specAccum.package_weight_g = weight
        if (weight && !isPackage && !specAccum.weight_g) specAccum.weight_g = weight
      }

      const dimMatch = val.match(/(\d[\d\s,.]*)\s*(?:x|х|×|\*)\s*(\d[\d\s,.]*)\s*(?:x|х|×|\*)\s*(\d[\d\s,.]*)\s*(мм|mm|см|cm|м|m)?/i)
      if (dimMatch && /(размер|габарит|dimension|size|длина|ширина|высота|尺寸)/.test(name)) {
        const unit = dimMatch[4] || (/(см|cm)/i.test(`${name} ${val}`) ? 'см' : /(м|m)/i.test(`${name} ${val}`) ? 'м' : 'мм')
        const toMm = (raw: string) => parseLengthToMm(`${raw} ${unit}`, name)
        if (isPackage) {
          if (!specAccum.package_depth_mm) specAccum.package_depth_mm = toMm(dimMatch[1])
          if (!specAccum.package_width_mm) specAccum.package_width_mm = toMm(dimMatch[2])
          if (!specAccum.package_height_mm) specAccum.package_height_mm = toMm(dimMatch[3])
        } else {
          if (!specAccum.depth_mm) specAccum.depth_mm = toMm(dimMatch[1])
          if (!specAccum.width_mm) specAccum.width_mm = toMm(dimMatch[2])
          if (!specAccum.height_mm) specAccum.height_mm = toMm(dimMatch[3])
        }
      }

      const length = /(глубин|длин|depth|length|длина|长)/.test(name) ? parseLengthToMm(val, name) : 0
      const height = /(высот|height|высота|高)/.test(name) ? parseLengthToMm(val, name) : 0
      const width = /(ширин|width|ширина|宽)/.test(name) ? parseLengthToMm(val, name) : 0
      if (isPackage) {
        if (!specAccum.package_depth_mm && length) specAccum.package_depth_mm = length
        if (!specAccum.package_height_mm && height) specAccum.package_height_mm = height
        if (!specAccum.package_width_mm && width) specAccum.package_width_mm = width
      } else {
        if (!specAccum.depth_mm && length) specAccum.depth_mm = length
        if (!specAccum.height_mm && height) specAccum.height_mm = height
        if (!specAccum.width_mm && width) specAccum.width_mm = width
      }
      if (!specAccum.color && /(цвет|color|颜色)/.test(name) && val.length <= 80) specAccum.color = val
      if (!specAccum.size && /(размер|size|尺码|规格)/.test(name) && val.length <= 120) specAccum.size = val

      // 条形码
      if (name.includes('штрихкод') || name.includes('barcode') || name === 'ean' || name === 'gtin') {
        const code = val.replace(/\D/g, '')
        if (code.length >= 8) {
          const exists = result.skuList!.some(s => s.barcode === code)
          if (!exists) result.skuList!.push({ sku: '', barcode: code })
        }
      }

      // 供应商 SKU
      if (name.includes('артикул продавца') || name.includes('артикул') || name.includes('supplier sku')) {
        if (val.length > 1 && val.length < 64) {
          const exists = result.skuList!.some(s => s.sku === val.trim())
          if (!exists) result.skuList!.push({ sku: val.trim(), barcode: '' })
        }
      }
    }
  }
  // Flush spec accumulator → specList
  if (specAccum.weight_g || specAccum.depth_mm || specAccum.height_mm || specAccum.width_mm || specAccum.package_weight_g || specAccum.package_depth_mm || specAccum.package_height_mm || specAccum.package_width_mm || specAccum.color || specAccum.size) {
    result.specList!.push(specAccum)
  }
  const inferredSpecList = extractPhysicalSpecFromFacts(result.facts || [])
  const mergedSpec = mergePhysicalSpec(result.specList?.[0], inferredSpecList[0])
  result.specList = mergedSpec ? [mergedSpec] : []

  // ── Step 5: 从 widget 中直接提取折扣 ──
  if (!result.discount) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string' || !key.includes('webPrice')) continue
      try {
        const w = JSON.parse(val as string)
        const disc = w.discount || w.options?.discount || w.badge || ''
        if (disc && typeof disc === 'string') {
          result.discount = disc
          break
        }
      } catch { }
    }
  }

  // ── Step 6: 从 widget 中提取库存 ──
  if (!result.stock) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string' || !key.includes('webStock')) continue
      try {
        const w = JSON.parse(val as string)
        const stockText = w.text || w.options?.text || w.value || w.stockText || ''
        if (stockText && typeof stockText === 'string') {
          result.stock = stockText
          break
        }
      } catch { }
    }
  }

  // ── Step 7: 从 widget 中提取视频 → videoUrls[] ──
  if (!result.videoUrls!.length) {
    for (const [key, val] of Object.entries(states)) {
      if (typeof val !== 'string') continue
      if (key.includes('webVideo') || key.includes('video')) {
        try {
          const w = JSON.parse(val as string)
          const url = w.url || w.videoUrl || w.options?.url || w.options?.videoUrl || ''
          if (url && typeof url === 'string' && url.startsWith('http')) {
            if (!result.videoUrls!.includes(url)) result.videoUrls!.push(url)
          }
        } catch { }
      }
    }
  }


  return result.images!.length > 0 || result.title || result.facts!.length > 0 ? appendOzonMetrics(result) : null
}

/**
 * 批量补全商品详情
 * 从后端获取需要补全的商品列表,逐个调用内部 API 获取详情
 * 每个请求间隔 2~5 秒随机延时,避免触发风控
 */
async function enrichProductsFromApi(
  products: Array<{ id: number; sourceId: string; sourceUrl: string }>,
  onProgress: (done: number, total: number, current: string) => void,
): Promise<Array<{ id: number; data: CollectorProduct }>> {
  const results: Array<{ id: number; data: CollectorProduct }> = []
  const DELAY_MIN = 2000  // 最短延时 2 秒
  const DELAY_MAX = 5000  // 最长延时 5 秒

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    onProgress(i + 1, products.length, p.sourceId)

    const detail = await fetchProductDetailFromApi(p.sourceId, p.sourceUrl)
    if (detail) {
      results.push({ id: p.id, data: detail })
    }

    // ★ 拟人化:使用渐进加速延时 + 偶尔长停顿
    if (i < products.length - 1) {
      await enrichDelay(i, products.length, DELAY_MIN, DELAY_MAX)
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════
//  Content Script 入口
// ═══════════════════════════════════════════════════════════════

export default defineContentScript({
  matches: ['*://*.ozon.ru/*'],
  async main() {
    // 启动完整 Ozon 工具（卡片、利润计算、真实价、MP 图表、字段偏好等）。
    // 不在模块顶层静态导入，避免与采集 content script 的启动时序互相阻塞。
    if (!document.getElementById('mjgd-extension-app')) {
      try {
        await import('@/features/ozon-tools/content')
      } catch (error) {
        console.error('[Ozon Local] 本地工具界面初始化失败:', error)
      }
    }

    // SPA 导航时动态更新 pageType (Ozon 是 SPA,URL 变化不触发 content script 重载)
    let pageType = detectPageType()

    // ── 注入悬浮采集按钮 (商品详情页) ──
    if (pageType === 'product') {
      injectFloatingButton(async () => {
        const product = await scrapeOzonProduct()
        if (!product) throw new Error('采集失败: 无法提取商品信息')
        const result = await browser.runtime.sendMessage({ action: 'productScraped', data: product })
        if (!result?.success) throw new Error(result?.error || '上报失败')
      })
    }
    let scrapeStopFlag = false

    // 监听 URL 变化 (popstate + pushState)
    const onNavigate = () => {
      const newType = detectPageType()
      if (newType !== pageType) {
        pageType = newType
      }
    }
    window.addEventListener('popstate', onNavigate)
    const origPushState = history.pushState.bind(history)
    history.pushState = (...args) => { origPushState(...args); setTimeout(onNavigate, 500) }
    const origReplaceState = history.replaceState.bind(history)
    history.replaceState = (...args) => { origReplaceState(...args); setTimeout(onNavigate, 500) }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // 后台补全:通过 Ozon 内部 JSON API 获取商品详情 (不需要打开页面)
      if (message.action === 'enrichProducts') {
        const products = message.products || []
        enrichProductsFromApi(products, (done, total, current) => {
          browser.runtime.sendMessage({ action: 'enrichProgress', done, total, current }).catch(() => { })
        }).then((results) => {
          sendResponse({ success: true, results })
        }).catch((e) => {
          sendResponse({ success: false, error: String(e) })
        })
        return true // 异步 sendResponse
      }

      // 检查页面类型
      if (message.action === 'checkPage') {
        sendResponse({
          pageType,
          platform: 'ozon',
          isProductPage: pageType === 'product',
          isListPage: pageType === 'list',
        })
        return true
      }

      // 采集单个商品详情
      if (message.action === 'scrape') {
        scrapeOzonProduct().then((product) => {
          sendResponse({
            success: !!product,
            data: product,
            error: product ? '' : '未找到 Ozon 商品 ID 或商品详情数据',
          })
        }).catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        })
        return true // 异步响应
      }

      // 列表页滚动采集
      if (message.action === 'scrapeList') {
        const maxItems = message.maxItems || 50
        const scrollDelay = message.scrollDelay || 1500
        const batchSize = message.batchSize || 10
        scrapeStopFlag = false


        // 先扫描一次看当前有多少
        const initialCards = scanListCards()

        if (initialCards.length === 0 && pageType !== 'list') {
          sendResponse({ success: false, error: '当前页面不是列表页' })
          return true
        }

        // 滚动采集
        scrollAndCollect(maxItems, scrollDelay, (count) => {
          browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: count, enriched: 0, synced: 0, total: count, phase: 'scroll' } })
        }, () => scrapeStopFlag).then(async (cards) => {
          let products: ScrapedProduct[] = cards.map((c) => appendOzonMetrics({
            platform: 'ozon' as const,
            sourceId: c.sourceId,
            title: c.title,
            currency: 'RUB',
            price: c.price,
            oldPrice: c.oldPrice,
            images: c.imageUrl ? [c.imageUrl] : [],
            rating: c.rating,
            reviewCount: c.reviewCount,
            brand: c.brand || '',
            category: '',
            sellerName: c.sellerName || '',
            sellerUrl: '',
                  description: '',
            sourceUrl: c.sourceUrl,
            scrapedAt: new Date().toISOString(),
            videoUrls: [],
            skuList: [],
            variants: [],
            specList: [],
            tags: [],
            ozonCategoryId: 0,
            ozonTypeId: 0,
            discount: '',
            stock: '',
            priceRanges: [],
            minOrderQty: 0,
            supplierUrl: '',
            tradeQuantity: 0,
          }) as ScrapedProduct)

          // ★ 拟人化:滚动采集结束后,模拟用户停顿再开始逐个查看详情
          await transitionPause()

          const total = products.length
          let enriched = 0
          let synced = 0

          // 增量批量: 每 batchSize 个商品,补全详情后立即上报后端
          for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
            if (scrapeStopFlag) {
              break
            }

            // ★ 拟人化:批次之间加入自然停顿
            if (batchStart > 0) {
              await batchTransitionPause()
            }

            const batchEnd = Math.min(batchStart + batchSize, total)
            const batch = products.slice(batchStart, batchEnd)

            // Phase: enrich batch
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'enrich' } })

            for (let i = 0; i < batch.length; i++) {
              if (scrapeStopFlag) break
              const p = batch[i]
              const detail = await fetchProductDetailFromApi(p.sourceId, p.sourceUrl)
              if (detail) {
                batch[i] = {
                  ...p,
                  title: detail.title || p.title,
                  brand: detail.brand || p.brand,
                  category: detail.category || p.category,
                  sellerName: detail.sellerName || p.sellerName,
                  description: detail.description || p.description,
                  images: (detail.images && detail.images.length > 0) ? detail.images : p.images,
                  specList: (() => {
                    const facts = mergeCollectedFacts(detail.facts, (p as CollectorProduct).facts)
                    const inferred = extractPhysicalSpecFromFacts(facts)
                    const spec = mergePhysicalSpec(detail.specList?.[0], inferred[0])
                    return spec ? [spec] : []
                  })(),
                  skuList: detail.skuList || p.skuList,
                  variants: detail.variants || p.variants,
                  videoUrls: detail.videoUrls || p.videoUrls,
                  tags: detail.tags || p.tags,
                  ozonCategoryId: detail.ozonCategoryId || p.ozonCategoryId,
                  ozonTypeId: detail.ozonTypeId || p.ozonTypeId,
                  discount: detail.discount || p.discount,
                  stock: detail.stock || p.stock,
                  price: detail.price || p.price,
                  oldPrice: detail.oldPrice || p.oldPrice,
                  rating: detail.rating || p.rating,
                  reviewCount: detail.reviewCount || p.reviewCount,
                  warehouse: detail.warehouse || p.warehouse,
                  warehouseId: detail.warehouseId || p.warehouseId,
                  logisticsType: detail.logisticsType || p.logisticsType,
                  deliveryMethod: detail.deliveryMethod || p.deliveryMethod,
                  deliveryRegion: detail.deliveryRegion || p.deliveryRegion,
                  deliveryDays: detail.deliveryDays || p.deliveryDays,
                }
                batch[i].ozonMetrics = buildOzonMetrics(batch[i])
                products[batchStart + i] = batch[i]
                enriched++
              }
              // ★ 拟人化:使用渐进加速延时 + 偶尔长停顿
              if (i < batch.length - 1) {
                await enrichDelay(i, batch.length)
              }
            }

            // Phase: sync batch to backend
            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'sync' } })

            try {
              const syncResult = await browser.runtime.sendMessage({ action: 'batchSyncProducts', products: batch })
              if (syncResult?.success) {
                synced += batch.length
              }
            } catch (e) {
            }

            browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'sync' } })
          }

          // Final progress
          browser.runtime.sendMessage({ action: 'scrapingProgress', progress: { scraped: total, enriched, synced, total, phase: 'done' } })
          sendResponse({ success: true, count: products.length, products })
        })
        return true // 异步响应
      }

      // 停止采集
      if (message.action === 'stopScraping') {
        scrapeStopFlag = true
        sendResponse({ success: true })
        return true
      }
    })
  },
})

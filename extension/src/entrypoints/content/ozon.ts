import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

// ── Verified Ozon DOM selectors (2026-07-01 live page inspection) ──
//
// data-widget values found on real PDP:
//   webProductHeading  — h1.pdp_i3b  (title)
//   webGallery         — img.pdp_x5  (images), video source (videos)
//   webPrice           — span.tsHeadline600Large  (current price)
//   webSale            — old price "1 500 ₽", bank prices
//   webSingleProductScore  — rating number
//   webReviewProductScore  — review count
//   webQuestionCount       — question count
//   webBestSeller      — seller name, link, order count
//   breadCrumbs        — <a> category links
//   webAspects          — key-value attributes (Brand, Volume, etc.)
//   webShortCharacteristics — short attribute list
//   webDetailSKU       — "Артикул: 2990857619"
//   webNutritionInfo   — nutrition facts (food items)
//   webDetailDescription — full description (not always present)
//   webInstallmentPurchase — installment / "Оплатить позже"
//   webAddToCart        — cart button (present = valid PDP)
//   webListPhotos       — user-uploaded photos
//
// Image CDN: ir-*.ozonru.cn  pattern: /s3/multimedia-1-*/wc50/{id}.jpg
//   → replace wc50 with wc1000 for larger version
//
// Video CDN: vr-*.ozone.ru  pattern: /vod/video-{id}/asset_{n}_h264.mp4

/* ================================================================
 *  Helpers
 * ================================================================ */

function q<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector)
}

function qAll<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

function widget<T extends Element = HTMLElement>(name: string): T | null {
  return q<T>(`[data-widget="${name}"]`)
}

/* ================================================================
 *  Source ID — extracted from URL
 *  Pattern: /product/{slug}-{id}/  or  /product/{id}/
 * ================================================================ */

function extractSourceId(): string {
  const match = location.pathname.match(/\/(\d{5,})\/?$/)
  return match?.[1] || ''
}

/* ================================================================
 *  Title
 *  Selector verified: [data-widget="webProductHeading"] h1
 *  → "Сироп Barinoff Амаретто, 1л (для кофе и десертов)"
 * ================================================================ */

function extractTitle(): string {
  const h1 = q<HTMLHeadingElement>('[data-widget="webProductHeading"] h1')
  if (h1) return h1.textContent?.trim() || ''
  const ogTitle = q('meta[property="og:title"]') as HTMLMetaElement | null
  if (ogTitle?.content) return ogTitle.content.split(' купить')[0].trim()
  return document.title.split(' купить')[0].trim()
}

/* ================================================================
 *  Images
 *  Selector verified: [data-widget="webGallery"] img.pdp_x5
 *  CDN: ir-*.ozonru.cn/s3/multimedia-1-*/wc50/{id}.jpg
 *  Upgrade to wc1000 for full-size
 * ================================================================ */

function extractImages(): string[] {
  const gallery = widget('webGallery')
  if (!gallery) return []

  const rawUrls = qAll<HTMLImageElement>('img.pdp_x5, img[src*="multimedia"]', gallery)
    .map((img) => img.src)
    .filter((src) => src.includes('multimedia') || src.includes('ozonru'))

  const fullUrls = rawUrls.map((url) => url.replace(/\/wc\d+\//, '/wc1000/'))
  return [...new Set(fullUrls)].slice(0, 20)
}

/* ================================================================
 *  Videos
 *  Selector verified: [data-widget="webGallery"] video / video source
 *  CDN: vr-*.ozone.ru/vod/video-{id}/asset_{n}_h264.mp4
 * ================================================================ */

function extractVideoUrls(): string[] {
  const gallery = widget('webGallery')
  if (!gallery) return []

  const videoSrcs = qAll<HTMLVideoElement>('video', gallery)
    .flatMap((v) => {
      if (v.src) return [v.src]
      return qAll<HTMLSourceElement>('source', v)
        .map((s) => s.src)
        .filter(Boolean)
    })
    .filter((src) => src.includes('ozone.ru') || src.includes('sashimi'))

  return [...new Set(videoSrcs)]
}

/* ================================================================
 *  Price — [data-widget="webPrice"]
 *  Contains multiple spans; main price uses span.tsHeadline600Large
 *  Typical: "614 ₽" (bank), "647 ₽" (other banks), "1 500 ₽" (old)
 * ================================================================ */

function extractPrice(): number {
  const priceWidget = widget('webPrice')
  if (!priceWidget) return 0
  const text = priceWidget.textContent || ''
  const allPrices = [...text.matchAll(/([\d\s]+)\s*₽/g)].map((m) =>
    parseFloat(m[1].replace(/\s/g, ''))
  )
  return allPrices.length > 0 ? allPrices[0] : 0
}

function extractOldPrice(): number {
  const saleWidget = widget('webSale')
  const priceWidget = widget('webPrice')

  const allTexts = [
    saleWidget?.textContent || '',
    priceWidget?.textContent || '',
  ].join(' ')

  const allPrices = [...allTexts.matchAll(/([\d\s]+)\s*₽/g)].map((m) =>
    parseFloat(m[1].replace(/\s/g, ''))
  ).filter((p) => p > 0)

  if (allPrices.length === 0) return 0
  return Math.max(...allPrices)
}

/* ================================================================
 *  Rating — [data-widget="webSingleProductScore"]
 * ================================================================ */

function extractRating(): number {
  const el = widget('webSingleProductScore')
  if (!el) return 0
  const text = el.textContent || ''
  const match = text.match(/([\d.,]+)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

/* ================================================================
 *  Review Count — [data-widget="webReviewProductScore"]
 * ================================================================ */

function extractReviewCount(): number {
  const reviewEl = widget('webReviewProductScore')
  if (reviewEl) {
    const text = reviewEl.textContent || ''
    const match = text.match(/([\d\s]+)/)
    if (match) return parseInt(match[1].replace(/\s/g, ''), 10)
  }
  return 0
}

/* ================================================================
 *  Brand — from webAspects or /brand/ link
 * ================================================================ */

function extractBrand(): string {
  const brandLink = q<HTMLAnchorElement>('a[href*="/brand/"]')
  if (brandLink) return brandLink.textContent?.trim() || ''

  const aspects = widget('webAspects')
  if (aspects) {
    const brandMatch = aspects.innerText.match(/Бренд[:\s]+(.+)/i)
    if (brandMatch) return brandMatch[1].split('\n')[0].trim()
  }

  const shortChars = widget('webShortCharacteristics')
  if (shortChars) {
    const brandMatch = shortChars.innerText.match(/Бренд[:\s]+(.+)/i)
    if (brandMatch) return brandMatch[1].split('\n')[0].trim()
  }

  return ''
}

/* ================================================================
 *  Category — from [data-widget="breadCrumbs"] <a> links
 * ================================================================ */

function extractCategory(): string {
  const crumbs = widget('breadCrumbs')
  if (!crumbs) return ''

  const links = qAll<HTMLAnchorElement>('a', crumbs)
  return links
    .slice(1)
    .map((a) => a.textContent?.trim())
    .filter(Boolean)
    .join(' > ')
}

/* ================================================================
 *  Seller — [data-widget="webBestSeller"]
 * ================================================================ */

function extractSellerName(): string {
  const seller = widget('webBestSeller')
  if (!seller) return ''

  const link = q<HTMLAnchorElement>('a', seller)
  if (link) return link.textContent?.trim() || ''

  return seller.innerText.split('\n')[0]?.trim() || ''
}

/* ================================================================
 *  Attributes — from webAspects / webShortCharacteristics
 * ================================================================ */

function extractAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []

  const aspects = widget('webAspects')
  if (aspects) {
    const lines = aspects.innerText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length - 1; i += 2) {
      const name = lines[i]
      const value = lines[i + 1]
      if (name && value && name !== value) {
        attrs.push({ name, value })
      }
    }
  }

  const shortChars = widget('webShortCharacteristics')
  if (shortChars) {
    const lines = shortChars.innerText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length - 1; i += 2) {
      const name = lines[i]
      const value = lines[i + 1]
      if (name && value && name !== value && !attrs.some((a) => a.name === name)) {
        attrs.push({ name, value })
      }
    }
  }

  const seen = new Set<string>()
  return attrs.filter((a) => {
    const key = `${a.name}=${a.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ================================================================
 *  Description — webDetailDescription or textBlock or og:description
 * ================================================================ */

function extractDescription(): string {
  const descEl = widget('webDetailDescription')
  if (descEl) return descEl.textContent?.trim() || ''

  const textBlock = widget('textBlock')
  if (textBlock) return textBlock.textContent?.trim() || ''

  const ogDesc = q('meta[property="og:description"]') as HTMLMetaElement | null
  return ogDesc?.content || ''
}

/* ================================================================
 *  SKU — [data-widget="webDetailSKU"] "Артикул: 2990857619"
 * ================================================================ */

function extractSkuList(): Array<{ sku: string; barcode: string }> {
  const skuWidget = widget('webDetailSKU')
  if (!skuWidget) return []

  const text = skuWidget.textContent || ''
  const artMatch = text.match(/Артикул[:\s]+(\S+)/i)
  if (artMatch) {
    return [{ sku: artMatch[1], barcode: '' }]
  }
  return []
}

/* ================================================================
 *  Nutrition Info (for food products)
 *  Selector verified: [data-widget="webNutritionInfo"]
 *  → "Пищевая ценность продукта на 100 г:\n0\nбелки\n0\nжиры\n64\nуглеводы\n260\nккал"
 * ================================================================ */

function extractNutritionAttributes(): ProductAttribute[] {
  const nutrition = widget('webNutritionInfo')
  if (!nutrition) return []

  const lines = nutrition.innerText.split('\n').map((l) => l.trim()).filter(Boolean)
  const attrs: ProductAttribute[] = []
  for (let i = 0; i < lines.length - 1; i += 2) {
    const value = lines[i]
    const name = lines[i + 1]
    if (value && name && !isNaN(parseInt(value, 10))) {
      attrs.push({ name, value })
    }
  }
  return attrs
}

/* ================================================================
 *  Main scrape function
 * ================================================================ */

export function scrapeOzonProduct(): ScrapedProduct | null {
  const sourceId = extractSourceId()
  if (!sourceId) return null

  const nutritionAttrs = extractNutritionAttributes()
  const mainAttrs = extractAttributes()
  const allAttributes = nutritionAttrs.length > 0
    ? [...mainAttrs, ...nutritionAttrs]
    : mainAttrs

  return {
    platform: 'ozon',
    sourceId,
    title: extractTitle(),
    currency: 'RUB',
    price: extractPrice(),
    oldPrice: extractOldPrice(),
    images: extractImages(),
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    brand: extractBrand(),
    category: extractCategory(),
    sellerName: extractSellerName(),
    sellerUrl: '',
    attributes: allAttributes,
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
  }
}

export function initOzonContentScript() {
  // Detect product detail page: URL must contain a numeric ID at the end
  const isProductPage =
    /\/\d{5,}\/?$/.test(location.pathname) ||
    /\/product\//.test(location.pathname)

  if (!isProductPage) return

  // Listen for scrape commands from background script
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'scrape') {
      const product = scrapeOzonProduct()
      sendResponse({ success: !!product, data: product })
      return true
    }
    if (message.action === 'checkPage') {
      sendResponse({ isProductPage: true, platform: 'ozon' })
      return true
    }
  })
}

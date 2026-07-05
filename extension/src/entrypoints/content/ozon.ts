import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

// ── Ozon Product Page Scraper ──
//
// Strategy:
// 1. JSON-LD structured data (most reliable, always present for SEO)
// 2. data-widget DOM selectors (fallback)
// 3. Page HTML source scanning for video URLs
//

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
 *  JSON-LD — <script type="application/ld+json">
 *  Ozon includes this for SEO; contains structured product data
 * ================================================================ */

interface JsonLdProduct {
  '@type': string
  name?: string
  description?: string
  image?: string | string[]
  sku?: string
  brand?: { name?: string }
  category?: string
  aggregateRating?: {
    ratingValue?: number | string
    reviewCount?: number | string
    ratingCount?: number | string
  }
  offers?: {
    price?: number | string
    priceCurrency?: string
    availability?: string
  }
}

function getJsonLd(): JsonLdProduct | null {
  const scripts = qAll<HTMLScriptElement>('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '')
      if (data['@type'] === 'Product') return data as JsonLdProduct
      if (data['@graph']) {
        const product = data['@graph'].find((item: any) => item['@type'] === 'Product')
        if (product) return product as JsonLdProduct
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  return null
}

/* ================================================================
 *  Source ID — extracted from URL
 * ================================================================ */

function extractSourceId(): string {
  const m = location.pathname.match(/(\d{5,})/)
  return m ? m[1] : ''
}

/* ================================================================
 *  Title — [data-widget="webProductHeading"] h1
 * ================================================================ */

function extractTitle(): string {
  const el = widget('webProductHeading')
  if (el) {
    const h1 = el.querySelector('h1')
    if (h1) return h1.textContent?.trim() || ''
  }
  const ogTitle = q('meta[property="og:title"]') as HTMLMetaElement | null
  return ogTitle?.content || document.title.split('—')[0].trim()
}

/* ================================================================
 *  Images — [data-widget="webGallery"] img
 * ================================================================ */

function extractImages(): string[] {
  const jsonLd = getJsonLd()
  if (jsonLd?.image) {
    const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]
    if (imgs.length > 0) return imgs.slice(0, 20)
  }

  const gallery = widget('webGallery')
  if (!gallery) return []

  const rawUrls = qAll<HTMLImageElement>('img', gallery)
    .map((img) => img.src || (img as any).dataset?.src || '')
    .filter((src) => src && (src.includes('multimedia') || src.includes('ozonru') || src.includes('ozone.ru')))

  const fullUrls = rawUrls.map((url) => url.replace(/\/wc\d+\//, '/wc1000/'))
  return [...new Set(fullUrls)].slice(0, 20)
}

/* ================================================================
 *  Videos — extract from gallery elements and page HTML source
 *  CDN patterns: vr-*.ozone.ru/vod/video-{id}/asset_{n}_h264.mp4
 * ================================================================ */

function extractVideoUrls(): string[] {
  const videoUrls = new Set<string>()

  // 1. <video> / <source> elements in gallery
  const gallery = widget('webGallery')
  if (gallery) {
    const videos = qAll<HTMLVideoElement>('video', gallery)
    for (const v of videos) {
      if (v.src) videoUrls.add(v.src)
      for (const s of qAll<HTMLSourceElement>('source', v)) {
        if (s.src) videoUrls.add(s.src)
      }
    }
    // data-video-src / data-video attributes
    const videoContainers = qAll<HTMLElement>('[data-video-src], [data-video]', gallery)
    for (const vc of videoContainers) {
      const src = (vc as any).dataset?.videoSrc || (vc as any).dataset?.video || ''
      if (src) videoUrls.add(src)
    }
  }

  // 2. Scan page HTML for Ozon video CDN patterns
  const pageHtml = document.documentElement.innerHTML
  const videoPatterns = [
    /https?:\/\/vr-[^"'\s]*\.ozone\.ru\/vod\/[^"'\s]+\.mp4/g,
    /https?:\/\/[^"'\s]*\.ozone\.ru\/[^"'\s]*video[^"'\s]*\.mp4/g,
    /https?:\/\/[^"'\s]*cdn\.ozone\.ru\/[^"'\s]*\.mp4/g,
  ]
  for (const pattern of videoPatterns) {
    const matches = pageHtml.match(pattern)
    if (matches) {
      for (const url of matches) {
        videoUrls.add(url.replace(/['";\s]+$/, ''))
      }
    }
  }

  // 3. Check window.__INITIAL_STATE__ or similar globals
  try {
    const initialState = (window as any).__INITIAL_STATE__
    if (initialState) {
      const jsonStr = JSON.stringify(initialState)
      const videoMatches = jsonStr.match(/https?:\/\/vr-[^"'\s]*\.ozone\.ru\/vod\/[^"'\s]+\.mp4/g)
      if (videoMatches) {
        for (const url of videoMatches) videoUrls.add(url)
      }
    }
  } catch { /* ignore */ }

  return [...videoUrls]
}

/* ================================================================
 *  Price — [data-widget="webPrice"]
 * ================================================================ */

function extractPrice(): number {
  const jsonLd = getJsonLd()
  if (jsonLd?.offers?.price) {
    const p = parseFloat(String(jsonLd.offers.price))
    if (p > 0) return p
  }

  const priceWidget = widget('webPrice')
  if (!priceWidget) return 0
  const text = priceWidget.textContent || ''
  const allPrices = [...text.matchAll(/([\d\s]+)\s*₽/g)].map((m) =>
    parseFloat(m[1].replace(/\s/g, ''))
  ).filter((p) => p > 0)
  return allPrices.length > 0 ? allPrices[allPrices.length - 1] : 0
}

/* ================================================================
 *  Old Price — strikethrough / crossed-out price
 * ================================================================ */

function extractOldPrice(): number {
  const saleWidget = widget('webSale')
  if (saleWidget) {
    const oldPriceEl = saleWidget.querySelector('span[style*="line-through"], del, s')
    if (oldPriceEl) {
      const match = oldPriceEl.textContent?.match(/([\d\s]+)\s*₽/)
      if (match) return parseFloat(match[1].replace(/\s/g, ''))
    }
  }

  const priceWidget = widget('webPrice')
  if (priceWidget) {
    const spans = qAll<HTMLElement>('span', priceWidget)
    for (const span of spans) {
      const style = span.getAttribute('style') || ''
      if (style.includes('line-through') || style.includes('text-decoration')) {
        const match = span.textContent?.match(/([\d\s]+)\s*₽/)
        if (match) return parseFloat(match[1].replace(/\s/g, ''))
      }
    }
  }

  return 0
}

/* ================================================================
 *  Rating — JSON-LD primary, DOM fallback
 * ================================================================ */

function extractRating(): number {
  const jsonLd = getJsonLd()
  if (jsonLd?.aggregateRating?.ratingValue) {
    const r = parseFloat(String(jsonLd.aggregateRating.ratingValue))
    if (r > 0 && r <= 5) return r
  }

  const el = widget('webSingleProductScore')
  if (el) {
    const text = el.textContent || ''
    const match = text.match(/([\d.,]+)/)
    if (match) {
      const val = parseFloat(match[1].replace(',', '.'))
      if (val > 0 && val <= 5) return val
    }
  }

  const starEl = q('[data-widget*="Score"] span, [class*="star"] [class*="rating"], [class*="rating-value"]')
  if (starEl) {
    const match = starEl.textContent?.match(/([\d.,]+)/)
    if (match) {
      const val = parseFloat(match[1].replace(',', '.'))
      if (val > 0 && val <= 5) return val
    }
  }

  return 0
}

/* ================================================================
 *  Review Count — JSON-LD primary, DOM fallback
 * ================================================================ */

function extractReviewCount(): number {
  const jsonLd = getJsonLd()
  if (jsonLd?.aggregateRating?.reviewCount) {
    const rc = parseInt(String(jsonLd.aggregateRating.reviewCount), 10)
    if (rc > 0) return rc
  }
  if (jsonLd?.aggregateRating?.ratingCount) {
    const rc = parseInt(String(jsonLd.aggregateRating.ratingCount), 10)
    if (rc > 0) return rc
  }

  const reviewEl = widget('webReviewProductScore')
  if (reviewEl) {
    const text = reviewEl.textContent || ''
    const match = text.match(/([\d\s]+)/)
    if (match) {
      const val = parseInt(match[1].replace(/\s/g, ''), 10)
      if (val > 0) return val
    }
  }

  const reviewLink = q('a[href*="#reviews"], a[href*="Reviews"]')
  if (reviewLink) {
    const match = reviewLink.textContent?.match(/([\d\s]+)/)
    if (match) {
      const val = parseInt(match[1].replace(/\s/g, ''), 10)
      if (val > 0) return val
    }
  }

  return 0
}

/* ================================================================
 *  Brand — JSON-LD, brand link, or aspects
 * ================================================================ */

function extractBrand(): string {
  const jsonLd = getJsonLd()
  if (jsonLd?.brand?.name) return jsonLd.brand.name

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
  const categoryParts = links
    .slice(1)
    .map((a) => a.textContent?.trim())
    .filter(Boolean)

  return categoryParts.join(' > ')
}

/* ================================================================
 *  Seller — [data-widget="webBestSeller"]
 * ================================================================ */

function extractSellerName(): string {
  const el = widget('webBestSeller')
  if (!el) return ''
  const link = el.querySelector('a')
  return link?.textContent?.trim() || el.textContent?.split('\n')[0].trim() || ''
}

function extractSellerUrl(): string {
  const el = widget('webBestSeller')
  if (!el) return ''
  const link = el.querySelector('a')
  if (link?.href) return link.href
  return ''
}

/* ================================================================
 *  Key-Value Pair Extraction — text-based (no fragile CSS classes)
 *
 *  Parses webAspects and webShortCharacteristics by reading innerText
 *  instead of relying on minified CSS class selectors like
 *  .pdp_a1h, [class*="k9"], [class*="q5"] which change frequently.
 * ================================================================ */

function extractKeyValuePairsFromWidgets(): Array<[string, string]> {
  const pairs: Array<[string, string]> = []

  const aspects = widget('webAspects')
  if (aspects) {
    // Method 1: each child element = one attribute (label + value)
    const items = aspects.children
    for (const item of Array.from(items)) {
      const texts = item.innerText.split('\n').map(t => t.trim()).filter(Boolean)
      if (texts.length >= 2) {
        pairs.push([texts[0], texts[1]])
      } else if (texts.length === 1) {
        const colonMatch = texts[0].match(/^(.+?)[:\s]+(.+)$/)
        if (colonMatch) {
          pairs.push([colonMatch[1].trim(), colonMatch[2].trim()])
        }
      }
    }

    // Method 2: alternating key/value lines
    if (pairs.length === 0) {
      const lines = aspects.innerText.split('\n').map(l => l.trim()).filter(Boolean)
      for (let i = 0; i < lines.length - 1; i += 2) {
        const key = lines[i].replace(/[:\s]+$/, '')
        const val = lines[i + 1]
        if (key && val && key.length < 50 && val.length < 200) {
          pairs.push([key, val])
        }
      }
    }

    // Method 3: "Key: Value" single-line format
    if (pairs.length === 0) {
      const text = aspects.innerText
      const colonPairs = [...text.matchAll(/([А-Яа-яA-Za-zёЁ][\w\s]{1,30})[:\s]+([^\n]+)/g)]
      for (const m of colonPairs) {
        const key = m[1].trim()
        const val = m[2].trim()
        if (key && val && !pairs.some(([k]) => k === key)) {
          pairs.push([key, val])
        }
      }
    }
  }

  const shortChars = widget('webShortCharacteristics')
  if (shortChars) {
    const lines = shortChars.innerText.split('\n').map(l => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length - 1; i += 2) {
      const key = lines[i].replace(/[:\s]+$/, '')
      const val = lines[i + 1]
      if (key && val && key.length < 50 && val.length < 200) {
        if (!pairs.some(([k]) => k === key)) {
          pairs.push([key, val])
        }
      }
    }
  }

  return pairs
}

/* ================================================================
 *  Specifications — category-dependent attributes
 *  Uses text-based parsing, not CSS class selectors
 * ================================================================ */

function extractSpecList(): Array<{ weight_g: number; depth_mm: number; height_mm: number; width_mm: number; [key: string]: any }> {
  const specs: Record<string, any> = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }

  const allPairs = extractKeyValuePairsFromWidgets()

  for (const [key, val] of allPairs) {
    const keyLower = key.toLowerCase()
    const numVal = parseFloat(val.replace(',', '.').replace(/[^\d.]/g, '')) || 0

    if (/вес|масс/i.test(keyLower)) {
      if (/кг|kg/i.test(val)) specs.weight_g = numVal * 1000
      else specs.weight_g = numVal
    } else if (/длин|глуб|length|depth/i.test(keyLower)) {
      if (/м\b|meter/i.test(val)) specs.depth_mm = numVal * 1000
      else specs.depth_mm = numVal
    } else if (/высот|height/i.test(keyLower)) {
      if (/м\b|meter/i.test(val)) specs.height_mm = numVal * 1000
      else specs.height_mm = numVal
    } else if (/ширин|width/i.test(keyLower)) {
      if (/м\b|meter/i.test(val)) specs.width_mm = numVal * 1000
      else specs.width_mm = numVal
    }

    if (/размер|size|объем|volume|тип|type|материал|material|цвет|color/i.test(keyLower)) {
      specs[key] = val
    }
  }

  return [specs]
}

/* ================================================================
 *  Attributes — all key-value pairs as ProductAttribute[]
 * ================================================================ */

function extractAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []
  const pairs = extractKeyValuePairsFromWidgets()

  for (const [name, value] of pairs) {
    if (name && value && name !== value && !attrs.some((a) => a.name === name)) {
      attrs.push({ name, value })
    }
  }

  // Also try tables in webDetailDescription
  const descWidget = widget('webDetailDescription')
  if (descWidget) {
    const tables = descWidget.querySelectorAll('table')
    for (const table of tables) {
      const rows = table.querySelectorAll('tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th')
        if (cells.length >= 2) {
          const name = cells[0].textContent?.trim().replace(/[:\s]+$/, '') || ''
          const value = cells[1].textContent?.trim() || ''
          if (name && value && !attrs.some((a) => a.name === name)) {
            attrs.push({ name, value })
          }
        }
      }
    }
  }

  return attrs
}

/* ================================================================
 *  Description — JSON-LD primary, DOM fallback
 * ================================================================ */

function extractDescription(): string {
  const jsonLd = getJsonLd()
  if (jsonLd?.description) return jsonLd.description

  const descEl = widget('webDetailDescription')
  if (descEl) {
    const clone = descEl.cloneNode(true) as HTMLElement
    clone.querySelectorAll('script, style, noscript').forEach(el => el.remove())
    const text = clone.textContent?.trim() || ''
    if (text.length > 20) return text
  }

  const textBlock = widget('textBlock')
  if (textBlock) {
    const text = textBlock.textContent?.trim() || ''
    if (text.length > 20) return text
  }

  const ogDesc = q('meta[property="og:description"]') as HTMLMetaElement | null
  if (ogDesc?.content) return ogDesc.content

  const metaDesc = q('meta[name="description"]') as HTMLMetaElement | null
  return metaDesc?.content || ''
}

/* ================================================================
 *  Tags — meta keywords, product labels, breadcrumbs
 * ================================================================ */

function extractTags(): string[] {
  const tags = new Set<string>()

  const metaKeywords = q('meta[name="keywords"]') as HTMLMetaElement | null
  if (metaKeywords?.content) {
    metaKeywords.content.split(',').forEach(tag => {
      const t = tag.trim()
      if (t) tags.add(t)
    })
  }

  const tagEls = qAll<HTMLElement>('[class*="tag"], [class*="badge"], [class*="label"]')
  for (const el of tagEls) {
    const text = el.textContent?.trim() || ''
    if (text.length > 1 && text.length < 50) {
      tags.add(text)
    }
  }

  const crumbs = widget('breadCrumbs')
  if (crumbs) {
    const links = qAll<HTMLAnchorElement>('a', crumbs)
    links.slice(-3).forEach(a => {
      const text = a.textContent?.trim()
      if (text) tags.add(text)
    })
  }

  return [...tags].slice(0, 20)
}

/* ================================================================
 *  SKU — JSON-LD primary, DOM fallback
 * ================================================================ */

function extractSkuList(): Array<{ sku: string; barcode: string }> {
  const jsonLd = getJsonLd()
  if (jsonLd?.sku) {
    return [{ sku: jsonLd.sku, barcode: '' }]
  }

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
 *  Nutrition Info (food products)
 * ================================================================ */

function extractNutritionAttributes(): ProductAttribute[] {
  const el = widget('webNutritionInfo')
  if (!el) return []

  const attrs: ProductAttribute[] = []
  const lines = el.innerText.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length - 1; i += 2) {
    attrs.push({ name: lines[i], value: lines[i + 1] })
  }
  return attrs
}

/* ================================================================
 *  Main: scrapeOzonProduct
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
    sellerUrl: extractSellerUrl(),
    attributes: allAttributes,
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
    videoUrls: extractVideoUrls(),
    skuList: extractSkuList(),
    specList: extractSpecList(),
    tags: extractTags(),
  }
}

export function initOzonContentScript() {
  const isProductPage =
    /\/\d{5,}\/?$/.test(location.pathname) ||
    /\/product\//.test(location.pathname)

  if (!isProductPage) return

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

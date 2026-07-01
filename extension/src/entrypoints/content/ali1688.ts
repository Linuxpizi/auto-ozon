import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

// ─── 通用工具 ───────────────────────────────────────────────

function getText(selector: string, parent: Element | Document = document): string {
  const el = parent.querySelector(selector)
  return el?.textContent?.trim() || ''
}

function getAllTexts(selector: string, parent: Element | Document = document): string[] {
  return Array.from(parent.querySelectorAll(selector))
    .map((el) => el.textContent?.trim() || '')
    .filter(Boolean)
}

function parsePrice(text: string): number {
  const cleaned = text.replace(/[¥￥\s,]/g, '').trim()
  const match = cleaned.match(/(\d+\.?\d*)/)
  return match ? Math.round(parseFloat(match[1]) * 100) / 100 : 0
}

// ─── 页面类型检测 ──────────────────────────────────────────

export function is1688DetailPage(): boolean {
  return /detail\.1688\.com\/offer\//.test(location.href)
}

export function is1688ListPage(): boolean {
  const h = location.href
  return /s\.1688\.com\/selloffer/.test(h) ||
    /s\.1688\.com\/offer_search/.test(h) ||
    /s\.1688\.com\/company/.test(h) ||
    /www\.1688\.com\/chanpin/.test(h) ||
    /s\.1688\.com\/search/.test(h) ||
    /s\.1688\.com\/offer/.test(h)
}

// ─── INIT_DATA 提取 ────────────────────────────────────────

interface InitDataOffer {
  offerId?: string
  subject?: string
  title?: string
  priceRange?: Array<{ price: string; minQuantity: number; maxQuantity: number }>
  skuList?: Array<{
    skuId?: string
    propPath?: string
    canBookFlag?: boolean
    price?: string
    quantity?: number
    skuImgUrl?: string
  }>
  imageList?: string[]
  attributes?: Array<{ name: string; value: string }>
  tradeQuantity?: number
  bookableQuantity?: number
  minOrderQuantity?: number
  companyId?: string
  companyName?: string
}

function getInitData(): InitDataOffer | null {
  try {
    const w = window as any

    // 1) Try legacy window.INIT_DATA / window.__INIT_DATA
    const initObj = w.INIT_DATA || w.__INIT_DATA
    if (initObj) {
      const data = initObj.data || initObj
      if (data.offerDetail) return data.offerDetail as InitDataOffer
      if (data.detailData) return data.detailData as InitDataOffer
      if (data.offerId || data.subject || data.title) return data as InitDataOffer
    }

    // 2) Modern 1688: data is in window.context.result.data
    //    The product offer is embedded inside <script> tags as window.context = {...}
    const ctx = w.context
    if (ctx?.result?.data) {
      const rd = ctx.result.data
      // Check for offerDetail inside nested module data
      if (rd.offerDetail) return rd.offerDetail as InitDataOffer
      // Scan module keys for offer data
      for (const key of Object.keys(rd)) {
        const val = rd[key]
        if (val && typeof val === 'object') {
          if (val.offerId || val.subject) return val as InitDataOffer
          if (val.fields?.offerDetail) return val.fields.offerDetail as InitDataOffer
        }
      }
    }

    // 3) Fallback: parse inline script tags for product data
    const scripts = document.querySelectorAll('script')
    for (const s of scripts) {
      const t = s.textContent || ''
      if (t.includes('offerDetail') && t.includes('subject')) {
        // Try to extract offerDetail JSON from the script
        const match = t.match(/offerDetail['":\s]*=(\{[\s\S]*?\})\s*[,;\n]/)
        if (match) {
          try {
            const obj = JSON.parse(match[1])
            if (obj.subject || obj.offerId) return obj as InitDataOffer
          } catch { /* ignore parse errors */ }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// ─── 字段提取函数 ──────────────────────────────────────────

function extractProductId(): string {
  // URL: https://detail.1688.com/offer/XXXXXXXXX.html
  const match = location.pathname.match(/\/offer\/(\d+)/)
  return match?.[1] || ''
}

function extractTitle(initData: InitDataOffer | null): string {
  // Priority: INIT_DATA > DOM
  const fromInit = initData?.subject || initData?.title || ''
  if (fromInit) return fromInit

  // Real 1688 DOM: title is in .title-content h1 (H1 has no class!)
  const selectors = [
    '.title-content h1',
    'h1[class*="title"]',
    '.mod-detail-title h1',
    '[class*="detail-title"] h1',
    'h1',
  ]
  for (const sel of selectors) {
    const text = getText(sel)
    if (text && text.length > 3) return text
  }
  return ''
}

function extractPrice(initData: InitDataOffer | null): number {
  // Priority: INIT_DATA priceRange > DOM
  if (initData?.priceRange?.length) {
    // Lowest tier price
    const prices = initData.priceRange
      .map((p) => parseFloat(p.price))
      .filter((p) => !isNaN(p) && p > 0)
    if (prices.length) return Math.min(...prices)
  }

  // Real 1688 DOM: price is in .module-od-main-price container
  // Text looks like: "券后¥368.00首件预估到手价¥388.001件起批 活动前¥393.00元"
  const priceContainer = document.querySelector('.module-od-main-price')
  if (priceContainer) {
    const text = priceContainer.textContent || ''
    const price = parsePrice(text)
    if (price > 0) return price
  }

  const selectors = [
    '.price-text',
    '.price-component .price-text',
    '.onhand-price [class*="price-text"]',
    '[class*="detail-price"] [class*="value"]',
    '.mod-detail-price .value',
    '[class*="price"] .price-text',
    '.price .value',
  ]
  for (const sel of selectors) {
    const text = getText(sel)
    const price = parsePrice(text)
    if (price > 0) return price
  }
  return 0
}

function extractOldPrice(): number {
  // 1688 rarely shows old price, but check for strikethrough
  // Real 1688 DOM: "活动前¥393.00元" in the price container
  const priceContainer = document.querySelector('.module-od-main-price')
  if (priceContainer) {
    const text = priceContainer.textContent || ''
    const match = text.match(/活动前[\u00A5\uFFE5¥]?([\d,.]+)/)
    if (match) return parsePrice(match[1])
  }
  const el = document.querySelector(
    '.mod-detail-price del, [class*="price"] del, [class*="origin-price"]'
  )
  const text = el?.textContent || ''
  return parsePrice(text)
}

function extractPriceRanges(initData: InitDataOffer | null): Array<{ minQty: number; maxQty: number; price: number }> {
  if (initData?.priceRange?.length) {
    return initData.priceRange.map((p) => ({
      minQty: p.minQuantity || 0,
      maxQty: p.maxQuantity || 999999,
      price: parseFloat(p.price) || 0,
    })).filter((p) => p.price > 0)
  }

  // DOM fallback: tiered price table or step pricing
  const ranges: Array<{ minQty: number; maxQty: number; price: number }> = []
  
  // Real 1688 DOM: look for step pricing in price container
  const priceContainer = document.querySelector('.module-od-main-price')
  if (priceContainer) {
    const text = priceContainer.textContent || ''
    // Parse patterns like "1件起批" "2件起批" etc.
    const stepMatch = text.match(/(\d+)件起批/)
    if (stepMatch) {
      const price = parsePrice(text)
      if (price > 0) {
        ranges.push({ minQty: parseInt(stepMatch[1]) || 1, maxQty: 999999, price })
      }
    }
  }

  // Try traditional table selectors as fallback
  const rows = document.querySelectorAll(
    '.amount-price-list tr, [class*="price-range"] tr, [class*="tiered"] tr, [class*="tiered-price"] li'
  )
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td, span')
    if (cells.length >= 2) {
      const qtyText = cells[0]?.textContent || ''
      const priceText = cells[1]?.textContent || ''
      const qtyMatch = qtyText.replace(/\s/g, '').match(/(\d+)/)
      const price = parsePrice(priceText)
      if (qtyMatch && price > 0) {
        ranges.push({
          minQty: parseInt(qtyMatch[1]),
          maxQty: 999999,
          price,
        })
      }
    }
  })
  return ranges
}

function extractImages(initData: InitDataOffer | null): string[] {
  // Priority: INIT_DATA > DOM
  if (initData?.imageList?.length) {
    return [...new Set(initData.imageList)]
      .filter((src) => src && !src.includes('icon') && !src.includes('logo'))
      .slice(0, 20)
  }

  // Real 1688 DOM: gallery images use [class*="gallery"] img
  // URLs are cbu01.alicdn.com ending in .jpg_.webp or .jpg
  const selectors = [
    '[class*="gallery"] img',
    '.detail-gallery-img img',
    '.tab-pane img',
    '[class*="thumb"] img',
    '.detail-gallery img',
  ]
  for (const sel of selectors) {
    const imgs = Array.from(document.querySelectorAll(sel))
      .map((img) => {
        const el = img as HTMLImageElement
        // Prefer data-src/data-img-src for high-res originals
        return el.getAttribute('data-src') || el.getAttribute('data-img-src') ||
          el.getAttribute('data-lazy-img') || el.src || ''
      })
      .filter((src) => src && src.startsWith('http') && !src.includes('icon') && !src.includes('logo'))
    if (imgs.length) return [...new Set(imgs)].slice(0, 20)
  }

  // Last resort: all product images on page
  const allImgs = Array.from(document.querySelectorAll('img'))
    .map((img) => {
      const el = img as HTMLImageElement
      return el.getAttribute('data-src') || el.src || ''
    })
    .filter((src) => src && src.includes('cbu01.alicdn.com') && !src.includes('icon') && !src.includes('logo'))
  return [...new Set(allImgs)].slice(0, 20)
}

function extractSkus(initData: InitDataOffer | null): ScrapedProduct['skuList'] {
  if (initData?.skuList?.length) {
    return initData.skuList.map((s) => ({
      sku: s.skuId || '',
      barcode: s.propPath || '',
    }))
  }
  return []
}

function extractMinOrderQty(initData: InitDataOffer | null): number {
  if (initData?.minOrderQuantity) return initData.minOrderQuantity

  // Real 1688 DOM: "1件起批" text in the price container
  const priceContainer = document.querySelector('.module-od-main-price')
  if (priceContainer) {
    const text = priceContainer.textContent || ''
    const match = text.match(/(\d+)件起批/)
    if (match) return parseInt(match[1]) || 1
  }

  // DOM fallback: try various step/amount selectors
  const selectors = [
    '[class*="step-amount"] [class*="value"]',
    '[class*="amount"] [class*="value"]',
    '[class*="min-order"]',
    '[class*="batch"] [class*="value"]',
  ]
  for (const sel of selectors) {
    const text = getText(sel)
    const match = text.replace(/\s/g, '').match(/(\d+)/)
    if (match) return parseInt(match[1])
  }
  return 1
}

function extractTradeQuantity(initData: InitDataOffer | null): number {
  if (initData?.tradeQuantity) return initData.tradeQuantity

  // Real 1688 DOM: .sold-count contains "2100+人想买全网销量100+件"
  const selectors = [
    '.sold-count',
    '[class*="sold-count"]',
    '[class*="trade-quantity"]',
    '[class*="month-sold"]',
  ]
  for (const sel of selectors) {
    const text = getText(sel)
    // Try to find sold/trade quantity number
    const soldMatch = text.match(/(\d[\d,.]*\+?)件/)
    if (soldMatch) {
      const num = parseInt(soldMatch[1].replace(/[,+.]/g, ''))
      if (!isNaN(num)) return num
    }
    // Fallback: any number in the text
    const match = text.replace(/[^\d]/g, '').match(/(\d+)/)
    if (match) return parseInt(match[1])
  }
  return 0
}

function extractAttributes(initData: InitDataOffer | null): ProductAttribute[] {
  // Priority: INIT_DATA > DOM
  if (initData?.attributes?.length) {
    return initData.attributes
      .filter((a) => a.name && a.value)
      .map((a) => ({ name: a.name, value: a.value }))
  }

  const attrs: ProductAttribute[] = []

  // ── Priority 1: Ant-design table rows (most reliable on modern 1688) ──
  const antTableRows = document.querySelectorAll('.ant-descriptions-view tr, .ant-table-content tr')
  antTableRows.forEach((row) => {
    const cells = row.querySelectorAll('td, th')
    if (cells.length >= 2) {
      const name = cells[0].textContent?.trim().replace(/[::]$/, '') || ''
      const value = cells[1].textContent?.trim() || ''
      if (name && value && name !== value) attrs.push({ name, value })
    }
  })
  if (attrs.length > 0) return attrs

  // ── Priority 2: LI items inside attribute containers ──
  const attrLis = document.querySelectorAll('[class*="obj-attr"] li, [class*="attr-list"] li, .detail-attributes-list li, [class*="detail-info"] li')
  attrLis.forEach((li) => {
    const children = Array.from(li.children)
    if (children.length >= 2) {
      const name = children[0].textContent?.trim().replace(/[::]$/, '') || ''
      const value = children[1].textContent?.trim() || ''
      if (name && value && name !== value) attrs.push({ name, value })
    }
  })
  if (attrs.length > 0) return attrs

  // ── Priority 3: DL format ──
  document.querySelectorAll('.obj-attr dl, [class*="attribute"] dl').forEach((row) => {
    const dt = row.querySelector('dt')
    const dd = row.querySelector('dd')
    if (dt && dd) {
      const name = dt.textContent?.trim().replace(/[::]$/, '') || ''
      const value = dd.textContent?.trim() || ''
      if (name && value) attrs.push({ name, value })
    }
  })
  if (attrs.length > 0) return attrs

  // ── Priority 4: Any 2-column table with short name / longer value ──
  document.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('tr').forEach((row) => {
      const cells = row.querySelectorAll('td')
      if (cells.length === 2) {
        const name = cells[0].textContent?.trim().replace(/[::]$/, '') || ''
        const value = cells[1].textContent?.trim() || ''
        if (name && value && name !== value && name.length <= 20 && value.length <= 100) {
          attrs.push({ name, value })
        }
      }
    })
  })

  return attrs
}

function extractSpecList(attrs: ProductAttribute[]): Array<{ weight_g: number; depth_mm: number; height_mm: number; width_mm: number; [key: string]: any }> {
  const spec: Record<string, any> = { weight_g: 0, depth_mm: 0, height_mm: 0, width_mm: 0 }

  for (const attr of attrs) {
    const name = attr.name.toLowerCase()
    const val = attr.value

    // 重量提取: 支持 kg/g/克/千克
    if (name.includes('重量') || name.includes('毛重') || name.includes('净重')) {
      const kgMatch = val.match(/([\d.]+)\s*(?:kg|千克)/i)
      const gMatch = val.match(/([\d.]+)\s*(?:g|克)/i)
      if (kgMatch) {
        spec.weight_g = Math.round(parseFloat(kgMatch[1]) * 1000)
      } else if (gMatch) {
        spec.weight_g = Math.round(parseFloat(gMatch[1]))
      } else {
        const num = parseFloat(val.replace(/[^\d.]/g, ''))
        if (!isNaN(num) && num > 0) {
          // Default to grams if no unit
          spec.weight_g = num > 100 ? Math.round(num) : Math.round(num * 1000)
        }
      }
    }

    // 尺寸提取
    if (name.includes('尺寸') || name.includes('长宽高') || name.includes('规格')) {
      const dimMatch = val.match(/([\d.]+)\s*[×x*]\s*([\d.]+)\s*[×x*]\s*([\d.]+)/i)
      if (dimMatch) {
        spec.depth_mm = Math.round(parseFloat(dimMatch[1]))
        spec.width_mm = Math.round(parseFloat(dimMatch[2]))
        spec.height_mm = Math.round(parseFloat(dimMatch[3]))
      }
    }
  }

  return [spec]
}

function extractBrand(): string {
  // Check DOM for brand element first
  const brandEl = document.querySelector('[class*="brand"] a, [class*="brand"] span')
  const domBrand = brandEl?.textContent?.trim() || ''
  if (domBrand) return domBrand

  // Fallback: extract from attributes - look for "品牌" key
  const attrs = extractAttributes(null)
  const brandAttr = attrs.find(a => a.name.includes('品牌'))
  return brandAttr?.value || ''
}

function extractCategory(): string {
  // Try breadcrumbs first
  const crumbs = Array.from(
    document.querySelectorAll('.bread-crumbs a, [class*="breadcrumb"] a, [class*="crumb"] a')
  ).map((a) => a.textContent?.trim()).filter(Boolean)
  if (crumbs.length > 0) return crumbs.join(' > ')

  // Fallback: look for category in the page's navigation or tab area
  // Modern 1688 has category info in [class*="category"] or [class*="classify"]
  const catEl = document.querySelector('[class*="category-name"], [class*="classify-name"], [class*="cat-name"]')
  if (catEl) return catEl.textContent?.trim() || ''

  // Extract from URL pattern: /offer/ has no category in URL
  // Last resort: check meta tags
  const meta = document.querySelector('meta[name="keywords"]')
  if (meta) {
    const keywords = meta.getAttribute('content') || ''
    // First keyword is often the category
    const firstKeyword = keywords.split(',')[0]?.trim()
    if (firstKeyword && firstKeyword.length < 20) return firstKeyword
  }

  return ''
}

function extractSellerName(initData: InitDataOffer | null): string {
  if (initData?.companyName) return initData.companyName

  // Real 1688 DOM: .shop-company-name h1 contains the seller name
  const selectors = [
    '.shop-company-name h1',
    '.company-name a',
    '[class*="company"] [class*="name"]',
    '.shop-name a',
    '[class*="store-name"]',
  ]
  for (const sel of selectors) {
    const text = getText(sel)
    if (text) return text
  }
  return ''
}

function extractSellerUrl(): string {
  // Real 1688 DOM: shop links use subdomain format shopXXX.1688.com
  // Found in .od-shop-navigation or .winport-title containers
  const selectors = [
    '.od-shop-navigation a[href*="1688.com"]',
    '.winport-title a',
    '.shop-company-name a',
    '.company-name a',
    '[class*="company"] a',
    '.shop-name a',
    '[class*="shop"] a[href*="1688.com"]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLAnchorElement
    if (el?.href && el.href.includes('1688.com')) return el.href
  }
  // Fallback: any link with shop subdomain
  const allLinks = Array.from(document.querySelectorAll('a[href]'))
  const shopLink = allLinks.find((a) => (a as HTMLAnchorElement).href.match(/shop\w+\.1688\.com/)) as HTMLAnchorElement
  return shopLink?.href || ''
}

function extractDescription(): string {
  // Extract description images (lazy-loaded) from the detail description section
  const imgSelectors = [
    '.detail-desc img',
    '[class*="offer-detail"] img',
    '#detail-desc img',
    '.detail-desc-content img',
    '[class*="desc-content"] img',
    '[class*="desc"] img',
  ]
  const imgs: string[] = []
  for (const sel of imgSelectors) {
    const found = Array.from(document.querySelectorAll(sel))
      .map((img) => {
        const el = img as HTMLImageElement
        return el.getAttribute('data-src') || el.getAttribute('data-lazy-img') || el.src || ''
      })
      .filter((src) => src && src.startsWith('http') && !src.includes('icon') && !src.includes('logo'))
    if (found.length) {
      imgs.push(...found)
      break
    }
  }

  // Also extract text content from the description section
  const descSelectors = [
    '.detail-desc-content',
    '.detail-desc',
    '#detail-desc',
    '[class*="offer-detail-desc"]',
  ]
  let descText = ''
  for (const sel of descSelectors) {
    const el = document.querySelector(sel)
    if (el) {
      descText = el.textContent?.trim() || ''
      if (descText.length > 10) break
    }
  }

  // Combine: image URLs + text
  const parts: string[] = []
  if (imgs.length) parts.push(...[...new Set(imgs)])
  if (descText) parts.push(descText)
  return parts.join('\n')
}

function extractVideoUrls(): string[] {
  const videos = Array.from(document.querySelectorAll('video source, video'))
    .map((v) => (v as HTMLVideoElement).src || (v.querySelector('source') as HTMLSourceElement)?.src || '')
    .filter((src) => src && src.startsWith('http'))
  return [...new Set(videos)]
}

// ─── 主提取函数 ────────────────────────────────────────────

export function scrape1688Product(): ScrapedProduct | null {
  const offerId = extractProductId()
  if (!offerId) return null

  const initData = getInitData()
  const attrs = extractAttributes(initData)

  return {
    platform: '1688',
    sourceId: offerId,
    title: extractTitle(initData),
    currency: 'CNY',
    price: extractPrice(initData),
    oldPrice: extractOldPrice(),
    images: extractImages(initData),
    rating: 0, // 1688 doesn't show public ratings
    reviewCount: 0,
    brand: extractBrand(),
    category: extractCategory(),
    sellerName: extractSellerName(initData),
    sellerUrl: extractSellerUrl(),
    attributes: attrs,
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
    videoUrls: extractVideoUrls(),
    skuList: extractSkus(initData),
    specList: extractSpecList(attrs),
    ozonCategoryId: 0,
    ozonTypeId: 0,
    // 1688-specific
    priceRanges: extractPriceRanges(initData),
    minOrderQty: extractMinOrderQty(initData),
    tradeQuantity: extractTradeQuantity(initData),
    supplierUrl: extractSellerUrl(),
  }
}

// ─── 列表页提取 ────────────────────────────────────────────

export interface ListCard1688 {
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  sourceUrl: string
}

export function scan1688ListCards(): ListCard1688[] {
  const cards: ListCard1688[] = []
  const seen = new Set<string>()

  // Modern 1688 search pages render each product as:
  //   <a class="search-offer-item" href="detail.m.1688.com/page/index.html?offerId=XXX">
  // The card IS the <a> tag itself — offerId lives in the card's own href.
  const cardEls = document.querySelectorAll('.search-offer-item')
  for (const el of cardEls) {
    const card = el as HTMLAnchorElement
    const href = card.href || card.getAttribute('href') || ''
    const m = href.match(/offerId=(\d+)/)
    if (!m) continue
    const sourceId = m[1]
    if (seen.has(sourceId)) continue
    seen.add(sourceId)

    const titleEl = card.querySelector('[class*="title"]')
    const priceEl = card.querySelector('[class*="price"]')
    const imgEl = card.querySelector('img')

    let imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || ''
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = 'https:' + imageUrl

    cards.push({
      sourceId,
      title: titleEl?.textContent?.trim() || '',
      price: parsePrice(priceEl?.textContent || ''),
      oldPrice: 0,
      imageUrl,
      sourceUrl: `https://detail.1688.com/offer/${sourceId}.html`,
    })
  }

  return cards
}

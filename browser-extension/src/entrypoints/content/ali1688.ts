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
  return match ? parseFloat(match[1]) : 0
}

// ─── 页面类型检测 ──────────────────────────────────────────

export function is1688DetailPage(): boolean {
  return /detail\.1688\.com\/offer\//.test(location.href)
}

export function is1688ListPage(): boolean {
  return /s\.1688\.com\/selloffer/.test(location.href) ||
    /s\.1688\.com\/offer_search/.test(location.href) ||
    /s\.1688\.com\/company/.test(location.href)
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
    // 1688 stores data in window.INIT_DATA or window.__INIT_DATA
    const initObj = w.INIT_DATA || w.__INIT_DATA
    if (!initObj) return null

    // INIT_DATA may be nested: { data: { offerDetail: {...} } }
    const data = initObj.data || initObj
    if (data.offerDetail) return data.offerDetail as InitDataOffer
    if (data.detailData) return data.detailData as InitDataOffer
    // Direct offer object
    if (data.offerId || data.subject || data.title) return data as InitDataOffer
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
  // Real 1688 DOM: attribute items contain concatenated "name+value" text
  // e.g. "款式紧身款", "主面料成分真丝"
  // They are inside [class*="attr"] containers
  const selectors = [
    '[class*="attr"] [class*="item"]',
    '[class*="attr"] li',
    '.obj-attr dl',
    '[class*="attribute"] dl',
    '[class*="attr-list"] li',
    '.detail-attributes-list li',
    '[class*="detail-info"] tr',
  ]

  for (const sel of selectors) {
    const rows = document.querySelectorAll(sel)
    if (rows.length === 0) continue
    rows.forEach((row) => {
      // DL format: <dt>Name</dt><dd>Value</dd>
      const dt = row.querySelector('dt')
      const dd = row.querySelector('dd')
      if (dt && dd) {
        const name = dt.textContent?.trim().replace(/[:：]$/, '') || ''
        const value = dd.textContent?.trim() || ''
        if (name && value) attrs.push({ name, value })
        return
      }
      // TR format
      const cells = row.querySelectorAll('td, th')
      if (cells.length >= 2) {
        const name = cells[0].textContent?.trim().replace(/[:：]$/, '') || ''
        const value = cells[1].textContent?.trim() || ''
        if (name && value) { attrs.push({ name, value }); return }
      }
      // Inline format: child elements with separate name/value
      const children = Array.from(row.children)
      if (children.length >= 2) {
        const name = children[0].textContent?.trim().replace(/[::]$/, '') || ''
        const value = children[1].textContent?.trim() || ''
        if (name && value && name !== value) { attrs.push({ name, value }); return }
      }
      // Last resort: split concatenated text "款式紧身款"
      const text = row.textContent?.trim() || ''
      const attrMatch = text.match(/^([\u4e00-\u9fa5]{2,8})\s*(.+)$/)
      if (attrMatch && attrMatch[1] !== attrMatch[2].trim()) {
        attrs.push({ name: attrMatch[1], value: attrMatch[2].trim() })
      }
    })
    if (attrs.length) break
  }
  return attrs
}

function extractBrand(): string {
  // 1688 products often don't have brand, but check attributes
  const brandEl = document.querySelector('[class*="brand"] a, [class*="brand"] span')
  return brandEl?.textContent?.trim() || ''
}

function extractCategory(): string {
  const crumbs = Array.from(
    document.querySelectorAll('.bread-crumbs a, [class*="breadcrumb"] a, [class*="crumb"] a')
  ).map((a) => a.textContent?.trim()).filter(Boolean)
  return crumbs.join(' > ')
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
  // Real 1688 DOM: description images may be lazy-loaded
  // Try multiple selectors including data-src for lazy loading
  const selectors = [
    '.detail-desc img',
    '[class*="offer-detail"] img',
    '#detail-desc img',
    '.detail-desc-content img',
    '[class*="desc"] img',
  ]
  for (const sel of selectors) {
    const imgs = Array.from(document.querySelectorAll(sel))
      .map((img) => {
        const el = img as HTMLImageElement
        return el.getAttribute('data-src') || el.getAttribute('data-lazy-img') || el.src || ''
      })
      .filter((src) => src && src.startsWith('http') && !src.includes('icon') && !src.includes('logo'))
    if (imgs.length) return [...new Set(imgs)].join('\n')
  }
  return ''
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

  return {
    platform: '1688',
    sourceId: offerId,
    title: extractTitle(initData),
    price: extractPrice(initData),
    oldPrice: extractOldPrice(),
    images: extractImages(initData),
    rating: 0, // 1688 doesn't show public ratings
    reviewCount: 0,
    brand: extractBrand(),
    category: extractCategory(),
    sellerName: extractSellerName(initData),
    sellerUrl: extractSellerUrl(),
    attributes: extractAttributes(initData),
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
    videoUrls: extractVideoUrls(),
    skuList: extractSkus(initData),
    specList: [],
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

  // 1688 search result selectors
  const selectors = [
    '.sm-offer-item',
    '[class*="offer-list"] [class*="item"]',
    '.offer-list-row .item',
    '[class*="card-container"]',
    '[class*="search-result"] [class*="item"]',
  ]

  for (const sel of selectors) {
    const items = document.querySelectorAll(sel)
    if (items.length === 0) continue

    items.forEach((item) => {
      const linkEl = item.querySelector('a[href*="detail.1688.com"]') as HTMLAnchorElement
      if (!linkEl) return

      const href = linkEl.href || ''
      const idMatch = href.match(/\/offer\/(\d+)/)
      if (!idMatch) return
      const sourceId = idMatch[1]
      if (seen.has(sourceId)) return
      seen.add(sourceId)

      const titleEl = item.querySelector('[class*="title"] a, [class*="title"], h4, h3')
      const priceEl = item.querySelector('[class*="price"] [class*="value"], [class*="price"]')
      const imgEl = item.querySelector('img') as HTMLImageElement
      const oldPriceEl = item.querySelector('del, [class*="origin"], [class*="old-price"]')

      cards.push({
        sourceId,
        title: titleEl?.textContent?.trim() || '',
        price: parsePrice(priceEl?.textContent || ''),
        oldPrice: parsePrice(oldPriceEl?.textContent || ''),
        imageUrl: imgEl?.src || imgEl?.getAttribute('data-lazy-img') || '',
        sourceUrl: href,
      })
    })

    if (cards.length > 0) break
  }

  // Fallback: look for all detail links
  if (cards.length === 0) {
    const allLinks = document.querySelectorAll('a[href*="detail.1688.com/offer/"]')
    allLinks.forEach((a) => {
      const href = (a as HTMLAnchorElement).href || ''
      const idMatch = href.match(/\/offer\/(\d+)/)
      if (!idMatch) return
      const sourceId = idMatch[1]
      if (seen.has(sourceId)) return
      seen.add(sourceId)

      // Find container
      let container: HTMLElement | null = a.parentElement
      for (let i = 0; i < 5 && container; i++) {
        if (container.querySelector('img') || container.querySelectorAll('a[href*="detail.1688.com"]').length <= 3) break
        container = container.parentElement
      }
      if (!container) return

      const imgEl = container.querySelector('img') as HTMLImageElement
      const priceEl = container.querySelector('[class*="price"]')

      cards.push({
        sourceId,
        title: a.textContent?.trim() || container.querySelector('[class*="title"]')?.textContent?.trim() || '',
        price: parsePrice(priceEl?.textContent || ''),
        oldPrice: 0,
        imageUrl: imgEl?.src || '',
        sourceUrl: href,
      })
    })
  }

  return cards
}

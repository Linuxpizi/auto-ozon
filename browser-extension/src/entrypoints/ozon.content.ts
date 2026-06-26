import type { ProductAttribute, ScrapedProduct, ListProductSummary } from '@/utils/types'

function getText(selector: string, parent: Element | Document = document): string {
  const el = parent.querySelector(selector)
  return el?.textContent?.trim() || ''
}

function extractSourceId(): string {
  const match = location.pathname.match(/\/(\d+)\/?$/)
  return match?.[1] || ''
}

function extractImages(): string[] {
  const imgs = Array.from(document.querySelectorAll('[data-widget="webGallery"] img'))
    .map((img) => (img as HTMLImageElement).src)
    .filter((src) => src && !src.includes('icon') && !src.includes('logo'))
  // Try higher resolution by replacing wc50 with wc500
  const hd = imgs.map((s) => s.replace(/\/wc\d+\//, '/wc500/'))
  return [...new Set(hd.length ? hd : imgs)].slice(0, 10)
}

function extractPrice(): number {
  // Price span: inside webPrice, NOT line-through, NOT 'С банками' label
  // Pattern: <span class="tsHeadline600Large">2 387 ₽</span>
  const mainPrice = document.querySelector('[data-widget="webPrice"] .tsHeadline600Large')
  if (mainPrice) {
    const text = mainPrice.textContent || ''
    const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
    return match ? parseFloat(match[1].replace(',', '.')) : 0
  }
  // Fallback
  const el = document.querySelector('[data-widget="webPrice"] span[class*="Headline"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

function extractOldPrice(): number {
  // Old price span: inside webPrice, has pdp_bj class pattern (line-through styling)
  // Pattern: <span class="pdp_b0j pdp_bj1 pdp_bj tsBody400Small">4 832 ₽</span>
  const oldEl = document.querySelector('[data-widget="webPrice"] span.pdp_bj')
  if (oldEl) {
    const text = oldEl.textContent || ''
    const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
    return match ? parseFloat(match[1].replace(',', '.')) : 0
  }
  // Fallback: look for any strikethrough-style span inside webPrice
  const spans = document.querySelectorAll('[data-widget="webPrice"] span')
  for (const span of Array.from(spans)) {
    const style = window.getComputedStyle(span)
    if (style.textDecorationLine.includes('line-through')) {
      const text = span.textContent || ''
      const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
      return match ? parseFloat(match[1].replace(',', '.')) : 0
    }
  }
  return 0
}

function extractRating(): number {
  // webReviewProductScore contains rating text like "1 отзыв"
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const match = el.textContent.match(/([\d.]+)/)
    return match ? parseFloat(match[1]) : 0
  }
  // Fallback
  const star = document.querySelector('[class*="rating"], [class*="star"]')
  const match = star?.textContent?.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractReviewCount(): number {
  const el = document.querySelector('[data-widget="webReviewProductScore"]')
  if (el) {
    const text = el.textContent.replace(/\s/g, '')
    const match = text.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }
  return 0
}

function extractBrand(): string {
  // Brand may be in breadcrumb last item or in a data-widget="webBrandName"
  const brandEl = document.querySelector('[data-widget="webBrandName"] a, [data-widget="webBrandName"] span')
  if (brandEl) return brandEl.textContent?.trim() || ''
  // Fallback: look for link to /brand/
  const links = Array.from(document.querySelectorAll('a[href*="/brand/"]'))
  return links[0]?.textContent?.trim() || ''
}

function extractCategory(): string {
  // webBreadcrumb: [Все промышленные товары] [Продукция для дома] [Кухонные аксессуары] [Кухонные приборы для напитков]
  const breadcrumbs = Array.from(
    document.querySelectorAll('[data-widget="webBreadcrumb"] a'),
  )
  const cats = breadcrumbs.map((a) => a.textContent?.trim() || '').filter(Boolean)
  // Return full path (skip first "Все промышленные товары" if present)
  return cats.length > 1 ? cats.slice(1).join(' > ') : cats.join(' > ')
}

function extractSellerName(): string {
  // webMerchantInfo or webBestSeller
  const merchantEl = document.querySelector('[data-widget="webMerchantInfo"] a, [data-widget="webMerchantInfo"] span')
  if (merchantEl) return merchantEl.textContent?.trim() || ''
  // webBestSeller button contains seller name text
  const bestEl = document.querySelector('[data-widget="webBestSeller"] button span')
  if (bestEl) {
    const text = bestEl.textContent?.trim() || ''
    // Remove price numbers from the text, e.g. '520' at the end
    return text.replace(/\d+\s*₽.*$/, '').trim() || text
  }
  return ''
}

function extractAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []
  const charEl = document.querySelector('[data-widget="webCharacteristics"]')
  if (!charEl) return attrs
  // Each attribute is a div with two child divs: label and value
  // Pattern: <div><div>Артикул</div><div>4318333880</div></div>
  const rows = charEl.querySelectorAll('div > div')
  rows.forEach((row) => {
    const children = Array.from(row.children)
    if (children.length >= 2) {
      const name = children[0]?.textContent?.trim() || ''
      const value = children[1]?.textContent?.trim() || ''
      if (name && value && name.length < 100 && value.length < 200) {
        attrs.push({ name, value })
      }
    }
  })
  return attrs
}

function extractDescription(): string {
  const el = document.querySelector('[data-widget="webDescription"]')
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

function scrapeOzonProduct(): ScrapedProduct | null {
  const sourceId = extractSourceId()
  if (!sourceId) return null

  return {
    platform: 'ozon',
    sourceId,
    title:
      getText('h1') ||
      getText('[data-widget="webProductHeading"] span'),
    price: extractPrice(),
    oldPrice: extractOldPrice(),
    images: extractImages(),
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    brand: extractBrand(),
    category: extractCategory(),
    sellerName: extractSellerName(),
    sellerUrl: '',
    attributes: extractAttributes(),
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
  }
}

export default defineContentScript({
  matches: ['*://*.ozon.ru/*'],
  main() {
    const isProductPage =
      /\/\d+\/?$/.test(location.pathname) &&
      location.pathname.split('/').filter(Boolean).length >= 2

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
  },
})

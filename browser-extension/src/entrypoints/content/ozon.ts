import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

function getText(selector: string, parent: Element | Document = document): string {
  const el = parent.querySelector(selector)
  return el?.textContent?.trim() || ''
}

function getAllTexts(selector: string, parent: Element | Document = document): string[] {
  return Array.from(parent.querySelectorAll(selector))
    .map((el) => el.textContent?.trim() || '')
    .filter(Boolean)
}

function extractSourceId(): string {
  const match = location.pathname.match(/\/(\d+)\/?$/)
  return match?.[1] || ''
}

function extractImages(): string[] {
  const imgs = Array.from(document.querySelectorAll('img[src*="cdn"]'))
    .map((img) => (img as HTMLImageElement).src)
    .filter((src) => src.includes('ozon') && !src.includes('icon') && !src.includes('logo'))
  return [...new Set(imgs)].slice(0, 10)
}

function extractPrice(): number {
  const el =
    document.querySelector('[data-widget="webPrice"] [slot="content"]') ||
    document.querySelector('span[class*="tsHeadline550Medium"]') ||
    document.querySelector('[class*="price"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

function extractOldPrice(): number {
  const el = document.querySelector('[class*="tsBody"][class*="lineThrough"]') ||
    document.querySelector('span[class*="lineThrough"]') ||
    document.querySelector('del') ||
    document.querySelector('[data-widget="webPrice"] del')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d[\d,.]*)/)
  return match ? parseFloat(match[1].replace(',', '.')) : 0
}

function extractRating(): number {
  const el = document.querySelector('[data-widget="webReviews"] [class*="star"]') ||
    document.querySelector('span[class*="rating"]') ||
    document.querySelector('[class*="reviewsSummary"] span')
  const text = el?.textContent || ''
  const match = text.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractReviewCount(): number {
  const el = document.querySelector('[data-widget="webReviews"] span:last-child') ||
    document.querySelector('span[class*="reviewsCount"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractBrand(): string {
  const links = Array.from(document.querySelectorAll('a[href*="/brand/"]'))
  return links[0]?.textContent?.trim() || ''
}

function extractCategory(): string {
  const breadcrumbs = Array.from(document.querySelectorAll('[data-widget="webBreadcrumb"] a, nav[aria-label*="bread"] a'))
  const cats = breadcrumbs.map((a) => a.textContent?.trim() || '').filter(Boolean)
  return cats.length > 1 ? cats.slice(1).join(' > ') : cats.join(' > ')
}

function extractSellerName(): string {
  const el = document.querySelector('a[href*="/seller/"]') ||
    document.querySelector('[data-widget="webMerchantInfo"] a') ||
    document.querySelector('[class*="seller"] a')
  return el?.textContent?.trim() || ''
}

function extractAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []
  const rows = document.querySelectorAll('[data-widget="webCharacteristics"] tr, [class*="characteristic"] dl, [class*="spec"] tr')
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td, dt, span')
    if (cells.length >= 2) {
      const name = cells[0]?.textContent?.trim() || ''
      const value = cells[1]?.textContent?.trim() || ''
      if (name && value) attrs.push({ name, value })
    }
  })
  return attrs
}

function extractDescription(): string {
  const el = document.querySelector('[data-widget="webDescription"]') ||
    document.querySelector('[class*="description"]') ||
    document.querySelector('[id*="description"]')
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

export function scrapeOzonProduct(): ScrapedProduct | null {
  const sourceId = extractSourceId()
  if (!sourceId) return null

  return {
    platform: 'ozon',
    sourceId,
    title: getText('h1') || getText('[data-widget="webProductHeading"] span'),
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

export function initOzonContentScript() {
  // 检测是否为商品详情页
  const isProductPage = /\/\d+\/?$/.test(location.pathname) && location.pathname.split('/').filter(Boolean).length >= 2

  if (!isProductPage) return

  // 监听来自 background 的采集指令
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

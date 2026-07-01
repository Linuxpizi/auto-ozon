import type { ProductAttribute, ScrapedProduct } from '@/utils/types'

function extractSourceId(): string {
  const match = location.pathname.match(/\/(\d+)\/?$/)
  return match?.[1] || ''
}

function extractImages(): string[] {
  const imgs = Array.from(document.querySelectorAll('img[src*="basket"]') || document.querySelectorAll('img[src*="wb"]'))
    .map((img) => (img as HTMLImageElement).src)
    .filter((src) => !src.includes('icon') && !src.includes('logo') && !src.includes('svg'))
  return [...new Set(imgs)].slice(0, 10)
}

function extractPrice(): number {
  const el = document.querySelector('[class*="product-page__price"] ins, [class*="price__now"], [class*="price-block__final-price"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractOldPrice(): number {
  const el = document.querySelector('[class*="product-page__price"] del, [class*="price__old"], [class*="price-block__old-price"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractRating(): number {
  const el = document.querySelector('[class*="product-page__rating"] [class*="star"], [class*="rating"] [class*="score"]')
  const text = el?.textContent || ''
  const match = text.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractReviewCount(): number {
  const el = document.querySelector('[class*="product-page__rating"] a, [class*="rating__feedback"]')
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractBrand(): string {
  const el = document.querySelector('[class*="product-page__brand"] a, [class*="brand"] a')
  return el?.textContent?.trim() || ''
}

function extractCategory(): string {
  const breadcrumbs = Array.from(document.querySelectorAll('[class*="breadcrumbs"] a, [class*="breadcrumb"] a'))
  return breadcrumbs.map((a) => a.textContent?.trim() || '').filter(Boolean).join(' > ')
}

function extractSellerName(): string {
  const el = document.querySelector('[class*="seller"] a, [class*="supplier"] a, [class*="shop"] a')
  return el?.textContent?.trim() || ''
}

function extractAttributes(): ProductAttribute[] {
  const attrs: ProductAttribute[] = []
  const rows = document.querySelectorAll('[class*="product-page__params"] tr, [class*="char-list"] tr, [class*="detail-info"] tr')
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    if (cells.length >= 2) {
      const name = cells[0]?.textContent?.trim() || ''
      const value = cells[1]?.textContent?.trim() || ''
      if (name && value) attrs.push({ name, value })
    }
  })
  return attrs
}

function extractDescription(): string {
  const el = document.querySelector('[class*="product-page__description"], [class*="description-text"], [class*="collapsable__text"]')
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

export function scrapeWBProduct(): ScrapedProduct | null {
  const sourceId = extractSourceId()
  if (!sourceId) return null

  return {
    platform: 'wb',
    sourceId,
    title: document.querySelector('[class*="product-page__title"], h1')?.textContent?.trim() || '',
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
    attributes: extractAttributes(),
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
  }
}

export function initWBContentScript() {
  const isProductPage = /\/\d+\/?$/.test(location.pathname)

  if (!isProductPage) return

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'scrape') {
      const product = scrapeWBProduct()
      sendResponse({ success: !!product, data: product })
      return true
    }
    if (message.action === 'checkPage') {
      sendResponse({ isProductPage: true, platform: 'wb' })
      return true
    }
  })
}

import type { ProductVariant, ScrapedProduct } from '@/lib/utils/types'
import { injectFloatingButton } from '@/lib/utils/floating-button'

function extractSourceId(): string {
  const match = location.pathname.match(/\/(\d+)\/?$/)
  return match?.[1] || ''
}

function extractImages(): string[] {
  const imgs = Array.from(
    document.querySelectorAll('img[src*="basket"]') ||
      document.querySelectorAll('img[src*="wb"]'),
  )
    .map((img) => (img as HTMLImageElement).src)
    .filter(
      (src) =>
        !src.includes('icon') && !src.includes('logo') && !src.includes('svg'),
    )
  return [...new Set(imgs)].slice(0, 10)
}

function extractPrice(): number {
  const el = document.querySelector(
    '[class*="product-page__price"] ins, [class*="price__now"], [class*="price-block__final-price"]',
  )
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractOldPrice(): number {
  const el = document.querySelector(
    '[class*="product-page__price"] del, [class*="price__old"], [class*="price-block__old-price"]',
  )
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractRating(): number {
  const el = document.querySelector(
    '[class*="product-page__rating"] [class*="star"], [class*="rating"] [class*="score"]',
  )
  const text = el?.textContent || ''
  const match = text.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

function extractReviewCount(): number {
  const el = document.querySelector(
    '[class*="product-page__rating"] a, [class*="rating__feedback"]',
  )
  const text = el?.textContent || ''
  const match = text.replace(/\s/g, '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractBrand(): string {
  const el = document.querySelector(
    '[class*="product-page__brand"] a, [class*="brand"] a',
  )
  return el?.textContent?.trim() || ''
}

function extractCategory(): string {
  const breadcrumbs = Array.from(
    document.querySelectorAll(
      '[class*="breadcrumbs"] a, [class*="breadcrumb"] a',
    ),
  )
  return breadcrumbs
    .map((a) => a.textContent?.trim() || '')
    .filter(Boolean)
    .join(' > ')
}

function extractSellerName(): string {
  const el = document.querySelector(
    '[class*="seller"] a, [class*="supplier"] a, [class*="shop"] a',
  )
  return el?.textContent?.trim() || ''
}

function extractDescription(): string {
  const el = document.querySelector(
    '[class*="product-page__description"], [class*="description-text"], [class*="collapsable__text"]',
  )
  return el?.textContent?.trim()?.slice(0, 2000) || ''
}

function extractWbData(): Record<string, any> | null {
  const state = (window as any).__PRELOADED_STATE__ || (window as any).__INITIAL_STATE__
  if (state && typeof state === 'object') return state
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || '')
      if (parsed?.sku || parsed?.offers) return parsed
    } catch {}
  }
  return null
}

function extractVariants(): ProductVariant[] {
  const data = extractWbData()
  const sizes = data?.product?.sizes || data?.sizes || data?.offers?.offers || []
  if (!Array.isArray(sizes)) return []
  return sizes.flatMap((item: any) => {
    const sku = String(item?.optionId || item?.sku || item?.id || '').trim()
    const size = String(item?.name || item?.origName || item?.size || '').trim()
    if (!sku || !size) return []
    return [{
      sku,
      ...(item?.barcode ? { barcode: String(item.barcode) } : {}),
      values: [{ name: 'Размер', value: size }],
      ...(Number.isFinite(Number(item?.price?.product)) ? { price: Number(item.price.product) / 100 } : {}),
      ...(Number.isFinite(Number(item?.qty)) ? { stock: Number(item.qty) } : {}),
    }]
  })
}

function scrapeWBProduct(): ScrapedProduct | null {
  const sourceId = extractSourceId()
  if (!sourceId) return null

  const variants = extractVariants()
  return {
    platform: 'wb',
    sourceId,
    currency: 'RUB',
    title:
      document.querySelector(
        '[class*="product-page__title"], h1',
      )?.textContent?.trim() || '',
    price: extractPrice(),
    oldPrice: extractOldPrice(),
    images: extractImages(),
    skuList: variants.map((variant) => ({ sku: variant.sku, barcode: variant.barcode || '' })),
    variants,
    specList: [],
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    brand: extractBrand(),
    category: extractCategory(),
    sellerName: extractSellerName(),
    sellerUrl: '',
    description: extractDescription(),
    sourceUrl: location.href,
    scrapedAt: new Date().toISOString(),
  }
}

export default defineContentScript({
  matches: ['*://*.wildberries.ru/*'],
  main() {
    const isProductPage = /\/\d+\/?$/.test(location.pathname)
    if (!isProductPage) return

    // ── 注入悬浮采集按钮 (商品详情页) ──
    injectFloatingButton(async () => {
      const product = scrapeWBProduct()
      if (!product) throw new Error('采集失败: 无法提取商品信息')
      const result = await browser.runtime.sendMessage({ action: 'productScraped', data: product })
      if (!result?.success) throw new Error(result?.error || '上报失败')
    })

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'scrape') {
        try {
          const product = scrapeWBProduct()
          sendResponse({
            success: !!product,
            data: product,
            error: product ? '' : '未找到 Wildberries 商品 ID 或商品详情数据',
          })
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return true
      }
      if (message.action === 'checkPage') {
        sendResponse({ isProductPage: true, platform: 'wb' })
        return true
      }
    })
  },
})

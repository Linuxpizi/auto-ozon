import { extractSkuFromProductHref, findListingProductLinks } from '../ozonList/listPageScanner'
import type { CrawlProductRecord } from './types'
import { addCrawlLog, updateCrawlProductImageBase64, upsertCrawlProduct } from './crawlStorage'
import { fetchCrawlImageAsBase64 } from './crawlImageFetch'

const pendingImageSkus = new Set<string>()

/** 「从当前视口开始」：文档 Y 坐标下限，整次任务内持续过滤该位置以上的商品 */
let viewportMinDocTop: number | null = null

function getPageScrollTop(): number {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function anchorDocTop(anchor: HTMLAnchorElement): number {
  return anchor.getBoundingClientRect().top + getPageScrollTop()
}

export function resetCrawlScannerState(): void {
  pendingImageSkus.clear()
  viewportMinDocTop = null
}

export function clearViewportCrawl(): void {
  viewportMinDocTop = null
}

/** 记录视口起始文档位置，后续每次扫描只采该位置及以下的商品 */
export function beginViewportCrawl(): void {
  const scrollTop = getPageScrollTop()
  let minDocTop = scrollTop

  for (const anchor of findListingProductLinks()) {
    const rect = anchor.getBoundingClientRect()
    if (rect.top >= 0 && rect.bottom > 0) {
      const docTop = rect.top + scrollTop
      if (docTop < minDocTop) minDocTop = docTop
    }
  }

  viewportMinDocTop = minDocTop
}

function scheduleImageDownload(record: CrawlProductRecord) {
  if (!record.imageUrl || pendingImageSkus.has(record.sku)) return
  pendingImageSkus.add(record.sku)
  void fetchCrawlImageAsBase64(record.imageUrl)
    .then((base64) => {
      if (base64) updateCrawlProductImageBase64(record.sku, base64)
    })
    .finally(() => {
      pendingImageSkus.delete(record.sku)
    })
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildListingProductUrl(href: string): string {
  const trimmed = String(href || '').trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed.split('?')[0]
  const origin = /ozon\.kz/i.test(window.location.hostname)
    ? 'https://www.ozon.kz'
    : 'https://www.ozon.ru'
  return trimmed.startsWith('/') ? origin + trimmed : `${origin}/${trimmed}`
}

function readPriceSpans(anchor: HTMLAnchorElement): string[] {
  const nextDiv = anchor.nextElementSibling as HTMLElement | null
  if (!nextDiv) return ['', '', '']

  const spans = nextDiv.querySelectorAll('div > div > div > span')
  return [0, 1, 2].map((i) => spans[i]?.textContent?.trim() || '')
}

function readRatingReview(anchor: HTMLAnchorElement, host: HTMLElement): { rating: string; reviewCount: string } {
  let rating = ''
  let reviewCount = ''

  const boldDivs = host.querySelectorAll('div.tsBodyMBold')
  const scope = boldDivs.length
    ? host
    : anchor.closest('.tile-root') || host

  if (boldDivs.length) {
    const children = scope.querySelectorAll('div.tsBodyMBold > span')
    rating = children[0]?.textContent?.replace(/\D+/g, '') || ''
    reviewCount = children[1]?.textContent?.replace(/\D+/g, '') || ''
    return { rating, reviewCount }
  }

  scope.querySelectorAll('span.tsBodyControl300XSmall').forEach((el) => {
    const t = el.textContent?.trim() || ''
    if (!rating && /^[0-5]([.,]\d)?$/.test(t)) {
      rating = t.replace(/\D+/g, '')
    } else if (!reviewCount && /^\d/.test(t) && !/^[0-5]([.,]\d)?$/.test(t)) {
      reviewCount = t.replace(/\D+/g, '')
    }
  })

  return { rating, reviewCount }
}

function parseProductFromAnchor(anchor: HTMLAnchorElement): CrawlProductRecord | null {
  const href = anchor.getAttribute('href') || anchor.href
  const sku = extractSkuFromProductHref(href)
  if (!sku) return null

  const host = anchor.parentElement
  if (!host) return null

  const title =
    host.querySelector('span.tsBody500Medium')?.textContent?.trim() ||
    anchor.querySelector('span')?.textContent?.trim() ||
    ''

  const imageUrl = anchor.querySelector('img')?.getAttribute('src') || ''
  const [price, originalPrice, discount] = readPriceSpans(anchor)

  const sectionText = anchor.querySelector('div > section')?.textContent?.trim() || ''
  const hasPointsReview = sectionText.includes('баллов за отзыв')

  const promoJoined = !hasPointsReview && sectionText ? '参加' : '未参加'
  const promoName = !hasPointsReview ? sectionText : ''
  const promoStock =
    anchor.nextElementSibling?.children?.[1]?.textContent?.replace(/\D+/g, '') || ''

  const { rating, reviewCount } = readRatingReview(anchor, host)
  const pointsReview = hasPointsReview ? sectionText : ''
  const brandCert =
    host.querySelector('div.tsBodyM span.p6b17')?.textContent?.trim() || ''

  return {
    sku,
    title,
    imageUrl,
    productUrl: buildListingProductUrl(href),
    price,
    originalPrice,
    discount,
    promoJoined,
    promoName,
    promoStock,
    rating,
    reviewCount,
    pointsReview,
    brandCert,
  }
}

/** 扫描当前视口内列表商品并写入存储，返回本轮新增数量 */
export function scanVisibleListingProducts(): number {
  let links = findListingProductLinks()
  if (viewportMinDocTop != null) {
    links = links.filter((anchor) => anchorDocTop(anchor) >= viewportMinDocTop! - 1)
  }
  let added = 0

  for (const anchor of links) {
    const record = parseProductFromAnchor(anchor)
    if (!record) continue
    if (upsertCrawlProduct(record)) {
      added += 1
      scheduleImageDownload(record)
      // 对齐旧插件：超过 45 字符截断 + "..."，再转义防 HTML 注入
      const rawTitle = record.title || '未命名商品'
      const cutTitle = rawTitle.length > 45 ? rawTitle.substring(0, 45) + '...' : rawTitle
      const safeTitle = escapeHtml(cutTitle)
      const safeSku = escapeHtml(record.sku)
      addCrawlLog(
        `商品名称:${safeTitle} <span style="color:rgba(148,163,184,0.7)">SKU:${safeSku}</span>`,
        'success',
      )
    }
  }

  return added
}

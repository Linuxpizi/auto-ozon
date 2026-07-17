import type { OzonListProductItem } from './types'
import { resolveListCardScope } from './listCardLayout'

const CARD_SELECTOR = '.mjgd_ozon_sku_card, .e1fbcs'

/** 从商品链接 href 提取 SKU 数字 ID */
export function extractSkuFromProductHref(href: string): string | null {
  const clean = String(href || '').split('?')[0]
  const m = clean.match(/(\d{7,})\/?$/)
  return m?.[1] ?? null
}

/** 列表页商品链接收集（对齐旧版 getListingProductLinks） */
export function findListingProductLinks(): HTMLAnchorElement[] {
  const url = window.location.href
  const selectorGroups: string[] = []

  if (url.includes('/seller')) {
    selectorGroups.push(
      'div[data-widget="shopInShopContainer"] a[href*="product"]',
      'div:not([data-widget="skuGrid"]) a[href*="product"]',
    )
  } else if (url.includes('category')) {
    selectorGroups.push(
      'div[data-widget="megaPaginator"] a[href*="product"]',
      'div[data-widget="searchResultsV2"] a[href*="product"]',
      'div[data-widget="container"] a[href*="product"]',
      'div[data-widget="infiniteVirtualPaginator"] a[href*="product"]',
    )
  } else {
    selectorGroups.push('div:not([data-widget="skuGrid"]) a[href*="product"]')
  }

  const seen = new Set<string>()
  const result: HTMLAnchorElement[] = []

  for (const sel of selectorGroups) {
    document.querySelectorAll<HTMLAnchorElement>(sel).forEach((anchor) => {
      if (anchor.closest('[data-widget="skuGrid"]')) return
      if (!anchor.querySelector('img')) return
      const href = anchor.href?.split('?')[0]
      if (!href || !href.includes('product')) return
      if (seen.has(href)) return
      seen.add(href)
      result.push(anchor)
    })
    if (result.length > 1) break
  }

  return result
}

function readPriceTextFromHost(host: HTMLElement): string {
  const priceEl =
    host.querySelector('span.pdp_fb1 .tsHeadline500Medium') ||
    host.querySelector('.tsHeadline500Medium')
  if (priceEl?.textContent) return priceEl.textContent.trim()

  const symbols = ['₽', '¥', '$']
  for (const span of host.querySelectorAll('span')) {
    const t = span.textContent || ''
    if (symbols.some((s) => t.includes(s))) return t.trim()
  }
  return ''
}

/** 将商品链接转为待处理商品项（跳过已贴卡） */
function collectItemsFromLinks(links: HTMLAnchorElement[]): OzonListProductItem[] {
  const items: OzonListProductItem[] = []

  for (const anchor of links) {
    const sku = extractSkuFromProductHref(anchor.href)
    if (!sku) continue
    const host = anchor.parentElement
    if (!host) continue
    const scope = resolveListCardScope(anchor)
    if (!scope) continue
    if (scope.querySelector(CARD_SELECTOR)) continue

    const img = anchor.querySelector('img')?.getAttribute('src') || undefined
    items.push({
      sku,
      href: anchor.href,
      anchor,
      host,
      img,
      priceText: readPriceTextFromHost(host),
    })
  }

  return items
}

/** 将页面链接转为待处理商品项（跳过已贴卡） */
export function collectPendingListItems(): OzonListProductItem[] {
  return collectItemsFromLinks(findListingProductLinks())
}

/** 详情 shelf SKU 提取（对齐旧版 eqf.match(/(?<=[-\/])\d{7,100}/g)?.[0]） */
function extractShelfSkuFromHref(href: string): string | null {
  const m = String(href || '').match(/(?<=[-\/])\d{7,100}/g)
  return m?.[0] ?? null
}

/** 对齐旧版 eqdiv.children(".e1fbcs").length <= 0：仅检查 host 直接子节点是否已有卡片 */
function hostHasDirectCard(host: HTMLElement): boolean {
  return Array.from(host.children).some(
    (child) =>
      child.classList.contains('mjgd_ozon_sku_card') ||
      child.classList.contains('e1fbcs'),
  )
}

/** 详情页下方「相似商品」网格链接（对齐旧版 skuShelfGoods 选择器） */
export function findDetailShelfProductLinks(): HTMLAnchorElement[] {
  const hrefs: string[] = []
  const result: HTMLAnchorElement[] = []

  document
    .querySelectorAll<HTMLAnchorElement>('div[data-widget="skuShelfGoods"] a[href*="product"]')
    .forEach((anchor) => {
      if (anchor.closest('[data-widget="skuGrid"]')) return
      if (!anchor.querySelector('img')) return
      const eqf = anchor.getAttribute('href') || anchor.href || ''
      if (eqf.length <= 5 || !eqf.includes('product')) return
      if (hrefs.indexOf(eqf) > -1) return
      hrefs.push(eqf)
      result.push(anchor)
    })

  return result
}

/** 详情页「相似商品」待处理项（对齐旧版 loadDatas 详情分支 skuShelfGoods 贴卡） */
export function collectPendingShelfItems(): OzonListProductItem[] {
  const items: OzonListProductItem[] = []
  const hrefs: string[] = []

  document
    .querySelectorAll<HTMLAnchorElement>('div[data-widget="skuShelfGoods"] a[href*="product"]')
    .forEach((anchor) => {
      if (anchor.closest('[data-widget="skuGrid"]')) return
      if (!anchor.querySelector('img')) return

      const eqf = anchor.getAttribute('href') || anchor.href || ''
      if (eqf.length <= 5) return
      if (hrefs.indexOf(eqf) > -1) return
      hrefs.push(eqf)

      const sku = extractShelfSkuFromHref(eqf)
      if (!sku) return

      const host = anchor.parentElement
      if (!host) return
      if (hostHasDirectCard(host)) return

      const img = host.querySelector('img')?.getAttribute('src') || undefined
      items.push({
        sku,
        href: anchor.href,
        anchor,
        host,
        img,
        priceText: readPriceTextFromHost(host),
      })
    })

  return items
}

/** 卡片是否已注入 */
export function hasSkuCard(host: HTMLElement): boolean {
  return !!host.querySelector(CARD_SELECTOR)
}

/** 收集当前列表页全部 SKU（含已贴卡），供 MP 表格等全量统计 */
export function collectAllListSkuRefs(): Array<{ sku: string; img?: string }> {
  const seen = new Set<string>()
  const out: Array<{ sku: string; img?: string }> = []
  for (const anchor of findListingProductLinks()) {
    const sku = extractSkuFromProductHref(anchor.href)
    if (!sku || seen.has(sku)) continue
    seen.add(sku)
    const img = anchor.querySelector('img')?.getAttribute('src') || undefined
    out.push({ sku, img })
  }
  return out
}

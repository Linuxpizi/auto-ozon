import { extractSkuFromProductHref, findListingProductLinks } from '../ozonList/listPageScanner'
import { showToast } from '../../../utils/toast'

function normalizePriceText(text: string): string {
  return text.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.]/g, '')
}

function readPriceFromHost(host: HTMLElement): string {
  const headline = host.querySelector('span.tsHeadline500Medium')?.textContent?.trim()
  if (headline) return normalizePriceText(headline)

  const priceEl =
    host.querySelector('span.pdp_fb1 .tsHeadline500Medium') ||
    host.querySelector('.tsHeadline500Medium')
  if (priceEl?.textContent) return normalizePriceText(priceEl.textContent)

  for (const span of host.querySelectorAll('span')) {
    const t = span.textContent || ''
    if (['₽', '¥', '$', '₸'].some((s) => t.includes(s))) {
      return normalizePriceText(t)
    }
  }
  return ''
}

/** 复制当前页 SKU,价格 列表（对齐旧版 #shopCrawl） */
export async function copyListingSkuPriceFormat(): Promise<void> {
  const links = findListingProductLinks()
  const lines: string[] = []

  for (const anchor of links) {
    const sku = extractSkuFromProductHref(anchor.href)
    if (!sku) continue
    const host = anchor.parentElement
    if (!host) continue
    const price = readPriceFromHost(host)
    if (!price) continue
    lines.push(`${sku},${price}`)
  }

  if (!lines.length) {
    showToast('当前页面未找到可复制的商品', 3000)
    return
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    showToast(`已复制 ${lines.length} 条商品数据`, 3000)
  } catch {
    showToast('复制失败，请检查浏览器权限', 3000)
  }
}

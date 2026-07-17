import { extractSkuFromProductHref, findListingProductLinks } from '../ozonList/listPageScanner'
import { getAccumulatedListSkuRows } from '../ozonList/listSkuAccumulator'
import type { QuickShelveSkuRow } from './types'

export function readTitleFromHost(host: HTMLElement): string {
  return (
    host.querySelector('span.tsBody500Medium')?.textContent?.trim() ||
    host.querySelector('a span')?.textContent?.trim() ||
    ''
  )
}

function readPriceFromHost(host: HTMLElement): string {
  for (const span of host.querySelectorAll('span')) {
    const t = span.textContent || ''
    if (['₽', '¥', '$', '₸'].some((s) => t.includes(s))) return t.trim()
  }
  return ''
}

function readSalesFromHost(host: HTMLElement): string {
  const monthlyText = host.querySelector('span.monthsales')?.textContent?.trim() || ''
  if (monthlyText) {
    const m = monthlyText.match(/(\d+(?:[.,]\d+)?)/)
    if (m) return `销量:${m[1]}`
  }
  return '销量:0'
}

/**
 * 列表页：收集可上架 SKU 行。
 * 先取常驻累加器（含已滚出视口、DOM 已卸载的历史商品，突破 Ozon 虚拟滚动 ~40 的限制，
 * 对齐旧版 C.skus），再补当前 DOM 里可见但累加器尚未记录的商品（未贴卡/竞态等边界）。
 */
export function collectListPageSkuRows(): QuickShelveSkuRow[] {
  const rows: QuickShelveSkuRow[] = []
  const seen = new Set<string>()

  // 1. 累加器（随滚动增长，不受当前 DOM 挂载数量限制）
  for (const row of getAccumulatedListSkuRows()) {
    if (seen.has(row.sku)) continue
    seen.add(row.sku)
    rows.push(row)
  }

  // 2. 补充当前 DOM 里可见但累加器还没记录的商品
  for (const anchor of findListingProductLinks()) {
    const sku = extractSkuFromProductHref(anchor.href)
    if (!sku || seen.has(sku)) continue
    seen.add(sku)
    const host = anchor.parentElement
    if (!host) continue
    rows.push({
      sku,
      title: readTitleFromHost(host) || sku,
      image: anchor.querySelector('img')?.getAttribute('src') || '',
      price: readPriceFromHost(host),
      originalPrice: '',
      salePrice: '',
      goodsNo: '',
      sales: readSalesFromHost(host),
      createdAt: '',
    })
  }

  return rows
}

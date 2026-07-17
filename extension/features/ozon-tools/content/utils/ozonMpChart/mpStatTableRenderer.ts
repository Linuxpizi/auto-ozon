import { resolveAssetUrl } from '../../../utils/runtime'
import fallbackLogo from '../../../assets/img/newlogo.png'

const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogo)

export interface MpStatTableRow {
  rank: number
  sku: string
  brand: string
  price: string
  stock: string
  revenue30: string
  orders: string
  rating: string
  reviews: string
  promo: string
  image?: string
}

export interface MpStatTableItem {
  Sku?: string | number
  Brand?: string
  Count?: number | string
  Totals?: { sum?: number | string; orders?: number | string }
}

function escapeHtml(text: unknown): string {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: unknown): string {
  return escapeHtml(text)
}

function formatRubSum(sum: unknown): string {
  if (sum == null || sum === '') return '—'
  return `${String(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

function skuImageFromMap(sku: string, imgMap: Map<string, string>): string {
  const key = String(sku || '').trim()
  if (!key || key === '—') return ''
  return imgMap.get(key) || ''
}

function apiItemToRow(
  item: MpStatTableItem | null,
  rank: number,
  skuKey: string,
  imgMap: Map<string, string>,
): MpStatTableRow {
  if (!item || typeof item !== 'object') {
    return {
      rank,
      sku: String(skuKey || '—'),
      brand: '—',
      price: '0 ₽',
      stock: '—',
      revenue30: '—',
      orders: '—',
      rating: '0',
      reviews: '—',
      promo: '—',
      image: skuImageFromMap(String(skuKey), imgMap),
    }
  }
  const totals = item.Totals && typeof item.Totals === 'object' ? item.Totals : {}
  const skuVal = item.Sku != null ? String(item.Sku) : String(skuKey || '—')
  const brand =
    item.Brand != null && String(item.Brand).trim() !== '' ? String(item.Brand) : '—'
  return {
    rank,
    sku: skuVal,
    brand,
    price: '0 ₽',
    stock: item.Count != null ? String(item.Count) : '—',
    revenue30: formatRubSum(totals.sum),
    orders: totals.orders != null ? String(totals.orders) : '—',
    rating: '0',
    reviews: '—',
    promo: '—',
    image: skuImageFromMap(skuVal, imgMap),
  }
}

function buildRowHtml(row: MpStatTableRow): string {
  const imgRaw = row.image?.trim() || ''
  const thumb = imgRaw
    ? `<img src="${escapeAttr(imgRaw)}" alt="" loading="lazy" class="mjgd_ozon_mpstat_thumb" />`
    : ''
  return `<tr class="mjgd_ozon_mpstat_tr">
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_rank">${escapeHtml(row.rank)}</td>
    <td class="mjgd_ozon_mpstat_td">${thumb}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_sku">${escapeHtml(row.sku)}</td>
    <td class="mjgd_ozon_mpstat_td">${escapeHtml(row.brand)}</td>
    <td class="mjgd_ozon_mpstat_td">${escapeHtml(row.price)}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_num">${escapeHtml(row.stock)}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_num">${escapeHtml(row.revenue30)}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_num">${escapeHtml(row.orders)}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_center">${escapeHtml(row.rating)}</td>
    <td class="mjgd_ozon_mpstat_td mjgd_ozon_mpstat_td_num">${escapeHtml(row.reviews)}</td>
    <td class="mjgd_ozon_mpstat_td">${escapeHtml(row.promo)}</td>
  </tr>`
}

function tableShellOpen(): string {
  const headers = ['#', '图片', 'SKU', '品牌', '价格', '库存', '30天销售额', '订单', '评分', '评价数', '促销']
  const thHtml = headers.map((h) => `<th class="mjgd_ozon_mpstat_th">${escapeHtml(h)}</th>`).join('')
  return `<div id="mjgd_ozon_mpstat_root" class="mjgd_ozon_mpstat_root">
    <div class="mjgd_ozon_mpstat_head">
      <img src="${escapeAttr(logoUrl)}" width="22" height="22" alt="" class="mjgd_ozon_mpstat_logo" />
      <span class="mjgd_ozon_mpstat_brand">Auto Ozon</span>
    </div>
    <div class="mjgd_ozon_mpstat_scroll">
      <table class="mjgd_ozon_mpstat_table">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>`
}

function tableShellClose(rowCount: number): string {
  return `</tbody></table></div>
    <div class="mjgd_ozon_mpstat_foot">
      <span>第 1–${rowCount} 条，共 ${rowCount} 条</span>
    </div>
  </div>`
}

function extractItemsFromResponse(data: unknown): Record<string, MpStatTableItem> {
  const payload = (data as { data?: unknown })?.data ?? data
  if (!payload || typeof payload !== 'object') return {}
  const obj = payload as Record<string, unknown>
  if (obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) {
    return obj.items as Record<string, MpStatTableItem>
  }
  const items: Record<string, MpStatTableItem> = {}
  Object.keys(obj).forEach((k) => {
    if (k === 'code' || k === 'days' || k === 'msg' || k === 'items') return
    const v = obj[k]
    if (v && typeof v === 'object' && ((v as MpStatTableItem).Totals != null || (v as MpStatTableItem).Sku != null)) {
      items[k] = v as MpStatTableItem
    }
  })
  return items
}

export function buildMpStatTableHtml(
  res: { data?: unknown },
  imgMap: Map<string, string>,
): string {
  const itemsObj = extractItemsFromResponse(res)
  const keys = Object.keys(itemsObj)
  const rows = keys
    .map((k, i) => buildRowHtml(apiItemToRow(itemsObj[k], i + 1, k, imgMap)))
    .join('')
  return tableShellOpen() + rows + tableShellClose(keys.length)
}

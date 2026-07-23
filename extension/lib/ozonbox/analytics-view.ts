import { isRecord } from './contract'
import { normalizeAnalyticsItem, type OzonboxAnalyticsItem } from './seller-analytics'

export type OzonboxAnalyticsCardType = 'lite' | 'detail'

type Formatter = (value: unknown, item: OzonboxAnalyticsItem) => string

interface AnalyticsField {
  label: string
  keys: readonly string[]
  format?: Formatter
  metricClass?: string
}

export function buildAnalyticsDoc(type: OzonboxAnalyticsCardType, logoUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#fff}
    .card{border:1px solid #e6eef7;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.12);overflow:hidden}
    .header{display:flex;align-items:center;gap:9px;padding:10px 12px;background:#fff}.logo{width:28px;height:28px;object-fit:contain;border-radius:7px}.title{font-size:14px;color:#4242a8;font-weight:700;letter-spacing:.1px}
    .status-bar{display:flex;align-items:center;gap:8px;padding:8px 12px}.status{font-size:13px;color:#666;flex:1;min-width:0}
    .list{display:flex;flex-direction:column;gap:3px;padding:0 10px 10px}.item{display:flex;align-items:baseline;justify-content:flex-start;gap:6px;font-size:13px;line-height:1.3}
    .label{color:#666;white-space:nowrap;min-width:86px}.value{color:#1a73e8;font-weight:600;word-break:break-word;text-align:left;flex:1}.metric-sales .value{color:#ff6b00}.metric-ads .value{color:#16a34a}
  </style></head><body><div class="card"><div class="header"><img class="logo" src="${logoUrl}" alt="鲸智 AI"><div class="title">鲸智 AI</div></div>
  <div class="status-bar"><div class="status" id="status">${type === 'detail' ? '加载中...' : '等待数据...'}</div></div>
  <div class="list" id="metrics" style="display:none"></div></div></body></html>`
}

function iframeDocument(iframe: HTMLIFrameElement): Document | null {
  return iframe.contentDocument ?? iframe.contentWindow?.document ?? null
}

function adjustHeight(iframe: HTMLIFrameElement): void {
  const body = iframeDocument(iframe)?.body
  if (body?.scrollHeight) iframe.height = String(body.scrollHeight)
}

function formatNumber(value: unknown): string {
  const number = Number(value)
  return Number.isNaN(number) ? String(value) : number.toLocaleString('ru-RU')
}

function formatPercent(value: unknown): string {
  const number = Number(value)
  if (Number.isNaN(number)) return String(value)
  return `${number <= 1 ? (number * 100).toFixed(2) : number.toFixed(2)}%`
}

function formatPercentSmart(value: unknown): string {
  const number = Number(value)
  if (Number.isNaN(number)) return String(value)
  if (number <= 1) return `${(number * 100).toFixed(2)}%`
  if (number <= 100) return `${number.toFixed(2)}%`
  if (number <= 10000) return `${(number / 100).toFixed(2)}%`
  return `${number.toFixed(2)}%`
}

function formatCurrency(value: unknown): string {
  const number = Number(value)
  return Number.isNaN(number) ? String(value) : `${formatNumber(number)} ₽`
}

function formatAveragePrice(value: unknown): string {
  return `${String(value).trim()} ₽`
}

function formatMeasure(value: unknown): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return String(Math.round(number * 10) / 10)
}

function formatDimension(value: unknown): string {
  if (!isRecord(value)) return String(value)
  const length = value.length ?? value.l ?? value.L
  const width = value.width ?? value.w ?? value.W
  const height = value.height ?? value.h ?? value.H
  if (length === undefined && width === undefined && height === undefined) return String(value)
  return [
    length == null ? null : `长度: ${formatMeasure(length)}mm`,
    width == null ? null : `宽度：${formatMeasure(width)}mm`,
    height == null ? null : `高度：${formatMeasure(height)}mm`,
  ].filter((part): part is string => part !== null).join(' ')
}

function formatWeight(value: unknown): string {
  const text = String(value).trim()
  return /(?:g|г)$/i.test(text) ? text : `${formatMeasure(value)}g`
}

function formatDate(value: unknown, item: OzonboxAnalyticsItem): string {
  const numericValue = typeof value === 'number' ? value : Number.NaN
  const date = typeof value === 'number'
    ? new Date(numericValue < 1e12 ? numericValue * 1000 : numericValue)
    : new Date(String(value))
  const dateText = Number.isNaN(date.getTime())
    ? String(value)
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? value.slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const explicitDays = item.daysInStock ?? item.days_in_stock ?? item.stockDays
  const explicitDaysNumber = Number(explicitDays)
  if (explicitDays !== undefined && explicitDays !== null && explicitDays !== ''
    && Number.isFinite(explicitDaysNumber) && explicitDaysNumber >= 0) {
    return `${dateText}（${formatNumber(explicitDaysNumber)}天）`
  }
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) return dateText
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  return `${dateText}（${formatNumber(elapsedDays)}天）`
}

const FIELDS: readonly AnalyticsField[] = [
  { label: '类目', keys: ['categoryName'] },
  { label: 'rFBS佣金', keys: ['rfbsCommission', 'rfbs_fee', 'commissionRfbs', 'rfbsPercent'], format: formatPercentSmart },
  { label: 'SKU', keys: ['sku', 'skuName'] },
  { label: '品牌', keys: ['brand', 'brandName'] },
  { label: '月销量', keys: ['sumOrders', 'orders', 'sum_orders', 'sales', 'soldCount'], format: formatNumber, metricClass: 'metric-sales' },
  { label: '月销售额', keys: ['sumGmv', 'gmv', 'sum_gmv', 'sumGmvRub', 'soldSum'], format: formatCurrency },
  { label: '平均价格', keys: ['avgprice'], format: formatAveragePrice },
  { label: '月周转动态', keys: ['gmvGrowthRate', 'salesGrowth', 'growthRate', 'salesDynamics'], format: formatPercent },
  { label: '日销量', keys: ['avgOrdersPerDay', 'ordersPerDay', 'avgOrdersOnAccDays'], format: formatNumber },
  { label: '日销售额', keys: ['avgGmvPerDay', 'gmvPerDay', 'avgGmvOnAccDays'], format: formatCurrency },
  { label: '广告费占比', keys: ['drr', 'adsShare', 'ads_share', 'adShare', 'ad_share', 'adsRevenueShare'], format: formatPercentSmart, metricClass: 'metric-ads' },
  { label: '参与促销天数', keys: ['daysInPromo', 'promoDays', 'promo_days'], format: formatNumber },
  { label: '参与促销折扣', keys: ['discount', 'promoDiscount', 'discountPercent'], format: formatPercentSmart },
  { label: '促销活动转化率', keys: ['promoConversionRate', 'promoConvRate', 'promoRate'], format: formatPercentSmart },
  { label: '付费推广天数', keys: ['daysWithTrafarets', 'paidPromoDays', 'trafaretDays'], format: formatNumber },
  { label: '商品卡浏览量', keys: ['qtyViewPdp', 'hits_view_pdp', 'pdpViews', 'pdpViewCount'], format: formatNumber },
  { label: '商品卡加购率', keys: ['cardCartConversionRate', 'cardCartRate', 'pdpToCartConversion', 'conv_tocart_pdp'], format: formatPercentSmart },
  { label: '搜索目录浏览量', keys: ['searchImpressions', 'qtySearchImpressions', 'sessionCountSearch', 'hits_view_search'], format: formatNumber },
  { label: '搜索目录加购率', keys: ['searchCartConversionRate', 'searchCartRate', 'convToCartSearch', 'conv_tocart_search'], format: formatPercentSmart },
  { label: '展示转化率', keys: ['orderConversionRate', 'conversionRate', 'convViewToOrder', 'conversion'], format: formatPercentSmart },
  { label: '商品点击率', keys: ['clickRate', 'ctr', 'conv_view_to_click'], format: formatPercentSmart },
  { label: '发货模式', keys: ['sellSchema', 'saleSchema', 'sellModel', 'salesSchema'] },
  { label: '退货取消率', keys: ['returnCancelRate', 'cancellationRate', 'returnsRate', 'cancelRate'], format: formatPercentSmart },
  { label: '体积', keys: ['volume', 'volumeLiters', 'volume_l'], format: formatNumber },
  { label: '长 宽 高', keys: ['dimension_mm'], format: formatDimension },
  { label: '重量', keys: ['weight_g'], format: formatWeight },
  { label: '上架时间', keys: ['createDate', 'createdAt', 'dateInStock', 'nullableCreateDate'], format: formatDate },
  { label: '跟卖列表', keys: ['companyCountRange', 'sellerCount', 'competingSellerCount', 'competitorCount'], format: (value) => `${formatNumber(value)}个卖家` },
  { label: '跟卖最高价', keys: ['maxSellerPrice', 'maxPrice', 'max_price', 'maxPriceValue'], format: formatCurrency },
]

function pick(item: OzonboxAnalyticsItem, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = item[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function nonEmptyError(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function analyticsLoadStatus(item: OzonboxAnalyticsItem): string {
  const variantError = nonEmptyError(item.ozonboxSellerVariantPackageError)
  const packageFactsError = nonEmptyError(item.ozonboxPackageFactsError)
  const errors = [
    variantError ? `Seller 变体包裹参数读取失败：${variantError}` : undefined,
    packageFactsError ? `后端包裹事实读取失败：${packageFactsError}` : undefined,
  ].filter((message): message is string => Boolean(message))
  return errors.length ? `已加载；${errors.join('；')}` : '已加载'
}

export function createAnalyticsIframe(
  id: string,
  type: OzonboxAnalyticsCardType,
  sku: string,
): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.id = id
  iframe.width = '100%'
  iframe.height = type === 'detail' ? '140' : '120'
  iframe.dataset.sku = sku
  iframe.dataset.type = type
  iframe.dataset.ozonboxAnalytics = 'true'
  iframe.style.border = '0'
  iframe.style.zIndex = '2147483646'
  iframe.style.overflow = 'hidden'
  if (type === 'detail') iframe.style.marginBottom = '8px'
  iframe.srcdoc = buildAnalyticsDoc(type, browser.runtime.getURL('/brand-logo.png'))
  return iframe
}

export function setAnalyticsStatus(iframe: HTMLIFrameElement, text: string): void {
  const doc = iframeDocument(iframe)
  const status = doc?.getElementById('status')
  const metrics = doc?.getElementById('metrics')
  if (status) status.textContent = text
  if (metrics) metrics.style.display = 'none'
  adjustHeight(iframe)
}

export function renderAnalyticsItem(
  iframe: HTMLIFrameElement,
  source: OzonboxAnalyticsItem,
): void {
  const doc = iframeDocument(iframe)
  const metrics = doc?.getElementById('metrics')
  const status = doc?.getElementById('status')
  if (!doc || !metrics) return
  metrics.replaceChildren()
  const item = normalizeAnalyticsItem(source)
  for (const field of FIELDS) {
    const value = pick(item, field.keys)
    if (value === undefined) continue
    const row = doc.createElement('div')
    row.className = `item${field.metricClass ? ` ${field.metricClass}` : ''}`
    const label = doc.createElement('span')
    label.className = 'label'
    label.textContent = `${field.label}:`
    const output = doc.createElement('span')
    output.className = 'value'
    output.textContent = field.format ? field.format(value, item) : String(value)
    row.append(label, output)
    metrics.append(row)
  }
  if (status) status.textContent = analyticsLoadStatus(item)
  metrics.style.display = 'flex'
  adjustHeight(iframe)
}

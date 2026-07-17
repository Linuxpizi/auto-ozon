import type { AutoCrawlConfig } from './autoCrawlFields'
import { categoryNeedsEnrichment, getExportConcurrency, getExportShopsRate, getExportSalesRate } from './autoCrawlFields'
import {
  shopsClawlerLimiter,
  newClawlerLimiter,
  SHOPS_CLAWLER_DEFAULT_RATE,
  NEW_CLAWLER_DEFAULT_RATE,
} from './requestRateLimiter'
import type { CrawlProductRecord } from './types'
import {
  fetchCrawlerSkuData,
  fetchOtherOffersSellers,
  fetchSkuPackagingAttributes,
  type CrawlerSkuData,
} from './crawlSkuApi'
import { commissionValue } from '../ozonListShared/formatters'
import { extractPriceUnit, parseOzonPriceNumber } from './exportPriceUtils'

export interface EnrichedCrawlRow {
  record: CrawlProductRecord
  follow?: string[]
  sales?: string[]
  weight?: string[]
  /** 选品规则导出分表匹配用 */
  skuData?: CrawlerSkuData | null
}

function formatCommissionTriple(comm: CrawlerSkuData['commission'], prefix: 'rfbs' | 'fbp'): string {
  if (!comm) return ''
  const keys = [`${prefix}1500`, `${prefix}1500To5000`, `${prefix}Greater5000`] as const
  return keys.map((k) => commissionValue(comm[k])).join(' / ')
}

function formatPercentOne(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  const n = parseFloat(String(v))
  if (!Number.isFinite(n)) return ''
  return `${(Math.floor(n * 10) / 10).toFixed(1)}%`
}

function formatCreateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`
  const days = Math.abs(Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
  return `${date} (已创建 ${days} 天)`
}

/** 跟卖列：走 Ozon otherOffersFromSellers，并将当前列表价纳入最低/最高比较 */
async function buildFollowCells(record: CrawlProductRecord): Promise<string[]> {
  const sellers = await fetchOtherOffersSellers(record.sku)
  if (!sellers?.length) return ['', '', '', '']
  const firstSeller = sellers[0]
  const lastSeller = sellers[sellers.length - 1]
  if (!firstSeller || !lastSeller) return ['', '', '', '']

  const origin = /ozon\.kz/i.test(window.location.hostname)
    ? 'https://www.ozon.kz'
    : 'https://www.ozon.ru'

  let priceMinSku = String(firstSeller.sku)
  let priceMaxSku = String(lastSeller.sku)
  let priceMin = firstSeller.price?.cardPrice?.price ?? firstSeller.price?.price ?? ''
  let priceMax = lastSeller.price?.cardPrice?.price ?? lastSeller.price?.price ?? ''

  const currentRub = parseOzonPriceNumber(record.price)
  const priceUnit = extractPriceUnit(String(priceMin || priceMax || ''))
  if (Number.isFinite(currentRub) && currentRub > 0) {
    const minNum = parseOzonPriceNumber(String(priceMin))
    const maxNum = parseOzonPriceNumber(String(priceMax))
    if (Number.isFinite(minNum) && currentRub < minNum) {
      priceMin = `${currentRub}${priceUnit ? ` ${priceUnit}` : ''}`
      priceMinSku = record.sku
    }
    if (Number.isFinite(maxNum) && currentRub > maxNum) {
      priceMax = `${currentRub}${priceUnit ? ` ${priceUnit}` : ''}`
      priceMaxSku = record.sku
    }
  }

  return [
    String(sellers.length),
    `${priceMin}/${priceMax}`,
    `${origin}/product/${priceMinSku}`,
    `${origin}/product/${priceMaxSku}`,
  ]
}

async function buildSalesCells(
  sku: string,
  data: CrawlerSkuData | null,
  shouldCancel?: () => boolean,
): Promise<string[]> {
  if (!data) return Array(28).fill('')

  let weeklySales = ''
  const weekly = await fetchCrawlerSkuData(sku, 'weekly', shouldCancel)
  if (weekly?.monthsales != null && weekly.monthsales !== '') {
    weeklySales = String(weekly.monthsales)
  }

  // index 12 为 conversionRate 占位（偏好 UI 未导出，但须与旧版 cells 索引对齐）
  return [
    data.article || '',
    data.brand || '',
    data.catname || '',
    formatCommissionTriple(data.commission, 'rfbs'),
    formatCommissionTriple(data.commission, 'fbp'),
    `${data.daysInPromo || 0}天`,
    `${data.daysWithTrafarets || 0}天`,
    `${data.gmvSum || 0}₽`,
    `${data.drr || 0}%`,
    weeklySales,
    String(data.monthsales ?? ''),
    data.salesDynamics || '',
    `${data.nullableRedemptionRate ?? 0}%`,
    String(data.views ?? ''),
    `${data.convViewToOrder || 0}%`,
    String(data.sessioncount ?? ''),
    `${data.convTocartPdp || 0}%`,
    `${data.discount || 0}%`,
    `${data.promoRevenueShare || 0}%`,
    String(data.volume ?? ''),
    `${data.avgprice || 0}₽`,
    data.sources || '',
    '',
    String(data.sessionCountSearch ?? ''),
    formatPercentOne(data.convToCartSearchRate),
    formatPercentOne(data.goodsClickRate),
    formatPercentOne(data.returnCancelRate),
    formatCreateTime(data.createDate),
  ]
}

function buildWeightCells(attrs: Array<{ key: string; value: string }> | null): string[] {
  if (!attrs) return ['', '', '', '']
  let length = ''
  let width = ''
  let height = ''
  let weight = ''
  for (const a of attrs) {
    if (a.key === '9454') length = a.value
    if (a.key === '9455') width = a.value
    if (a.key === '9456') height = a.value
    if (a.key === '4497') weight = a.value
  }
  return [length, width, height, weight]
}

async function enrichOne(
  record: CrawlProductRecord,
  config: AutoCrawlConfig,
  shouldCancel?: () => boolean,
): Promise<EnrichedCrawlRow> {
  const needFollow = categoryNeedsEnrichment('follow', config)
  const needSales = categoryNeedsEnrichment('sales', config)
  const needWeight = categoryNeedsEnrichment('weight', config)

  let skuData: CrawlerSkuData | null = null
  if (needSales) {
    skuData = await fetchCrawlerSkuData(record.sku, undefined, shouldCancel)
  }

  const follow = needFollow ? await buildFollowCells(record) : undefined
  const sales = needSales ? await buildSalesCells(record.sku, skuData, shouldCancel) : undefined

  let weight: string[] | undefined
  if (needWeight) {
    const attrs = await fetchSkuPackagingAttributes(record.sku, shouldCancel)
    weight = buildWeightCells(attrs)
  }

  return { record, follow, sales, weight, skuData }
}

const EXPORT_ROW_TIMEOUT_MS = 45000

/** 对齐旧版 processInBatches；超时/失败时 fallback 仍保留基础行 */
async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processItem: (item: T) => Promise<R | null>,
  updateProgress: (count: number) => void,
  fallback: (item: T) => R,
  isCancelled?: () => boolean,
): Promise<R[]> {
  const processed: R[] = []
  // 实际的请求速率由 requestRateLimiter 按接口平滑节流；这里的 batchSize 只用来限制
  // 「同时在途」的行数（防连接堆积、让每个请求的排队等待远小于 45s 行超时）。
  for (let i = 0; i < items.length; i += batchSize) {
    if (isCancelled?.()) break
    const batch = items.slice(i, i + batchSize)
    const requests = batch.map((item) =>
      Promise.race([
        processItem(item),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EXPORT_ROW_TIMEOUT_MS)),
      ]),
    )
    const results = await Promise.all(requests)
    if (isCancelled?.()) break
    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      processed.push(result ?? fallback(batch[j]))
      updateProgress(processed.length)
    }
  }
  return processed
}

/** 按偏好批量并发拉取扩展字段（对齐旧版 processInBatches + exportConcurrency） */
export async function enrichCrawlProductsForExport(
  records: CrawlProductRecord[],
  config: AutoCrawlConfig,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<EnrichedCrawlRow[]> {
  const total = records.length
  const needAsync =
    categoryNeedsEnrichment('follow', config) ||
    categoryNeedsEnrichment('sales', config) ||
    categoryNeedsEnrichment('weight', config)

  if (!needAsync) {
    const result: EnrichedCrawlRow[] = []
    for (let idx = 0; idx < total; idx++) {
      if (isCancelled?.()) break
      result.push({ record: records[idx] })
      if (idx % 10 === 0 || idx === total - 1) {
        onProgress?.(idx + 1, total)
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    return result
  }

  const batchSize = getExportConcurrency(config)
  // 按速度模式设定两个接口的目标速率（均 ≤ 服务端硬限），由共享限流器强制执行。
  // 用完复位到默认安全速率，供后续导出任务复用。
  shopsClawlerLimiter.setRate(getExportShopsRate(config))
  newClawlerLimiter.setRate(getExportSalesRate(config))
  try {
    return await processInBatches(
      records,
      batchSize,
      (record) => enrichOne(record, config, isCancelled),
      (done) => onProgress?.(done, total),
      (record) => ({ record }),
      isCancelled,
    )
  } finally {
    shopsClawlerLimiter.setRate(SHOPS_CLAWLER_DEFAULT_RATE)
    newClawlerLimiter.setRate(NEW_CLAWLER_DEFAULT_RATE)
  }
}

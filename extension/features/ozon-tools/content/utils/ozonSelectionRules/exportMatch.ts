import type { EnrichedCrawlRow } from '../ozonBatchCrawl/crawlExportEnricher'
import {
  extractPriceUnit,
  parseOzonPriceNumber,
  priceTextToCnyNumber,
  priceTextToRubNumber,
} from '../ozonBatchCrawl/exportPriceUtils'
import type { ExportMatchPayload } from './exportSheets'
import { resolveExportMatchPayload } from './exportSheets'
import type { OzonSkuCardData } from '../ozonList/types'

function parseDimNum(s?: string): number | undefined {
  const n = parseFloat(String(s || ''))
  return Number.isFinite(n) ? n : undefined
}

/** 爬取导出行 → 选品规则匹配上下文 */
export function buildExportMatchPayloadFromEnriched(row: EnrichedCrawlRow): ExportMatchPayload {
  const priceText = row.record.price || ''
  const exportCtx: ExportMatchPayload['exportCtx'] = {}
  const priceCny = priceTextToCnyNumber(priceText)
  const priceRub = priceTextToRubNumber(priceText)
  if (priceCny != null) exportCtx.priceCny = priceCny
  if (priceRub != null) exportCtx.priceRub = priceRub
  if (row.weight) {
    exportCtx.lengthMm = parseDimNum(row.weight[0])
    exportCtx.widthMm = parseDimNum(row.weight[1])
    exportCtx.heightMm = parseDimNum(row.weight[2])
    exportCtx.weightG = parseDimNum(row.weight[3])
  }
  const goodsData: Partial<OzonSkuCardData> = row.skuData ? { ...row.skuData } : {}
  // 跟卖导出列优先写入 gnumber/priceMin/priceMax，供选品规则分表匹配
  if (row.follow?.length) {
    const followCount = parseFloat(row.follow[0])
    if (Number.isFinite(followCount)) goodsData.gnumber = followCount
    const rangeStr = row.follow[1]
    if (rangeStr) {
      const parts = rangeStr.split('/')
      if (parts[0]) {
        const pMin = parseOzonPriceNumber(parts[0])
        if (Number.isFinite(pMin)) {
          goodsData.priceMin = pMin
          goodsData.followPriceUnit = extractPriceUnit(parts[0]) || goodsData.followPriceUnit || '₽'
        }
      }
      if (parts[1]) {
        const pMax = parseOzonPriceNumber(parts[1])
        if (Number.isFinite(pMax)) {
          goodsData.priceMax = pMax
          if (!goodsData.followPriceUnit) {
            goodsData.followPriceUnit = extractPriceUnit(parts[1]) || '₽'
          }
        }
      }
    }
  }

  return resolveExportMatchPayload(row.record.sku, {
    goodsData,
    priceText,
    exportCtx,
  })
}
